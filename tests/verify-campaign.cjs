#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const home = read("index.html");
const landing = read("halloweekend/index.html");
let checks = 0;
function check(name, run) { run(); checks++; }

for (const [route, html] of [["home", home], ["halloweekend", landing]]) {
  check(`${route}: Halloweekend identity and accessible structure remain intact`, () => {
    for (const copy of ["D42PE", "Halloweekend", "AUSTIN, TEXAS", "2026-10-30", "2026-10-31", "512 EVENTS", "RITUAL"]) {
      assert.ok(html.includes(copy), `${route} must contain ${copy}`);
    }
    assert.doesNotMatch(html, /<script[^>]+src="[^\"]*(?:campaign-launch|halloweekend\.js|vip\.js)/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /class="skip-link" href="#main"/);
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  });
}

check("the Halloweekend route retains the paused promotion state", () => {
  assert.doesNotMatch(landing, /universe\.com|ACL After Party|official-flyer|flyer-480|flyer-840|data-ticket|data-share|data-download|data-open-flyer|mobile-ticket|href="\/vip\//i);
  assert.doesNotMatch(landing, /drop\.js|drop\.css|data-countdown|data-before-drop|data-after-drop/);
});

check("the homepage loads the isolated October 15 countdown and reveal", () => {
  assert.match(home, /<body\b[^>]*class="[^"]*\bupdates-only\b[^\"]*\bdrop-page\b[^\"]*"[^>]*data-phase="checking"/);
  assert.match(home, /<link\b[^>]*href="\/halloweekend\/drop\.css\?v=20261015-1"/);
  const scripts = [...home.matchAll(/<script\b([^>]*\bsrc="([^"]+)"[^>]*)>/g)];
  assert.equal(scripts.length, 1, "root should load only the isolated drop module");
  assert.equal(scripts[0][2], "/halloweekend/drop.js?v=20261015-1");
  assert.match(scripts[0][1], /\btype="module"/);
  assert.match(home, /\bdata-countdown\b/);
  assert.match(home, /\bdata-before-drop\b/);
  const liveSections = [...home.matchAll(/<[^!][^>]*\bdata-after-drop\b[^>]*>/g)];
  assert.ok(liveSections.length > 0, "root needs a live-only state");
  for (const [tag] of liveSections) assert.match(tag, /\shidden(?:\s|=|>)/, "live-only sections start hidden");
  assert.doesNotMatch(home, /ACL After Party|href="\/vip\//i);
});

check("the homepage has no active ticket destination or flyer image before the drop", () => {
  const ticketAnchors = [...home.matchAll(/<a\b([^>]*\bdata-ticket\b[^>]*)>/g)];
  assert.ok(ticketAnchors.length > 0, "root needs ticket actions for the live state");
  for (const [, attrs] of ticketAnchors) assert.doesNotMatch(attrs, /(?:^|\s)href=/, "ticket destinations are assigned only at launch");
  const flyerImages = [...home.matchAll(/<img\b([^>]*\bdata-flyer-image\b[^>]*)>/g)];
  assert.equal(flyerImages.length, 1);
  assert.match(flyerImages[0][1], /\bdata-src="\/assets\/halloweekend\/official-flyer\.png"/);
  assert.doesNotMatch(flyerImages[0][1], /(?:^|\s)src=/, "flyer image starts unloaded");
  assert.match(home, /<a\b[^>]*href="\/assets\/halloweekend\/official-flyer\.png"[^>]*\bdownload(?:[\s=>])/);
  const sources = [...home.matchAll(/<source\b([^>]*)>/g)];
  assert.ok(sources.length > 0, "flyer should have responsive web thumbnails");
  for (const [, attrs] of sources) {
    assert.doesNotMatch(attrs, /(?:^|\s)srcset=/, "responsive flyer sources start unloaded");
    assert.match(attrs, /\bdata-srcset="[^"]*\/assets\/halloweekend\/flyer-\d+\.webp/);
  }
});

check("old event and ticket routes return visitors to Halloweekend", () => {
  for (const route of ["acl/index.html", "tickets/index.html", "vip/index.html"]) {
    const html = read(route);
    assert.match(html, /http-equiv="refresh" content="0;\s*url=\/halloweekend\/"/i);
    assert.match(html, /href="\/halloweekend\/"/);
    assert.doesNotMatch(html, /universe\.com|ACL After Party|official-flyer|flyer-480|GET TICKETS|<img\b/i);
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  }
});

check("retained campaign media are local and match intrinsic dimensions", () => {
  for (const html of [home, landing]) {
    for (const match of html.matchAll(/<img\b([^>]+)>/g)) {
      const attrs = match[1];
      const src = attrs.match(/(?:^|\s)src="([^"]+)"/)?.[1]
        || attrs.match(/\bdata-src="([^"]+)"/)?.[1];
      assert.ok(src?.startsWith("/assets/halloweekend/"));
      const data = fs.readFileSync(path.join(root, src.slice(1)));
      assert.match(attrs, /\balt="[^"]*"/);
      if (src.endsWith(".png")) {
        assert.equal(data.subarray(1, 4).toString(), "PNG");
        assert.equal(data.readUInt32BE(16), Number(attrs.match(/\bwidth="(\d+)"/)?.[1]));
        assert.equal(data.readUInt32BE(20), Number(attrs.match(/\bheight="(\d+)"/)?.[1]));
      } else {
        assert.ok(src.endsWith(".svg"));
        assert.match(data.toString(), /<svg\b/);
      }
    }
    const socialSrc = html.match(/property="og:image" content="https:\/\/d42pe.com([^\"]+)"/)?.[1];
    assert.equal(socialSrc, "/assets/d42pe-home-social-preview-2026-08-04.png");
    const social = fs.readFileSync(path.join(root, socialSrc.slice(1)));
    assert.equal(social.readUInt32BE(16), Number(html.match(/property="og:image:width" content="(\d+)"/)?.[1]));
    assert.equal(social.readUInt32BE(20), Number(html.match(/property="og:image:height" content="(\d+)"/)?.[1]));
  }
});

check("both landing pages retain text updates and all social destinations", () => {
  const retainedDestinations = [
    "sms:+15126107851?body=D42PE",
    "https://www.instagram.com/d42pe.events_atx/",
    "https://www.instagram.com/512__events/",
    "https://www.snapchat.com/add/d42pe.atx",
    "https://www.snapchat.com/@atxpartys"
  ];
  for (const html of [home, landing]) {
    const body = html.split(/<body[^>]*>/)[1];
    for (const destination of retainedDestinations) assert.ok(body.includes(`href="${destination}"`), destination);
    assert.match(body, /Get text updates/);
    if (html === landing) {
      assert.equal((body.match(/<section\b/g) || []).length, 2);
      assert.doesNotMatch(body, /GET TICKETS|Share flyer|Save flyer|Post on your story|Win VIP/i);
    }
  }
});

process.stdout.write(JSON.stringify({ checks, passed: checks, failures: 0 }, null, 2) + "\n");
