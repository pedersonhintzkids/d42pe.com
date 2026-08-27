#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 42_000 + (process.pid % 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const adminSecret = "http-test-organizer-secret-more-than-32-characters";
const clientToken = "H".repeat(43);
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "d42pe-rsvp-http-"));
const databasePath = path.join(temporaryDirectory, "rsvp.sqlite");

const server = spawn(process.execPath, ["tools/rsvp-local-server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    D42PE_RSVP_PORT: String(port),
    D42PE_RSVP_DEV_DB: databasePath,
    RSVP_ADMIN_SECRET: adminSecret
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Preview server exited before startup:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The child process may still be binding the port.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Preview server did not start:\n${serverOutput}`);
}

function apiHeaders(authorization = `RSVP ${clientToken}`) {
  return {
    Accept: "application/json",
    Authorization: authorization,
    "Content-Type": "application/json",
    Origin: baseUrl
  };
}

async function stopServer() {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 3_000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

try {
  await waitForServer();

  for (const route of ["/rsvp", "/rsvp/", "/rsvp/admin", "/rsvp/admin/"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should render`);
    assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
  }

  const responsiveFlyer = await fetch(`${baseUrl}/assets/rsvp/ritual-x-2016-house-party-flyer-2026-08-29-720w.webp`);
  assert.equal(responsiveFlyer.status, 200);
  assert.equal(responsiveFlyer.headers.get("content-type"), "image/webp");
  assert.ok((await responsiveFlyer.arrayBuffer()).byteLength > 0);

  const createdResponse = await fetch(`${baseUrl}/v1/rsvps`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      eventId: "ritual-x-2016-house-party-2026-08-29",
      name: "  HTTP   QA Guest  ",
      smsOpened: false,
      source: "http-test"
    })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.rsvp.name, "HTTP QA Guest");
  assert.equal(created.rsvp.status, "started");

  const confirmedResponse = await fetch(`${baseUrl}/v1/rsvps/${created.rsvp.id}/self-confirm`, {
    method: "POST",
    headers: apiHeaders(),
    body: "{}"
  });
  assert.equal(confirmedResponse.status, 200);
  assert.equal((await confirmedResponse.json()).rsvp.status, "self_confirmed");

  const publicAdminResponse = await fetch(`${baseUrl}/v1/admin/rsvps`, {
    headers: { Origin: baseUrl }
  });
  assert.equal(publicAdminResponse.status, 401);

  const adminResponse = await fetch(`${baseUrl}/v1/admin/rsvps?status=self_confirmed&search=http`, {
    headers: { Authorization: `Bearer ${adminSecret}`, Origin: baseUrl }
  });
  assert.equal(adminResponse.status, 200);
  const admin = await adminResponse.json();
  assert.equal(admin.counts.total, 1);
  assert.equal(admin.counts.confirmed, 1);
  assert.equal(admin.pagination.totalMatching, 1);
  assert.equal(admin.records[0].name, "HTTP QA Guest");

  const csvResponse = await fetch(`${baseUrl}/v1/admin/rsvps.csv?status=self_confirmed`, {
    headers: { Authorization: `Bearer ${adminSecret}`, Origin: baseUrl }
  });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get("content-disposition") || "", /attachment/);
  assert.match(await csvResponse.text(), /"HTTP QA Guest"/);

  const crawler = spawn(process.execPath, ["tests/verify-crawler-metadata.cjs"], {
    cwd: root,
    env: { ...process.env, D42PE_BASE_URL: `${baseUrl}/` },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let crawlerOutput = "";
  crawler.stdout.setEncoding("utf8");
  crawler.stderr.setEncoding("utf8");
  crawler.stdout.on("data", chunk => { crawlerOutput += chunk; });
  crawler.stderr.on("data", chunk => { crawlerOutput += chunk; });
  const crawlerExit = await new Promise(resolve => crawler.once("exit", code => resolve(code)));
  assert.equal(crawlerExit, 0, crawlerOutput);

  process.stdout.write(JSON.stringify({ routes: 4, lifecycle: "passed", admin: "protected", csv: "passed", crawler: "15/15" }, null, 2) + "\n");
} finally {
  await stopServer();
}
