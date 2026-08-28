import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SMS_NUMBER,
  buildSmsMessage,
  buildSmsUri,
  captureAttribution,
  createEmptyState,
  editRsvpState,
  parseStoredState,
  reconcileRsvpState,
  recordSmsHandoff,
  resolveApiBase,
  selfConfirmRsvp,
  validateName
} from "../rsvp/rsvp-core.js";
import {
  applyAdminListResponse,
  beginAdminListRequest,
  buildAdminQuery,
  createAdminListState,
  invalidateAdminListState
} from "../rsvp/admin/admin-core.js";

const attendeeState = Object.freeze({
  version: 1,
  clientToken: "A".repeat(43),
  rsvpId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Their Name",
  step: 2
});

test("name validation trims and collapses whitespace at the required limits", () => {
  assert.deepEqual(validateName("  Their   Name "), { ok: true, name: "Their Name", message: "" });
  assert.equal(validateName("A").ok, false);
  assert.equal(validateName("A".repeat(80)).ok, true);
  assert.equal(validateName("A".repeat(81)).ok, false);
});

test("SMS destination and message are exact on iOS and Android", () => {
  assert.equal(SMS_NUMBER, "+15126107851");
  assert.equal(buildSmsMessage("Their Name"), "RSVP - Their Name");
  assert.equal(
    buildSmsUri("Renée & DJ", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 1 }),
    "sms:+15126107851&body=RSVP%20-%20Ren%C3%A9e%20%26%20DJ"
  );
  assert.equal(
    buildSmsUri("Renée & DJ", { userAgent: "Android Mobile", platform: "Linux" }),
    "sms:+15126107851?body=RSVP%20-%20Ren%C3%A9e%20%26%20DJ"
  );
});

test("stored Step 2 and Step 3 state restores only with a valid ID and token", () => {
  const token = "A".repeat(43);
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const stepTwo = parseStoredState(JSON.stringify({ version: 1, clientToken: token, rsvpId: id, name: " Their  Name ", step: 2 }));
  assert.deepEqual(stepTwo, { version: 1, clientToken: token, rsvpId: id, name: "Their Name", step: 2 });
  const stepThree = parseStoredState(JSON.stringify({ version: 1, clientToken: token, rsvpId: id, name: " Confirmed  Guest ", step: 3 }));
  assert.deepEqual(stepThree, { version: 1, clientToken: token, rsvpId: id, name: "Confirmed Guest", step: 3 });
  assert.equal(parseStoredState(JSON.stringify({ version: 1, clientToken: "bad", rsvpId: id, name: "Their Name", step: 3 })), null);
  assert.equal(parseStoredState("not-json"), null);
});

test("new sessions use 256-bit tokens and attribution excludes query strings", () => {
  const cryptoLike = { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
  const state = createEmptyState(cryptoLike);
  assert.equal(state.clientToken.length, 43);
  assert.deepEqual(captureAttribution({ search: "?src=instagram&utm_campaign=ritual-x" }, "https://example.com/path?secret=1"), {
    referrer: "https://example.com/path",
    source: "instagram",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "ritual-x",
    utm_term: "",
    utm_content: ""
  });
});

test("API base is HTTPS in production and same-origin only on loopback", () => {
  assert.equal(resolveApiBase({ hostname: "127.0.0.1", origin: "http://127.0.0.1:4173" }, {}), "http://127.0.0.1:4173");
  assert.equal(resolveApiBase({ hostname: "d42pe.com", origin: "https://d42pe.com" }, {}), "");
  assert.equal(resolveApiBase({ hostname: "d42pe.com", origin: "https://d42pe.com" }, { apiBaseUrl: "https://rsvp.example.workers.dev/" }), "https://rsvp.example.workers.dev");
  assert.throws(() => resolveApiBase({ hostname: "d42pe.com", origin: "https://d42pe.com" }, { apiBaseUrl: "http://insecure.example" }));
});

test("restored attendee state reconciles to the durable status and editing preserves its identity", async () => {
  const started = await reconcileRsvpState(attendeeState, async path => {
    assert.equal(path, `/v1/rsvps/${attendeeState.rsvpId}`);
    return { rsvp: { name: "  Their   Name ", status: "started" } };
  });
  assert.deepEqual(started, attendeeState);

  const confirmed = await reconcileRsvpState(attendeeState, async () => ({
    rsvp: { name: "Renée", status: "self_confirmed" }
  }));
  assert.deepEqual(confirmed, { ...attendeeState, name: "Renée", step: 3 });

  const editing = editRsvpState(confirmed);
  assert.deepEqual(editing, { ...confirmed, step: 1 });
  assert.equal(editing.rsvpId, attendeeState.rsvpId);
  assert.equal(editing.clientToken, attendeeState.clientToken);
  assert.equal(confirmed.step, 3, "the transition must not mutate the prior state object");
});

test("self-confirmation changes state only after the exact persistence request succeeds", async () => {
  const calls = [];
  const confirmed = await selfConfirmRsvp(attendeeState, async (path, options) => {
    calls.push({ path, options });
    return { rsvp: { name: "  Their   Name " } };
  });
  assert.deepEqual(calls, [{
    path: `/v1/rsvps/${attendeeState.rsvpId}/self-confirm`,
    options: { method: "POST", body: {} }
  }]);
  assert.deepEqual(confirmed, { ...attendeeState, step: 3 });
  assert.equal(attendeeState.step, 2);

  const failure = new Error("offline");
  await assert.rejects(selfConfirmRsvp(attendeeState, async () => { throw failure; }), failure);
  assert.equal(attendeeState.step, 2, "a failed confirmation must leave the rendered step unchanged");
});

test("SMS handoff tracking is keepalive and never blocks the native text link", async () => {
  const calls = [];
  assert.equal(await recordSmsHandoff(attendeeState, async (path, options) => {
    calls.push({ path, options });
    return {};
  }), true);
  assert.deepEqual(calls, [{
    path: `/v1/rsvps/${attendeeState.rsvpId}/sms-open`,
    options: { method: "POST", body: {}, keepalive: true }
  }]);

  assert.equal(await recordSmsHandoff(attendeeState, async () => {
    throw new Error("analytics unavailable");
  }), false);
});

test("admin pagination keeps the submitted filter snapshot and rejects stale responses", () => {
  let state = createAdminListState();
  const first = beginAdminListRequest(state, {
    filters: { status: "self_confirmed", search: "  DJ Villa  " }
  });
  state = first.state;
  assert.deepEqual(first.request.filters, { status: "self_confirmed", search: "DJ Villa" });
  let result = applyAdminListResponse(state, first.request, {
    records: [{ id: "confirmed-1" }],
    counts: { confirmed: 2, started: 0, total: 2 },
    pagination: { hasMore: true, nextCursor: "cursor-confirmed-1", totalMatching: 2 }
  });
  assert.equal(result.applied, true);
  state = result.state;

  const append = beginAdminListRequest(state, {
    append: true,
    filters: { status: "started", search: "unsent form edit" }
  });
  state = append.state;
  assert.deepEqual(append.request.filters, { status: "self_confirmed", search: "DJ Villa" });
  assert.equal(append.request.cursor, "cursor-confirmed-1");

  const replacement = beginAdminListRequest(state, {
    filters: { status: "started", search: "New" }
  });
  state = replacement.state;
  result = applyAdminListResponse(state, replacement.request, {
    records: [{ id: "started-new" }],
    counts: { confirmed: 0, started: 1, total: 1 },
    pagination: { hasMore: false, nextCursor: "", totalMatching: 1 }
  });
  state = result.state;
  assert.deepEqual(state.loadedRecords, [{ id: "started-new" }]);
  assert.deepEqual(state.activeFilters, { status: "started", search: "New" });

  const stale = applyAdminListResponse(state, append.request, {
    records: [{ id: "confirmed-2" }],
    counts: { confirmed: 2, started: 0, total: 2 },
    pagination: { hasMore: false, nextCursor: "", totalMatching: 2 }
  });
  assert.equal(stale.applied, false);
  assert.equal(stale.state, state);
  assert.deepEqual(stale.state.loadedRecords, [{ id: "started-new" }]);
});

test("locking admin invalidates in-flight list work and export queries use active filters", () => {
  let state = createAdminListState();
  const inFlight = beginAdminListRequest(state, {
    filters: { status: "self_confirmed", search: "Renée & DJ" }
  });
  state = invalidateAdminListState(inFlight.state);
  const stale = applyAdminListResponse(state, inFlight.request, {
    records: [{ id: "must-not-render" }],
    counts: { confirmed: 1, started: 0, total: 1 },
    pagination: { hasMore: false }
  });
  assert.equal(stale.applied, false);
  assert.deepEqual(state.loadedRecords, []);
  assert.equal(
    buildAdminQuery({
      filters: { status: "self_confirmed", search: " Renée & DJ " },
      limit: "100",
      cursor: "cursor/2"
    }),
    "status=self_confirmed&search=Ren%C3%A9e+%26+DJ&limit=100&cursor=cursor%2F2"
  );
});

test("confirmation social clicks have the exact destination and tracking type", async () => {
  const html = await readFile(new URL("../rsvp/index.html", import.meta.url), "utf8");
  const confirmationMarkup = html.slice(html.indexOf('id="step-three"'));
  const anchors = confirmationMarkup.match(/<a\b[\s\S]*?<\/a>/gi) || [];
  const expected = [
    ["FOLLOW OFFICIAL HOST ON INSTAGRAM", "https://www.instagram.com/atxritualevents/", "official_host_instagram"],
    ["FOLLOW D42PE ON INSTAGRAM", "https://www.instagram.com/d42pe.events_atx/", "d42pe_instagram"],
    ["ADD D42PE ON SNAPCHAT", "https://www.snapchat.com/add/d42pe.atx", "d42pe_snapchat"]
  ];

  for (const [label, href, clickType] of expected) {
    const anchor = anchors.find(candidate => candidate.includes(`>${label}</a>`));
    assert.ok(anchor, `missing ${label}`);
    assert.ok(anchor.includes(`href="${href}"`), `${label} must open ${href}`);
    assert.ok(anchor.includes(`data-click-type="${clickType}"`), `${label} must track ${clickType}`);
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
  }
});
