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

check("homepage uses the isolated October 22 flash-sale module", () => {
  assert.match(home, /<body\b[^>]*data-phase="checking"/);
  assert.ok(home.includes('/halloweekend/flash.css?v=20261022-2'));
  const scripts = [...home.matchAll(/<script\b([^>]*\bsrc="([^"]+)"[^>]*)>/g)];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][2], "/halloweekend/drop.js?v=20261022-2");
  assert.match(scripts[0][1], /\btype="module"/);
  for (const text of ['24-HOUR FLASH SALE', 'THU OCT 22', 'October 23 at 4 PM', 'Buy before the drop']) assert.ok(home.includes(text));
  assert.doesNotMatch(home, /ACL After Party|href="\/vip\//i);
  assert.doesNotMatch(home, /noindex|Preview only|simulated|mode=before/);
  const script = read('halloweekend/drop.js');
  assert.doesNotMatch(script, /get\(['"]mode['"]\)|mock-sms|early-checkout/);
  assert.ok(script.includes('visibilitychange'));
  assert.ok(script.includes('pageshow'));
  assert.ok(script.includes('navigator.share'));
  assert.ok(script.includes('every paid ticket'));
});

check("flyer and ordinary ticket access remain available before the sale", () => {
  assert.match(home, /<section[^>]*id="flyer"[^>]*>/);
  assert.doesNotMatch(home.match(/<section[^>]*id="flyer"[^>]*>/)[0], /hidden/);
  assert.match(home, /src="\/assets\/halloweekend\/official-flyer\.png"/);
  assert.match(home, /srcset="[^"]*flyer-480\.webp 480w[^"]*flyer-840\.webp 840w"/);
  assert.match(home, /<a\b[^>]*href="\/assets\/halloweekend\/official-flyer\.png"[^>]*\bdownload(?:[\s=>])/);
  assert.match(home, /<noscript>[\s\S]*universe\.com[\s\S]*<\/noscript>/);
  assert.match(home, /class="early-bonus" hidden/);
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
