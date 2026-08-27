import { isAdminAuthorized, sha256Hex } from "./auth.js";
import { buildRsvpCsv } from "./csv.js";
import {
  CLICK_TYPES,
  CLIENT_TOKEN_PATTERN,
  EVENT_ID,
  UUID_PATTERN,
  normalizeSearch,
  readClientToken,
  sanitizeAttribution,
  validateName
} from "./validation.js";

const MAX_JSON_BYTES = 8_192;
const ADMIN_DEFAULT_PAGE_SIZE = 100;
const ADMIN_MAX_PAGE_SIZE = 250;
const RATE_LIMIT_RETRY_SECONDS = 60;

const RECORD_COLUMNS = `
  id, event_id, name, status, created_at, updated_at,
  sms_opened_at, confirmed_at, sms_open_count,
  referrer, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content
`;

export class ApiError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.headers = headers;
  }
}

function allowedOrigins(env) {
  return new Set(String(env.RSVP_ALLOWED_ORIGINS || "https://d42pe.com")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean));
}

function requestOrigin(request) {
  return (request.headers.get("Origin") || "").replace(/\/$/, "");
}

function originIsAllowed(request, env) {
  const origin = requestOrigin(request);
  return !origin || allowedOrigins(env).has(origin);
}

function responseHeaders(request, env, extra = {}) {
  const headers = new Headers(extra);
  const origin = requestOrigin(request);
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Expose-Headers", "Content-Disposition, Retry-After");
  }
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.append("Vary", "Origin");
  return headers;
}

function jsonResponse(request, env, payload, status = 200, extraHeaders = {}) {
  const headers = responseHeaders(request, env, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function requireDb(env) {
  if (!env.DB?.prepare || typeof env.DB.batch !== "function") {
    throw new ApiError(503, "RSVP storage is not configured.");
  }
  return env.DB;
}

function requireAllowedOrigin(request, env) {
  if (!originIsAllowed(request, env)) throw new ApiError(403, "Origin is not allowed.");
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json\b/i.test(contentType)) throw new ApiError(415, "Send a JSON request body.");

  const declaredHeader = request.headers.get("Content-Length");
  if (declaredHeader !== null) {
    const declaredLength = Number(declaredHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new ApiError(400, "Request body length is invalid.");
    }
    if (declaredLength > MAX_JSON_BYTES) {
      await request.body?.cancel("Request body is too large.").catch(() => {});
      throw new ApiError(413, "Request body is too large.");
    }
  }

  const reader = request.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytesRead = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > MAX_JSON_BYTES) {
          await reader.cancel("Request body is too large.").catch(() => {});
          throw new ApiError(413, "Request body is too large.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "Request body must be valid UTF-8 JSON.");
    } finally {
      reader.releaseLock();
    }
  }

  try {
    const value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

function requestIp(request) {
  const ip = (request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown")
    .split(",")[0]
    .trim();
  return ip || "unknown";
}

async function actorRateLimitKey(request, scope) {
  const authorization = request.headers.get("Authorization") || "";
  const recognizedCredential = CLIENT_TOKEN_PATTERN.test(authorization.replace(/^RSVP /, "")) ||
    (/^Bearer .{1,512}$/.test(authorization));
  if (recognizedCredential) {
    return `${scope}:credential:${await sha256Hex(authorization)}`;
  }
  return `${scope}:anonymous:${await sha256Hex(requestIp(request))}`;
}

async function enforceRateLimit(request, env, scope) {
  const edgeLimiter = env.RSVP_EDGE_RATE_LIMITER;
  const actorLimiter = env.RSVP_ACTOR_RATE_LIMITER;
  if (typeof edgeLimiter?.limit !== "function" || typeof actorLimiter?.limit !== "function") {
    throw new ApiError(503, "RSVP rate limiting is not configured.");
  }

  const actorKey = await actorRateLimitKey(request, scope);
  const [edgeResult, actorResult] = await Promise.all([
    edgeLimiter.limit({ key: `edge:${requestIp(request)}` }),
    actorLimiter.limit({ key: actorKey })
  ]);
  if (!edgeResult?.success || !actorResult?.success) {
    throw new ApiError(429, "Too many requests. Please wait and try again.", {
      "Retry-After": String(RATE_LIMIT_RETRY_SECONDS)
    });
  }
}

async function clientIdentity(request) {
  const token = readClientToken(request);
  if (!CLIENT_TOKEN_PATTERN.test(token)) throw new ApiError(401, "RSVP session is missing or invalid.");
  return { token, tokenHash: await sha256Hex(token) };
}

async function findOwnedRsvp(db, id, tokenHash) {
  if (!UUID_PATTERN.test(id)) return null;
  return db.prepare(`SELECT ${RECORD_COLUMNS} FROM rsvps WHERE id = ? AND client_token_hash = ?`)
    .bind(id, tokenHash)
    .first();
}

async function createRsvp(request, env) {
  requireAllowedOrigin(request, env);
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const body = await readJson(request);
  const configuredEvent = env.RSVP_EVENT_ID || EVENT_ID;
  if (body.eventId !== configuredEvent || configuredEvent !== EVENT_ID) {
    throw new ApiError(400, "This RSVP event is not available.");
  }
  const nameResult = validateName(body.name);
  if (!nameResult.ok) throw new ApiError(400, nameResult.error);
  const attribution = sanitizeAttribution(body);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const smsOpened = body.smsOpened === true;
  const initialSmsEventId = await sha256Hex(`initial-sms:${configuredEvent}:${tokenHash}`);
  const [insertion] = await db.batch([
    db.prepare(`
    INSERT INTO rsvps (
      id, event_id, client_token_hash, name, name_search, status,
      created_at, updated_at, sms_opened_at, confirmed_at, sms_open_count,
      referrer, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content
    ) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id, client_token_hash) DO NOTHING
    `).bind(
      id,
      configuredEvent,
      tokenHash,
      nameResult.name,
      nameResult.name.toLocaleLowerCase("en-US"),
      now,
      now,
      smsOpened ? now : null,
      smsOpened ? 1 : 0,
      attribution.referrer,
      attribution.source,
      attribution.utm_source,
      attribution.utm_medium,
      attribution.utm_campaign,
      attribution.utm_term,
      attribution.utm_content
    ),
    db.prepare(`
      UPDATE rsvps
      SET
        name = CASE WHEN status = 'started' THEN ? ELSE name END,
        name_search = CASE WHEN status = 'started' THEN ? ELSE name_search END,
        sms_opened_at = CASE
          WHEN status = 'started' AND ? = 1 THEN COALESCE(sms_opened_at, ?)
          ELSE sms_opened_at
        END,
        sms_open_count = CASE
          WHEN status = 'started' AND ? = 1 AND sms_opened_at IS NULL THEN MAX(sms_open_count, 1)
          ELSE sms_open_count
        END,
        updated_at = CASE
          WHEN status = 'started' AND (name <> ? OR (? = 1 AND sms_opened_at IS NULL)) THEN ?
          ELSE updated_at
        END
      WHERE event_id = ? AND client_token_hash = ?
    `).bind(
      nameResult.name,
      nameResult.name.toLocaleLowerCase("en-US"),
      smsOpened ? 1 : 0,
      now,
      smsOpened ? 1 : 0,
      nameResult.name,
      smsOpened ? 1 : 0,
      now,
      configuredEvent,
      tokenHash
    ),
    db.prepare(`
      INSERT OR IGNORE INTO rsvp_events (id, rsvp_id, event_type, created_at)
      SELECT ?, id, 'sms_opened', ?
      FROM rsvps
      WHERE event_id = ? AND client_token_hash = ? AND ? = 1 AND sms_opened_at IS NOT NULL
    `).bind(initialSmsEventId, now, configuredEvent, tokenHash, smsOpened ? 1 : 0)
  ]);
  const created = Number(insertion?.meta?.changes || 0) > 0;
  const record = await db.prepare(`SELECT ${RECORD_COLUMNS} FROM rsvps WHERE event_id = ? AND client_token_hash = ?`)
    .bind(configuredEvent, tokenHash)
    .first();

  if (!record) throw new ApiError(500, "The RSVP could not be saved.");
  return jsonResponse(request, env, { rsvp: record, replayed: !created }, created ? 201 : 200);
}

async function getRsvp(request, env, id) {
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const record = await findOwnedRsvp(db, id, tokenHash);
  if (!record) throw new ApiError(404, "RSVP record was not found.");
  return jsonResponse(request, env, { rsvp: record });
}

async function editRsvp(request, env, id) {
  requireAllowedOrigin(request, env);
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const body = await readJson(request);
  const nameResult = validateName(body.name);
  if (!nameResult.ok) throw new ApiError(400, nameResult.error);
  const current = await findOwnedRsvp(db, id, tokenHash);
  if (!current) throw new ApiError(404, "RSVP record was not found.");
  if (current.status === "self_confirmed") throw new ApiError(409, "A confirmed RSVP cannot be renamed.");
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE rsvps SET name = ?, name_search = ?, updated_at = ?
    WHERE id = ? AND client_token_hash = ? AND status = 'started'
  `).bind(nameResult.name, nameResult.name.toLocaleLowerCase("en-US"), now, id, tokenHash).run();
  return jsonResponse(request, env, { rsvp: await findOwnedRsvp(db, id, tokenHash) });
}

async function markSmsOpened(request, env, id) {
  requireAllowedOrigin(request, env);
  await readJson(request);
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const current = await findOwnedRsvp(db, id, tokenHash);
  if (!current) throw new ApiError(404, "RSVP record was not found.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE rsvps
      SET sms_opened_at = COALESCE(sms_opened_at, ?), sms_open_count = sms_open_count + 1, updated_at = ?
      WHERE id = ? AND client_token_hash = ?
    `).bind(now, now, id, tokenHash),
    db.prepare("INSERT INTO rsvp_events (id, rsvp_id, event_type, created_at) VALUES (?, ?, 'sms_opened', ?)")
      .bind(crypto.randomUUID(), id, now)
  ]);
  return jsonResponse(request, env, { rsvp: await findOwnedRsvp(db, id, tokenHash) });
}

async function selfConfirm(request, env, id) {
  requireAllowedOrigin(request, env);
  await readJson(request);
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const current = await findOwnedRsvp(db, id, tokenHash);
  if (!current) throw new ApiError(404, "RSVP record was not found.");
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE rsvps
    SET status = 'self_confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ?
    WHERE id = ? AND client_token_hash = ?
  `).bind(now, now, id, tokenHash).run();
  return jsonResponse(request, env, { rsvp: await findOwnedRsvp(db, id, tokenHash) });
}

async function trackClick(request, env, id) {
  requireAllowedOrigin(request, env);
  const body = await readJson(request);
  if (!CLICK_TYPES.has(body.type)) throw new ApiError(400, "Unknown outbound link type.");
  const db = requireDb(env);
  const { tokenHash } = await clientIdentity(request);
  const current = await findOwnedRsvp(db, id, tokenHash);
  if (!current) throw new ApiError(404, "RSVP record was not found.");
  await db.prepare("INSERT INTO rsvp_events (id, rsvp_id, event_type, created_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, body.type, new Date().toISOString())
    .run();
  return jsonResponse(request, env, { tracked: true }, 202);
}

async function requireAdmin(request, env) {
  if (typeof env.RSVP_ADMIN_SECRET !== "string" || env.RSVP_ADMIN_SECRET.length < 32) {
    throw new ApiError(503, "Organizer access is not configured.");
  }
  if (!await isAdminAuthorized(request, env.RSVP_ADMIN_SECRET)) {
    throw new ApiError(401, "Organizer authorization failed.", { "WWW-Authenticate": "Bearer" });
  }
}

function decodeCursor(value) {
  if (!value) return null;
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError(400, "RSVP page cursor is invalid.");
  }
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const [createdAt, id] = JSON.parse(atob(base64));
    if (typeof createdAt !== "string" || createdAt.length > 40 || Number.isNaN(Date.parse(createdAt)) || !UUID_PATTERN.test(id)) {
      throw new Error("invalid cursor values");
    }
    return { createdAt, id };
  } catch {
    throw new ApiError(400, "RSVP page cursor is invalid.");
  }
}

function encodeCursor(record) {
  return btoa(JSON.stringify([record.created_at, record.id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function adminFilters(url, { paginated = true } = {}) {
  const status = url.searchParams.get("status") || "all";
  if (!["all", "started", "self_confirmed"].includes(status)) throw new ApiError(400, "Unknown RSVP status filter.");
  const search = normalizeSearch(url.searchParams.get("search") || "");
  if (!paginated) return { status, search };

  const requestedLimit = url.searchParams.get("limit");
  if (requestedLimit !== null && !/^\d+$/.test(requestedLimit)) {
    throw new ApiError(400, "RSVP page size is invalid.");
  }
  const parsedLimit = requestedLimit === null ? ADMIN_DEFAULT_PAGE_SIZE : Number(requestedLimit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > ADMIN_MAX_PAGE_SIZE) {
    throw new ApiError(400, `RSVP page size must be between 1 and ${ADMIN_MAX_PAGE_SIZE}.`);
  }
  return {
    status,
    search,
    limit: parsedLimit,
    cursor: decodeCursor(url.searchParams.get("cursor") || "")
  };
}

function adminWhere(eventId, filters, { includeCursor = false } = {}) {
  const where = ["event_id = ?"];
  const values = [eventId];
  if (filters.status !== "all") {
    where.push("status = ?");
    values.push(filters.status);
  }
  if (filters.search) {
    where.push("instr(name_search, ?) > 0");
    values.push(filters.search);
  }
  if (includeCursor && filters.cursor) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    values.push(filters.cursor.createdAt, filters.cursor.createdAt, filters.cursor.id);
  }
  return { where, values };
}

async function queryAdminRecords(db, eventId, filters, { limit = null, includeCursor = false } = {}) {
  const { where, values } = adminWhere(eventId, filters, { includeCursor });
  const limitSql = limit === null ? "" : "LIMIT ?";
  if (limit !== null) values.push(limit);
  const statement = db.prepare(`
    SELECT ${RECORD_COLUMNS}
    FROM rsvps
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    ${limitSql}
  `).bind(...values);
  const result = await statement.all();
  return result.results || [];
}

async function adminList(request, env) {
  requireAllowedOrigin(request, env);
  await requireAdmin(request, env);
  const db = requireDb(env);
  const eventId = env.RSVP_EVENT_ID || EVENT_ID;
  const filters = adminFilters(new URL(request.url));
  const [pageResults, counts, matching] = await Promise.all([
    queryAdminRecords(db, eventId, filters, { limit: filters.limit + 1, includeCursor: true }),
    db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'self_confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status = 'started' THEN 1 ELSE 0 END) AS started
      FROM rsvps WHERE event_id = ?
    `).bind(eventId).first(),
    (() => {
      const { where, values } = adminWhere(eventId, filters);
      return db.prepare(`SELECT COUNT(*) AS count FROM rsvps WHERE ${where.join(" AND ")}`)
        .bind(...values)
        .first();
    })()
  ]);
  const hasMore = pageResults.length > filters.limit;
  const records = pageResults.slice(0, filters.limit);
  const lastRecord = records.at(-1);
  return jsonResponse(request, env, {
    counts: {
      total: Number(counts?.total || 0),
      confirmed: Number(counts?.confirmed || 0),
      started: Number(counts?.started || 0)
    },
    filters: { status: filters.status, search: filters.search },
    pagination: {
      limit: filters.limit,
      returned: records.length,
      totalMatching: Number(matching?.count || 0),
      hasMore,
      nextCursor: hasMore && lastRecord ? encodeCursor(lastRecord) : null
    },
    records
  });
}

async function adminCsv(request, env) {
  requireAllowedOrigin(request, env);
  await requireAdmin(request, env);
  const db = requireDb(env);
  const eventId = env.RSVP_EVENT_ID || EVENT_ID;
  const filters = adminFilters(new URL(request.url), { paginated: false });
  const records = await queryAdminRecords(db, eventId, filters);
  const headers = responseHeaders(request, env, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"d42pe-ritual-x-rsvps.csv\""
  });
  return new Response(buildRsvpCsv(records), { status: 200, headers });
}

async function health(request, env) {
  const db = requireDb(env);
  const result = await db.prepare("SELECT 1 AS ok").first();
  return jsonResponse(request, env, { ok: Number(result?.ok) === 1 });
}

function rateLimitScope(method, path) {
  if (path === "/healthz") return "health";
  if (path.startsWith("/v1/admin/")) return "admin";
  if (path.endsWith("/clicks")) return "click";
  if (method === "GET") return "read";
  if (method === "POST" && path === "/v1/rsvps") return "create";
  return "mutation";
}

export async function handleRequest(request, env = {}, context = {}) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      if (!originIsAllowed(request, env)) throw new ApiError(403, "Origin is not allowed.");
      return new Response(null, { status: 204, headers: responseHeaders(request, env) });
    }

    if (path.startsWith("/v1/")) requireAllowedOrigin(request, env);
    await enforceRateLimit(request, env, rateLimitScope(request.method, path));

    if (request.method === "GET" && path === "/healthz") return await health(request, env);
    if (request.method === "POST" && path === "/v1/rsvps") return await createRsvp(request, env);
    if (request.method === "GET" && path === "/v1/admin/rsvps") return await adminList(request, env);
    if (request.method === "GET" && path === "/v1/admin/rsvps.csv") return await adminCsv(request, env);

    let match = path.match(/^\/v1\/rsvps\/([^/]+)$/);
    if (match && request.method === "GET") return await getRsvp(request, env, match[1]);
    if (match && request.method === "PATCH") return await editRsvp(request, env, match[1]);

    match = path.match(/^\/v1\/rsvps\/([^/]+)\/sms-open$/);
    if (match && request.method === "POST") return await markSmsOpened(request, env, match[1]);

    match = path.match(/^\/v1\/rsvps\/([^/]+)\/self-confirm$/);
    if (match && request.method === "POST") return await selfConfirm(request, env, match[1]);

    match = path.match(/^\/v1\/rsvps\/([^/]+)\/clicks$/);
    if (match && request.method === "POST") return await trackClick(request, env, match[1]);

    throw new ApiError(404, "Endpoint not found.");
  } catch (error) {
    const known = error instanceof ApiError;
    if (!known) {
      console.error("rsvp_api_error", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        message: error?.message || "unknown"
      });
    }
    const status = known ? error.status : 500;
    const message = known ? error.message : "The RSVP service encountered an unexpected error.";
    const extraHeaders = known ? error.headers : {};
    return jsonResponse(request, env, { error: message, requestId }, status, extraHeaders);
  }
}

export default {
  fetch(request, env, context) {
    return handleRequest(request, env, context);
  }
};
