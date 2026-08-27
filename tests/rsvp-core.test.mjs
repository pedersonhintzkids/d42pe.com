import test from "node:test";
import assert from "node:assert/strict";
import {
  SMS_NUMBER,
  buildSmsMessage,
  buildSmsUri,
  captureAttribution,
  createEmptyState,
  parseStoredState,
  resolveApiBase,
  supportsNativeSms,
  validateName
} from "../rsvp/rsvp-core.js";

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
  assert.equal(supportsNativeSms({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 }), false);
});

test("stored Step 2 and Step 3 state restores only with a valid ID and token", () => {
  const token = "A".repeat(43);
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const stepTwo = parseStoredState(JSON.stringify({ version: 1, clientToken: token, rsvpId: id, name: " Their  Name ", step: 2 }));
  assert.deepEqual(stepTwo, { version: 1, clientToken: token, rsvpId: id, name: "Their Name", step: 2 });
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
