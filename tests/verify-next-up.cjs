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

check("route is isolated and no-indexed", () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/d42pe\.com\/next-up\/"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "index.html"), "utf8"), /\/next-up\//);
});

check("experiment has exact concept and price choices", () => {
  assert.equal((html.match(/name="concept"/g) || []).length, 3);
  assert.equal((html.match(/name="intent"/g) || []).length, 3);
  assert.match(html, /Underground Rap Night/);
  assert.match(html, /Rising DJ Night/);
  assert.match(html, /Breakout Mix/);
  assert.match(html, /Proposed GA[^<]*\$20/i);
  assert.match(html, /Join First Access at \$20/);
  assert.match(html, /No — Not at \$20/);
});

check("concept is transparent and does not collect payment", () => {
  assert.match(html, /Concept test only/i);
  assert.match(html, /No artist, event, date, or venue is confirmed/i);
  assert.match(html, /No payment is collected/i);
  assert.match(html, /does not purchase or reserve a ticket/i);
  assert.doesNotMatch(html, /type="(?:number|email|tel)"/i);
  assert.doesNotMatch(html, /credit card|checkout|purchase now/i);
});

check("response flow uses existing D42PE SMS with source attribution", () => {
  assert.match(html, /sms:\+15126107851/);
  assert.match(html, /instagram/);
  assert.match(html, /snapchat/);
  assert.match(html, /direct/);
  assert.match(html, /Source: \$\{answers\.source\}/);
  assert.match(html, /At \$20: \$\{answers\.intent\}/);
  assert.match(html, /Nothing is submitted until you press send in Messages/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|formspree|supabase|firebase/i);
});

check("required feedback context is present", () => {
  for (const required of ["audience", "lastEvent", "factor"]) {
    assert.match(html, new RegExp(`name="${required}"[^>]*required`));
  }
  assert.match(html, /what felt unclear, weak, or untrustworthy/i);
  assert.match(html, /one rising artist or DJ/i);
});

check("inline script parses", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const scriptPath = path.join(os.tmpdir(), "d42pe-next-up-inline.js");
  fs.writeFileSync(scriptPath, scripts[0][1]);
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
  fs.unlinkSync(scriptPath);
});

check("story and background assets are valid", () => {
  const flyer = pngDimensions(flyerPath);
  const background = pngDimensions(backgroundPath);
  assert.deepEqual([flyer.width, flyer.height], [1080, 1920]);
  assert.ok(flyer.bytes > 100_000, "story flyer should contain rendered artwork");
  assert.ok(background.width > 800 && background.height > 1400, "background should be portrait and high resolution");
});

process.stdout.write(JSON.stringify({ checks: checks.length, passed: checks.length, failures: 0 }, null, 2) + "\n");
