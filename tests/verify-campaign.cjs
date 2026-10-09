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
  check(`${route}: Halloweekend remains without the paused promotions`, () => {
    for (const copy of ["D42PE", "Halloweekend", "AUSTIN, TEXAS", "2026-10-30", "2026-10-31", "512 EVENTS", "RITUAL"]) {
      assert.ok(html.includes(copy), `${route} must contain ${copy}`);
    }
    assert.doesNotMatch(html, /universe\.com|ACL After Party|official-flyer|flyer-480|flyer-840|data-ticket|data-share|data-download|data-open-flyer|mobile-ticket|href="\/vip\//i);
    assert.doesNotMatch(html, /<script[^>]+src="[^\"]*(?:campaign-launch|halloweekend\.js|vip\.js)/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /class="skip-link" href="#main"/);
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  });
}

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
      const src = attrs.match(/src="([^"]+)"/)?.[1];
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
    assert.equal((body.match(/<section\b/g) || []).length, 2);
    assert.doesNotMatch(body, /GET TICKETS|Share flyer|Save flyer|Post on your story|Win VIP/i);
  }
});

process.stdout.write(JSON.stringify({ checks, passed: checks, failures: 0 }, null, 2) + "\n");
