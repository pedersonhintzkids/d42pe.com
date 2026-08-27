import test from "node:test";
import assert from "node:assert/strict";
import { buildRsvpCsv, csvCell, neutralizeSpreadsheetFormula } from "../src/csv.js";

test("CSV cells use RFC 4180 quoting and neutralize spreadsheet formulas", () => {
  assert.equal(neutralizeSpreadsheetFormula("=SUM(1,1)"), "'=SUM(1,1)");
  assert.equal(csvCell('Dorian "D"'), '"Dorian ""D"""');
  assert.equal(csvCell("-2+3"), '"\'-2+3"');
});

test("RSVP CSV includes a BOM, headings, and safe values", () => {
  const csv = buildRsvpCsv([{
    id: "id-1",
    event_id: "event",
    name: "=HYPERLINK(\"bad\")",
    status: "started",
    created_at: "2026-08-27T00:00:00.000Z",
    sms_opened_at: null,
    sms_open_count: 0,
    confirmed_at: null,
    source: "direct",
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null
  }]);
  assert.ok(csv.startsWith("\uFEFF\"ID\",\"Event ID\""));
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.ok(csv.endsWith("\r\n"));
});
