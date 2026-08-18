#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "next-up", "index.html");
const flyerPath = path.join(root, "assets", "next-up", "d42pe-next-up-story.png");
const backgroundPath = path.join(root, "assets", "next-up", "concert-background.png");
const html = fs.readFileSync(htmlPath, "utf8");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const renderSource = fs.readFileSync(path.join(root, "tools", "render-next-up-story.cjs"), "utf8");
const checks = [];

function check(name, test) {
  test();
  checks.push(name);
}

function pngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(1, 4).toString(), "PNG", `${filePath} must be PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), bytes: data.length };
}

check("route is no-indexed and accessible from the homepage", () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/d42pe\.com\/next-up\/"/);
  assert.match(homepage, /<a class="cta cta-artist" href="\/next-up\/">ARTISTS: APPLY TO PERFORM<\/a>/);
});

check("route is artist-facing and uses the homepage palette", () => {
  assert.match(html, /<title>D42PE Artist Intake — Austin<\/title>/);
  assert.match(html, /Apply To Perform/i);
  assert.match(html, /Artists &amp; DJs • Austin/);
  assert.match(html, /assets\/next-up\/d42pe-next-up-story\.png/);
  for (const color of ["#07090d", "#0d1117", "#121720", "#f5f4ef", "#9ca5b2", "#586cff", "#7181ff", "#a9b4ff", "#252d39"]) {
    assert.ok(html.includes(color), `artist intake must include homepage color ${color}`);
  }
  assert.doesNotMatch(html, /#ff2f7d|#ff9ac3|#43c9ff|#070508/i);
  assert.doesNotMatch(html, /Austin Chooses|Proposed GA|\$20|Underground Rap Night|Rising DJ Night|Breakout Mix/i);
});

check("four-step form captures the focused artist application", () => {
  assert.equal((html.match(/data-step="[1-4]"/g) || []).length, 4);
  const requiredFields = [
    "stageName", "contact", "city", "genre", "socialLink", "clipLink",
    "availability", "expectedDraw", "terms", "promotion", "fitNote"
  ];
  for (const field of requiredFields) {
    assert.match(html, new RegExp(`<(?:input|select|textarea)[^>]*\\bname="${field}"[^>]*\\brequired\\b`));
  }
  assert.match(html, /Strongest live-performance or music clip link/i);
  assert.match(html, /Expected paid draw in Austin/i);
  assert.match(html, /Desired performance terms or fee/i);
  assert.match(html, /Promotion commitment if selected/i);
  assert.match(html, /Why would your act fit a D42PE Austin event/i);
  assert.doesNotMatch(html, /name="concept"|name="intent"|name="audience"|name="lastEvent"|name="factor"/i);
});

check("artist intake is transparent and does not claim a booking", () => {
  assert.match(html, /Artist intake concept test only/i);
  assert.match(html, /not a booking offer or agreement/i);
  assert.match(html, /No artist, event, date, venue, performance slot, fee, or payment is confirmed/i);
  assert.match(html, /No payment is collected/i);
  assert.match(html, /submitting does not enroll you in recurring automated texts/i);
  assert.doesNotMatch(html, /credit card|checkout|purchase now/i);
});

check("application flow uses existing D42PE SMS with source attribution", () => {
  assert.match(html, /sms:\+15126107851/);
  assert.match(html, /instagram/);
  assert.match(html, /snapchat/);
  assert.match(html, /direct/);
  assert.match(html, /D42PE NEXT UP — ARTIST APPLICATION/);
  assert.match(html, /Source: \$\{answers\.source\}/);
  for (const answer of [
    "stageName", "contact", "city", "genre", "socialLink", "clipLink",
    "availability", "expectedDraw", "terms", "promotion", "fitNote"
  ]) {
    assert.match(html, new RegExp(`answers\\.${answer}`));
  }
  assert.match(html, /Nothing is submitted until you press send in Messages/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|formspree|supabase|firebase/i);
});

check("required fields and direct links are validated before submission", () => {
  assert.match(html, /1: \["stageName", "contact", "city", "genre"\]/);
  assert.match(html, /2: \["socialLink", "clipLink"\]/);
  assert.match(html, /3: \["availability", "expectedDraw", "terms", "promotion", "fitNote"\]/);
  assert.match(html, /new URL\(value\(name\)\)/);
  assert.match(html, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
  assert.match(html, /Enter complete links beginning with http:\/\/ or https:\/\//);
});

check("inline script parses", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const scriptPath = path.join(os.tmpdir(), "d42pe-next-up-inline.js");
  fs.writeFileSync(scriptPath, scripts[0][1]);
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
  fs.unlinkSync(scriptPath);
});

check("artist-intake share asset and background are valid", () => {
  const flyer = pngDimensions(flyerPath);
  const background = pngDimensions(backgroundPath);
  assert.deepEqual([flyer.width, flyer.height], [1080, 1920]);
  assert.ok(flyer.bytes > 100_000, "artist-intake share asset should contain rendered artwork");
  assert.ok(background.width > 800 && background.height > 1400, "background should be portrait and high resolution");
  assert.match(renderSource, /ARTIST INTAKE/);
  assert.match(renderSource, /APPLY TO PERFORM/);
  assert.match(renderSource, /#586cff/i);
  assert.match(renderSource, /#a9b4ff/i);
  assert.doesNotMatch(renderSource, /AUSTIN CHOOSES|VOTE \+ RESPOND|PROPOSED GA|\$20/i);
});

process.stdout.write(JSON.stringify({ checks: checks.length, passed: checks.length, failures: 0 }, null, 2) + "\n");
