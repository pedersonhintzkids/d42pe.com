import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { handleRequest } from "../src/index.js";
import { NodeD1Database } from "../../tools/node-d1-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = await readFile(path.resolve(here, "../migrations/0001_rsvps.sql"), "utf8");
const productionOrigin = "https://d42pe.com";
const adminSecret = "test-organizer-secret-with-more-than-32-characters";

function createTestRateLimiter(maximum = 10_000) {
  const counts = new Map();
  return {
    calls: [],
    async limit({ key }) {
      this.calls.push(key);
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return { success: count <= maximum };
    }
  };
}

function createEnvironment(overrides = {}) {
  const DB = new NodeD1Database();
  DB.exec(migration);
  return {
    DB,
    RSVP_ADMIN_SECRET: adminSecret,
    RSVP_ALLOWED_ORIGINS: productionOrigin,
    RSVP_EVENT_ID: "ritual-x-2016-house-party-2026-08-29",
    RSVP_EDGE_RATE_LIMITER: createTestRateLimiter(),
    RSVP_ACTOR_RATE_LIMITER: createTestRateLimiter(),
    ...overrides
  };
}

function apiRequest(pathname, {
  method = "GET",
  token,
  admin = false,
  body,
  rawBody,
  origin = productionOrigin,
  ip = "203.0.113.10",
  extraHeaders = {}
} = {}) {
  const headers = new Headers({ "CF-Connecting-IP": ip });
  if (origin) headers.set("Origin", origin);
  if (token) headers.set("Authorization", `${admin ? "Bearer" : "RSVP"} ${token}`);
  if (body !== undefined || rawBody !== undefined) headers.set("Content-Type", "application/json");
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  const requestBody = rawBody === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : rawBody;
  return new Request(`https://rsvp-api.example${pathname}`, {
    method,
    headers,
    body: requestBody,
    ...(requestBody instanceof ReadableStream ? { duplex: "half" } : {})
  });
}

async function json(response) {
  return response.json();
}

test("health check verifies storage without returning RSVP data", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const response = await handleRequest(apiRequest("/healthz", { origin: "" }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true });
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
});

test("RSVP lifecycle is durable, token-protected, and idempotent", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const token = "A".repeat(43);
  const otherToken = "B".repeat(43);
  const body = {
    eventId: "ritual-x-2016-house-party-2026-08-29",
    name: "  Their   Name ",
    smsOpened: true,
    referrer: "https://instagram.com/story?private=1",
    source: "instagram",
    utm_campaign: "ritual-x"
  };

  const createdResponse = await handleRequest(apiRequest("/v1/rsvps", { method: "POST", token, body }), env);
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get("Access-Control-Allow-Origin"), productionOrigin);
  const created = await json(createdResponse);
  assert.equal(created.rsvp.name, "Their Name");
  assert.equal(created.rsvp.status, "started");
  assert.equal(created.rsvp.sms_open_count, 1);
  assert.ok(created.rsvp.sms_opened_at);
  assert.equal(created.rsvp.referrer, "https://instagram.com/story");
  assert.equal(created.replayed, false);

  const replayResponse = await handleRequest(apiRequest("/v1/rsvps", { method: "POST", token, body }), env);
  assert.equal(replayResponse.status, 200);
  const replay = await json(replayResponse);
  assert.equal(replay.rsvp.id, created.rsvp.id);
  assert.equal(replay.rsvp.sms_open_count, 1);
  assert.equal(replay.replayed, true);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM rsvps").first("count"), 1);

  const unauthorized = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}`, { token: otherToken }), env);
  assert.equal(unauthorized.status, 404);

  const editedResponse = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}`, {
    method: "PATCH",
    token,
    body: { name: "Their New Name" }
  }), env);
  assert.equal(editedResponse.status, 200);
  assert.equal((await json(editedResponse)).rsvp.name, "Their New Name");

  const reopenedResponse = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}/sms-open`, {
    method: "POST",
    token,
    body: {}
  }), env);
  assert.equal(reopenedResponse.status, 200);
  assert.equal((await json(reopenedResponse)).rsvp.sms_open_count, 2);

  const confirmResponse = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}/self-confirm`, {
    method: "POST",
    token,
    body: {}
  }), env);
  assert.equal(confirmResponse.status, 200);
  const confirmed = (await json(confirmResponse)).rsvp;
  assert.equal(confirmed.status, "self_confirmed");
  assert.ok(confirmed.confirmed_at);

  const repeatedConfirmResponse = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}/self-confirm`, {
    method: "POST",
    token,
    body: {}
  }), env);
  const repeatedConfirm = (await json(repeatedConfirmResponse)).rsvp;
  assert.equal(repeatedConfirm.confirmed_at, confirmed.confirmed_at);

  const rejectedEdit = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}`, {
    method: "PATCH",
    token,
    body: { name: "Should Not Replace" }
  }), env);
  assert.equal(rejectedEdit.status, 409);

  const clickResponse = await handleRequest(apiRequest(`/v1/rsvps/${created.rsvp.id}/clicks`, {
    method: "POST",
    token,
    body: { type: "d42pe_instagram" }
  }), env);
  assert.equal(clickResponse.status, 202);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM rsvp_events WHERE event_type = 'd42pe_instagram'").first("count"), 1);
});

test("admin list, filters, counts, and CSV stay server-protected", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const tokenOne = "C".repeat(43);
  const tokenTwo = "D".repeat(43);

  const first = await json(await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token: tokenOne,
    body: { eventId: env.RSVP_EVENT_ID, name: "Confirmed Guest", smsOpened: true }
  }), env));
  await handleRequest(apiRequest(`/v1/rsvps/${first.rsvp.id}/self-confirm`, { method: "POST", token: tokenOne, body: {} }), env);
  await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token: tokenTwo,
    body: { eventId: env.RSVP_EVENT_ID, name: "=SUM(1,1)", smsOpened: false, source: "direct" }
  }), env);

  const missing = await handleRequest(apiRequest("/v1/admin/rsvps"), env);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get("WWW-Authenticate"), "Bearer");

  const wrong = await handleRequest(apiRequest("/v1/admin/rsvps", { token: "wrong-secret", admin: true }), env);
  assert.equal(wrong.status, 401);

  const listResponse = await handleRequest(apiRequest("/v1/admin/rsvps?status=all", { token: adminSecret, admin: true }), env);
  assert.equal(listResponse.status, 200);
  const list = await json(listResponse);
  assert.deepEqual(list.counts, { total: 2, confirmed: 1, started: 1 });
  assert.equal(list.records.length, 2);

  const searchResponse = await handleRequest(apiRequest("/v1/admin/rsvps?status=self_confirmed&search=confirmed", { token: adminSecret, admin: true }), env);
  const search = await json(searchResponse);
  assert.equal(search.records.length, 1);
  assert.equal(search.records[0].name, "Confirmed Guest");

  const csvResponse = await handleRequest(apiRequest("/v1/admin/rsvps.csv?status=started", { token: adminSecret, admin: true }), env);
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get("Content-Disposition"), /attachment/);
  assert.match(await csvResponse.text(), /"'=SUM\(1,1\)"/);
});

test("admin search accepts long literal Unicode input and pagination never hides records", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const baseTime = Date.parse("2026-08-27T00:00:00.000Z");
  const longUnicodeName = "É".repeat(80);
  const insertedNames = [longUnicodeName, "Percent %_\\ Guest"];
  for (let index = 0; index < 252; index += 1) {
    const name = insertedNames[index] || `Pagination Guest ${String(index).padStart(3, "0")}`;
    const createdAt = new Date(baseTime).toISOString();
    await env.DB.prepare(`
      INSERT INTO rsvps (
        id, event_id, client_token_hash, name, name_search, status,
        created_at, updated_at, sms_open_count
      ) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, 0)
    `).bind(
      crypto.randomUUID(),
      env.RSVP_EVENT_ID,
      `pagination-token-${index}`,
      name,
      name.toLocaleLowerCase("en-US"),
      createdAt,
      createdAt
    ).run();
  }

  const unicodeSearch = encodeURIComponent("é".repeat(80));
  const unicodeResponse = await handleRequest(apiRequest(`/v1/admin/rsvps?search=${unicodeSearch}`, {
    token: adminSecret,
    admin: true
  }), env);
  assert.equal(unicodeResponse.status, 200);
  const unicodePayload = await json(unicodeResponse);
  assert.equal(unicodePayload.pagination.totalMatching, 1);
  assert.equal(unicodePayload.records[0].name, longUnicodeName);

  const literalSearch = encodeURIComponent("%_\\");
  const literalResponse = await handleRequest(apiRequest(`/v1/admin/rsvps?search=${literalSearch}`, {
    token: adminSecret,
    admin: true
  }), env);
  assert.equal(literalResponse.status, 200);
  assert.equal((await json(literalResponse)).records[0].name, "Percent %_\\ Guest");

  const ids = [];
  let cursor = "";
  do {
    const query = new URLSearchParams({ status: "all", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await handleRequest(apiRequest(`/v1/admin/rsvps?${query}`, {
      token: adminSecret,
      admin: true
    }), env);
    assert.equal(response.status, 200);
    const payload = await json(response);
    ids.push(...payload.records.map(record => record.id));
    assert.equal(payload.pagination.totalMatching, 252);
    cursor = payload.pagination.nextCursor || "";
    if (!payload.pagination.hasMore) break;
  } while (true);
  assert.equal(ids.length, 252);
  assert.equal(new Set(ids).size, 252);

  const badCursor = await handleRequest(apiRequest("/v1/admin/rsvps?cursor=not-a-real-cursor", {
    token: adminSecret,
    admin: true
  }), env);
  assert.equal(badCursor.status, 400);

  const csvResponse = await handleRequest(apiRequest("/v1/admin/rsvps.csv", {
    token: adminSecret,
    admin: true
  }), env);
  assert.equal(csvResponse.status, 200);
  const csvLines = (await csvResponse.text()).trimEnd().split("\r\n");
  assert.equal(csvLines.length, 253);
});

test("D1 batches roll back RSVP state when an event write fails", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const existingToken = "R".repeat(43);
  const existing = await json(await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token: existingToken,
    body: { eventId: env.RSVP_EVENT_ID, name: "Desktop Guest", smsOpened: false }
  }), env));

  env.DB.exec(`
    CREATE TRIGGER fail_sms_event
    BEFORE INSERT ON rsvp_events
    WHEN NEW.event_type = 'sms_opened'
    BEGIN
      SELECT RAISE(ABORT, 'forced event failure');
    END;
  `);

  const failedOpen = await handleRequest(apiRequest(`/v1/rsvps/${existing.rsvp.id}/sms-open`, {
    method: "POST",
    token: existingToken,
    body: {}
  }), env);
  assert.equal(failedOpen.status, 500);
  const unchanged = await env.DB.prepare("SELECT sms_opened_at, sms_open_count FROM rsvps WHERE id = ?")
    .bind(existing.rsvp.id)
    .first();
  assert.equal(unchanged.sms_opened_at, null);
  assert.equal(unchanged.sms_open_count, 0);

  const newToken = "S".repeat(43);
  const failedCreate = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token: newToken,
    body: { eventId: env.RSVP_EVENT_ID, name: "Atomic Guest", smsOpened: true }
  }), env);
  assert.equal(failedCreate.status, 500);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM rsvps WHERE name = 'Atomic Guest'").first("count"), 0);
});

test("server rejects bad origins, invalid names, oversized bodies, and abusive rates", async t => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const token = "E".repeat(43);
  const validBody = { eventId: env.RSVP_EVENT_ID, name: "Valid Guest", smsOpened: false };

  const badOrigin = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    body: validBody,
    origin: "https://evil.example"
  }), env);
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.headers.get("Access-Control-Allow-Origin"), null);

  const invalid = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    body: { ...validBody, name: "A" },
    ip: "203.0.113.11"
  }), env);
  assert.equal(invalid.status, 400);

  const declaredOversized = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    rawBody: "{}",
    ip: "203.0.113.13",
    extraHeaders: { "Content-Length": "8193" }
  }), env);
  assert.equal(declaredOversized.status, 413);

  let streamCancelled = false;
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"padding":"${"x".repeat(9_000)}`));
      controller.enqueue(new TextEncoder().encode('"}'));
    },
    cancel() {
      streamCancelled = true;
    }
  });
  const chunkedOversized = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    rawBody: oversizedStream,
    ip: "203.0.113.14"
  }), env);
  assert.equal(chunkedOversized.status, 413);
  assert.equal(streamCancelled, true);

  const rateEnv = createEnvironment({ RSVP_ACTOR_RATE_LIMITER: createTestRateLimiter(1) });
  t.after(() => rateEnv.DB.close());

  const first = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    body: validBody,
    ip: "203.0.113.12"
  }), rateEnv);
  assert.equal(first.status, 201);
  const limited = await handleRequest(apiRequest("/v1/rsvps", {
    method: "POST",
    token,
    body: validBody,
    ip: "203.0.113.12"
  }), rateEnv);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("Retry-After")) > 0);

  const edgeEnv = createEnvironment({ RSVP_EDGE_RATE_LIMITER: createTestRateLimiter(1) });
  t.after(() => edgeEnv.DB.close());
  assert.equal((await handleRequest(apiRequest("/healthz", { origin: "", ip: "203.0.113.30" }), edgeEnv)).status, 200);
  assert.equal((await handleRequest(apiRequest("/healthz", { origin: "", ip: "203.0.113.30" }), edgeEnv)).status, 429);
});
