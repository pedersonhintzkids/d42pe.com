import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { handleRequest } from "../worker/src/index.js";
import { NodeD1Database } from "./node-d1-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.D42PE_RSVP_HOST || "127.0.0.1";
const port = Number(process.env.D42PE_RSVP_PORT || 4173);
const databasePath = process.env.D42PE_RSVP_DEV_DB || "/tmp/d42pe-rsvp-local.sqlite";
const migration = await readFile(path.join(root, "worker/migrations/0001_rsvps.sql"), "utf8");
const database = new NodeD1Database(databasePath);
database.exec(migration);

function createLocalRateLimiter(maximum = 5_000) {
  const counts = new Map();
  return {
    async limit({ key }) {
      const minute = Math.floor(Date.now() / 60_000);
      const bucket = `${minute}:${key}`;
      const count = (counts.get(bucket) || 0) + 1;
      counts.set(bucket, count);
      if (counts.size > 10_000) {
        for (const storedKey of counts.keys()) {
          if (!storedKey.startsWith(`${minute}:`)) counts.delete(storedKey);
        }
      }
      return { success: count <= maximum };
    }
  };
}

const env = {
  DB: database,
  RSVP_ADMIN_SECRET: process.env.RSVP_ADMIN_SECRET || "local-development-organizer-secret-0001",
  RSVP_ALLOWED_ORIGINS: process.env.RSVP_ALLOWED_ORIGINS || `http://${host}:${port}`,
  RSVP_EVENT_ID: "ritual-x-2016-house-party-2026-08-29",
  RSVP_EDGE_RATE_LIMITER: createLocalRateLimiter(),
  RSVP_ACTOR_RATE_LIMITER: createLocalRateLimiter()
};

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".xml", "application/xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function serveApi(nodeRequest, nodeResponse) {
  const body = ["GET", "HEAD"].includes(nodeRequest.method) ? undefined : await collectBody(nodeRequest);
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeRequest.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value != null) headers.set(name, value);
  }
  const request = new Request(`http://${nodeRequest.headers.host}${nodeRequest.url}`, {
    method: nodeRequest.method,
    headers,
    body: body?.length ? body : undefined
  });
  const response = await handleRequest(request, env);
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (nodeRequest.method === "HEAD") nodeResponse.end();
  else nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

async function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").some(segment => segment === ".." || segment.startsWith("."))) return null;
  const denied = ["/worker/", "/tests/", "/tools/", "/docs/", "/package.json", "/.env"];
  if (denied.some(prefix => decoded === prefix.replace(/\/$/, "") || decoded.startsWith(prefix))) return null;
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  try {
    const details = await stat(target);
    if (details.isDirectory()) return path.join(target, "index.html");
    return details.isFile() ? target : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/healthz" || url.pathname.startsWith("/v1/")) {
      await serveApi(request, response);
      return;
    }
    const target = await resolveStaticPath(url.pathname);
    if (!target) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const contents = await readFile(target);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Local preview error");
    console.error("local_preview_error", error.message);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`D42PE RSVP preview listening at http://${host}:${port}/rsvp/\n`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
