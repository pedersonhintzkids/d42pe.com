import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  normalizeSearch,
  sanitizeAttribution,
  validateName
} from "../src/validation.js";

test("normalizes chosen names without changing valid display punctuation", () => {
  assert.equal(normalizeName("  Dorian\t  O’Neil  "), "Dorian O’Neil");
  assert.deepEqual(validateName("  DJ   42  "), { ok: true, name: "DJ 42", error: "" });
  assert.equal(validateName("A").ok, false);
  assert.equal(validateName("x".repeat(81)).ok, false);
  assert.equal(validateName("--").ok, false);
  assert.equal(validateName("Valid\u0000Name").ok, false);
});

test("sanitizes referral and UTM values", () => {
  assert.deepEqual(sanitizeAttribution({
    referrer: "https://example.com/path?private=value#fragment",
    source: "  instagram  ",
    utm_source: "social"
  }), {
    referrer: "https://example.com/path",
    source: "instagram",
    utm_source: "social",
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null
  });
  assert.equal(sanitizeAttribution({ referrer: "javascript:alert(1)" }).referrer, null);
});

test("normalizes searches without assigning wildcard behavior", () => {
  assert.equal(normalizeSearch("  DORIAN   H  "), "dorian h");
  assert.equal(normalizeSearch("  50%_OFF\\today  "), "50%_off\\today");
});
