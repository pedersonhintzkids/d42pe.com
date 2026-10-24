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

for (const [route, html] of [["home", home]]) {
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

check("the Halloweekend URL uses the homepage as its only event experience", () => {
  assert.match(landing, /<noscript><meta http-equiv="refresh" content="0;url=\/"><\/noscript>/);
  assert.match(landing, /href="\/">Continue to Halloweekend tickets/);
  assert.match(landing, /<link rel="canonical" href="https:\/\/d42pe\.com\/">/);
  assert.doesNotMatch(landing, /updates-only|updates\.js|data-phase|offer-price|official-flyer/);
  assert.doesNotMatch(home, /location\.(?:replace|assign)\s*\(|http-equiv="refresh"/);

  const redirects = [...landing.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(redirects.length, 1);
  for (const [search, hash] of [
    ["", ""],
    ["?ref=RitualX&utm_source=instagram&utm_campaign=oct23", "#flyer"],
    ["?ref=two%20words&ref=second&fbclid=test%2Bcode", "#socials"],
    ["?next=https%3A%2F%2Fexample.com", "#main"]
  ]) {
    const destinations = [];
    vm.runInNewContext(redirects[0][1], { window: { location: {
      search, hash, replace: destination => destinations.push(destination)
    } } });
    assert.deepEqual(destinations, ["/" + search + hash]);
    const destination = new URL(destinations[0], "https://d42pe.com/halloweekend/");
    assert.equal(destination.origin, "https://d42pe.com");
    assert.equal(destination.pathname, "/");
    assert.equal(destination.search, search);
    assert.equal(destination.hash, hash);
  }
});

check("homepage uses the approved simple layout without an expired offer", () => {
  assert.ok(home.includes('/halloweekend/simple.css?v=20261024-1'));
  const scripts = [...home.matchAll(/<script\b([^>]*\bsrc="([^"]+)"[^>]*)>/g)];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][2], "/halloweekend/simple.js?v=20261024-1");
  assert.match(scripts[0][1], /\btype="module"/);
  for (const text of ['GET TICKETS', 'JOIN TEXT LIST', 'Post on your story']) assert.ok(home.includes(text));
  assert.doesNotMatch(home, /FLASH SALE|offer-price|class="timer"|\$8|\$16|Buy before the drop/);
  assert.doesNotMatch(home, /ACL After Party|href="\/vip\//i);
  assert.doesNotMatch(home, /noindex|Preview only|simulated|mode=before/);
  const script = read('halloweekend/simple.js');
  assert.doesNotMatch(script, /get\(['"]mode['"]\)|mock-sms|early-checkout/);
  assert.ok(script.includes('ticketUrl(location.search)'));
  assert.ok(script.includes('smsUrl(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)'));
  assert.ok(script.includes('navigator.share'));
  assert.ok(script.includes('navigator.clipboard'));
  assert.ok(script.includes('setSelectionRange'));
  assert.ok(script.includes('/assets/halloweekend/official-flyer-20261024-no-price.png'));
});

check("flyer and ticket access work without countdowns or JavaScript", () => {
  assert.match(home, /<section[^>]*id="flyer"[^>]*>/);
  assert.doesNotMatch(home.match(/<section[^>]*id="flyer"[^>]*>/)[0], /hidden/);
  assert.match(home, /src="\/assets\/halloweekend\/official-flyer-20261024-no-price\.png"/);
  assert.match(home, /<a\b[^>]*href="\/assets\/halloweekend\/official-flyer-20261024-no-price\.png"[^>]*\bdownload(?:[\s=>])/);
  assert.match(home, /<a\b[^>]*data-ticket[^>]*href="https:\/\/www\.universe\.com\/events\/halloweeknd-tickets-7T6MWX\?ref=Website&amp;unii-trigger-open=7T6MWX"/);
  assert.ok(home.includes('id="socials"'));
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
  for (const html of [home]) {
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

check("the shared homepage retains text updates and all social destinations", () => {
  const retainedDestinations = [
    "sms:+15126107851?body=D42PE",
    "https://www.instagram.com/d42pe.events_atx/",
    "https://www.instagram.com/512__events/",
    "https://www.snapchat.com/add/d42pe.atx",
    "https://www.snapchat.com/@atxpartys"
  ];
  for (const html of [home]) {
    const body = html.split(/<body[^>]*>/)[1];
    for (const destination of retainedDestinations) assert.ok(body.includes(`href="${destination}"`), destination);
    assert.match(body, /JOIN TEXT LIST/);
  }
});

process.stdout.write(JSON.stringify({ checks, passed: checks, failures: 0 }, null, 2) + "\n");
