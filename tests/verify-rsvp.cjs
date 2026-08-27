#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("rsvp/index.html");
const css = read("rsvp/rsvp.css");
const client = read("rsvp/rsvp.js");
const core = read("rsvp/rsvp-core.js");
const config = read("rsvp/config.js");
const adminHtml = read("rsvp/admin/index.html");
const adminClient = read("rsvp/admin/admin.js");
const worker = read("worker/src/index.js");
const migration = read("worker/migrations/0001_rsvps.sql");
const flyerPath = path.join(root, "assets/rsvp/ritual-x-2016-house-party-flyer-2026-08-29.png");
const flyerWebp720Path = path.join(root, "assets/rsvp/ritual-x-2016-house-party-flyer-2026-08-29-720w.webp");
const flyerWebp1138Path = path.join(root, "assets/rsvp/ritual-x-2016-house-party-flyer-2026-08-29-1138w.webp");
const checks = [];

function check(name, callback) {
  callback();
  checks.push(name);
}

function pngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  return {
    data,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

function losslessWebpDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 4).toString(), "RIFF");
  assert.equal(data.subarray(8, 12).toString(), "WEBP");
  assert.equal(data.subarray(12, 16).toString(), "VP8L");
  assert.equal(data[20], 0x2f);
  const dimensions = data.readUInt32LE(21);
  return {
    data,
    width: (dimensions & 0x3fff) + 1,
    height: ((dimensions >>> 14) & 0x3fff) + 1
  };
}

check("public route uses the exact supplied flyer without crop-prone markup", () => {
  const flyer = pngDimensions(flyerPath);
  const flyerWebp720 = losslessWebpDimensions(flyerWebp720Path);
  const flyerWebp1138 = losslessWebpDimensions(flyerWebp1138Path);
  assert.deepEqual([flyer.width, flyer.height], [1138, 1382]);
  assert.equal(crypto.createHash("sha256").update(flyer.data).digest("hex"), "e10f75de0e26bf7d489d9ea4dbf1ee447605b7b9160672b041b30a722f8381b8");
  assert.deepEqual([flyerWebp720.width, flyerWebp720.height], [720, 874]);
  assert.deepEqual([flyerWebp1138.width, flyerWebp1138.height], [1138, 1382]);
  assert.equal(crypto.createHash("sha256").update(flyerWebp720.data).digest("hex"), "eca82ef50e9db0558d4fd74a2c13e9a44a736624c707b68ae64cf561f72d3cd3");
  assert.equal(crypto.createHash("sha256").update(flyerWebp1138.data).digest("hex"), "59699b448d1ba5503c5fbddc2e320bbdc06343d14a7653a7ac58eb0b086caeaf");
  assert.ok(flyerWebp720.data.length < flyer.data.length * 0.4);
  assert.ok(flyerWebp1138.data.length < flyer.data.length * 0.8);
  assert.match(html, /src="\/assets\/rsvp\/ritual-x-2016-house-party-flyer-2026-08-29\.png"/);
  assert.match(html, /<picture>[\s\S]*<source[\s\S]*type="image\/webp"[\s\S]*<img/);
  assert.match(html, /ritual-x-2016-house-party-flyer-2026-08-29-720w\.webp 720w/);
  assert.match(html, /ritual-x-2016-house-party-flyer-2026-08-29-1138w\.webp 1138w/);
  assert.match(html, /rel="preload"[\s\S]*type="image\/webp"[\s\S]*imagesrcset=/);
  assert.match(html, /width="1138"[\s\S]*height="1382"/);
  assert.match(css, /aspect-ratio:\s*569\s*\/\s*691/);
  assert.match(css, /object-fit:\s*contain/);
});

check("Step 1 order and official host copy are exact", () => {
  const flyerIndex = html.indexOf("event-flyer");
  const hostIndex = html.indexOf("OFFICIAL HOST");
  const fieldIndex = html.indexOf("YOUR NAME");
  const buttonIndex = html.indexOf("TEXT TO RSVP");
  assert.ok(flyerIndex < hostIndex && hostIndex < fieldIndex && fieldIndex < buttonIndex);
  assert.match(html, />RITUAL X</);
  assert.match(html, />@atxritualevents</);
  assert.match(html, /https:\/\/www\.instagram\.com\/atxritualevents\//);
  assert.match(html, /By sending this text, you agree to receive recurring automated event and promotional texts from D42PE\. Up to 4 msgs\/month\. Msg &amp; data rates may apply\. Reply STOP to unsubscribe or HELP for help\./);
});

check("only one attendee field is collected", () => {
  const form = html.match(/<form\b[^>]*id="rsvp-form"[^>]*>/i)?.[0] || "";
  const inputs = [...html.matchAll(/<input\b[\s\S]*?>/gi)].map(match => match[0]);
  assert.equal(inputs.length, 1);
  assert.match(form, /method="post"/i);
  assert.match(inputs[0], /id="rsvp-name"/);
  assert.doesNotMatch(inputs[0], /\bname=/i);
  assert.doesNotMatch(inputs[0], /type="(?:tel|email|date|number)"/i);
  assert.doesNotMatch(html, /name="(?:phone|email|address|birthday)"/i);
});

check("SMS destination, exact body, platform separators, and encoding are implemented", () => {
  assert.match(core, /SMS_NUMBER = "\+15126107851"/);
  assert.match(core, /`RSVP - \$\{result\.name\}`/);
  assert.match(core, /isIOSLike\(navigatorLike\) \? "&" : "\?"/);
  assert.match(core, /encodeURIComponent\(buildSmsMessage\(name\)\)/);
  assert.doesNotMatch(`${html}\n${client}\n${worker}`, /SimpleTexting|webhook|RSVP code|random code/i);
});

check("Step 2 and Step 3 required copy and actions are exact", () => {
  for (const text of [
    "SEND THE PREPARED TEXT, THEN RETURN HERE",
    "I SENT THE TEXT",
    "OPEN TEXT AGAIN",
    "EDIT NAME",
    "YOU’RE ON THE RSVP LIST",
    "RSVP confirmed for:",
    "FOLLOW OFFICIAL HOST ON INSTAGRAM",
    "CHECK HERE FOR FUTURE EVENTS + UPDATES",
    "FOLLOW D42PE ON INSTAGRAM",
    "ADD D42PE ON SNAPCHAT"
  ]) assert.ok(html.includes(text), `missing ${text}`);
  assert.match(client, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(`${client}\n${core}`, /self-confirm/);
  assert.match(client, /createOrUpdateStartedRsvp/);
});

check("all social destinations are exact and secure", () => {
  const expectedSocials = [
    ["FOLLOW OFFICIAL HOST ON INSTAGRAM", "https://www.instagram.com/atxritualevents/", "official_host_instagram"],
    ["FOLLOW D42PE ON INSTAGRAM", "https://www.instagram.com/d42pe.events_atx/", "d42pe_instagram"],
    ["ADD D42PE ON SNAPCHAT", "https://www.snapchat.com/add/d42pe.atx", "d42pe_snapchat"]
  ];
  for (const [label, href, clickType] of expectedSocials) {
    const anchor = (html.match(/<a\b[\s\S]*?<\/a>/gi) || []).find(candidate => candidate.includes(`>${label}</a>`));
    assert.ok(anchor, `missing ${label}`);
    assert.ok(anchor.includes(`href="${href}"`), `${label} has the wrong destination`);
    assert.ok(anchor.includes(`data-click-type="${clickType}"`), `${label} has the wrong click type`);
  }
  for (const anchor of html.match(/<a\b[\s\S]*?<\/a>/gi) || []) {
    if (/https:\/\/(?:www\.)?(?:instagram|snapchat)\.com/.test(anchor)) {
      assert.match(anchor, /target="_blank"/);
      assert.match(anchor, /rel="noopener noreferrer"/);
    }
  }
  const confirmationMarkup = html.slice(html.indexOf('id="step-three"'));
  for (const anchor of confirmationMarkup.match(/<a\b[\s\S]*?<\/a>/gi) || []) {
    if (/https:\/\/(?:www\.)?(?:instagram|snapchat)\.com/.test(anchor)) {
      assert.match(anchor, /data-click-type="(?:official_host_instagram|d42pe_instagram|d42pe_snapchat)"/);
    }
  }
});

check("banned event and branding copy is absent from the RSVP UI", () => {
  const visible = html.replace(/<head>[\s\S]*?<\/head>/i, "");
  for (const banned of ["Powered by D42PE", "512 Events", "house rules", "ticket price", "buy tickets", "start time", "address:"]) {
    assert.ok(!visible.toLowerCase().includes(banned.toLowerCase()), `must not contain ${banned}`);
  }
});

check("server implementation has durable schema, validation, idempotency, and rate limiting", () => {
  for (const column of [
    "client_token_hash", "name_search", "sms_opened_at", "confirmed_at", "referrer",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"
  ]) assert.ok(migration.includes(column), `migration missing ${column}`);
  assert.match(migration, /UNIQUE \(event_id, client_token_hash\)/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS rate_limits/);
  assert.match(worker, /ON CONFLICT\(event_id, client_token_hash\) DO NOTHING/);
  assert.match(worker, /prepared|prepare\(/i);
  assert.match(worker, /enforceRateLimit/);
  assert.match(worker, /RSVP_EDGE_RATE_LIMITER/);
  assert.match(worker, /RSVP_ACTOR_RATE_LIMITER/);
  assert.match(worker, /instr\(name_search, \?\) > 0/);
  assert.match(worker, /nextCursor/);
  assert.doesNotMatch(worker, /LIMIT 10_000|LIKE \? ESCAPE/);
  assert.match(worker, /status = 'self_confirmed'/);
});

check("organizer data and CSV are protected server-side", () => {
  const authForm = adminHtml.match(/<form\b[^>]*id="auth-form"[^>]*>/i)?.[0] || "";
  const secretInput = adminHtml.match(/<input\b[^>]*id="admin-secret"[^>]*>/i)?.[0] || "";
  assert.match(worker, /isAdminAuthorized/);
  assert.match(worker, /RSVP_ADMIN_SECRET/);
  assert.match(worker, /\/v1\/admin\/rsvps\.csv/);
  assert.match(worker, /Content-Disposition/);
  assert.match(authForm, /method="post"/i);
  assert.match(adminHtml, /type="password"/);
  assert.doesNotMatch(secretInput, /\bname=/i);
  assert.match(adminClient, /Authorization: `Bearer \$\{adminSecret\}`/);
  assert.doesNotMatch(`${adminHtml}\n${adminClient}`, /PASSCODE|4287|local-development-organizer-secret/);
  assert.doesNotMatch(adminClient, /localStorage|sessionStorage/);
});

check("production API configuration cannot silently fall back to GitHub Pages", () => {
  assert.match(config, /apiBaseUrl:\s*""/);
  assert.doesNotMatch(config, /localhost|127\.0\.0\.1|REPLACE_WITH/);
  assert.match(core, /\["localhost", "127\.0\.0\.1"\]/);
  assert.match(core, /return "";/);
});

check("route uses semantic controls, visible focus, reduced motion, and layout-shift protection", () => {
  assert.match(html, /<main/);
  assert.match(html, /<form[^>]*novalidate/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-labelledby/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid var\(--focus\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height:\s*3\.5rem/);

  for (const [fileName, markup] of [["attendee", html], ["admin", adminHtml]]) {
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    for (const match of markup.matchAll(/\b(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) {
      for (const id of match[1].trim().split(/\s+/)) {
        assert.ok(ids.has(id), `${fileName} has a broken ARIA ID reference: ${id}`);
      }
    }
    for (const match of markup.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) {
      assert.ok(ids.has(match[1]), `${fileName} has a broken label target: ${match[1]}`);
    }
  }
});

check("client scripts are external and CSP avoids unsafe inline execution", () => {
  const publicScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const adminScripts = [...adminHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(publicScripts.length, 2);
  assert.equal(adminScripts.length, 2);
  for (const [, attributes, body] of [...publicScripts, ...adminScripts]) {
    assert.match(attributes, /\bsrc="[^"]+"/);
    assert.equal(body.trim(), "");
  }
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});

process.stdout.write(JSON.stringify({ checks: checks.length, passed: checks.length, failures: 0 }, null, 2) + "\n");
