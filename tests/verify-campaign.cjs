#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const home = read("index.html");
const tickets = read("tickets/index.html");
const ticketUrl = "https://www.universe.com/events/unofficial-acl-after-party-d42pe-512-events-ritual-x-d42pe-com-tickets-H4RP5M?ref=Website";
let checks = 0;
function check(name, run) { run(); checks++; }

function jpegDimensions(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.equal(data.readUInt16BE(0), 0xffd8, `${file} must contain JPEG data`);
  let offset = 2;
  while (offset < data.length) {
    assert.equal(data[offset++], 0xff, `${file} JPEG marker`);
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= data.length, `${file} segment bounds`);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3), bytes: data.length };
    }
    offset += length;
  }
  throw new Error(`${file} has no supported JPEG dimensions`);
}

for (const [route, html] of [["home", home], ["tickets", tickets]]) {
  check(`${route}: event essentials`, () => {
    for (const copy of ["Austin, Texas", "D42PE", "Unofficial", "ACL", "After Party", "2026-10-03", "Oct 3", "9PM–2AM", "All ages"]) {
      assert.ok(html.includes(copy), `${route} must contain ${copy}`);
    }
    assert.doesNotMatch(html, /venue guaranteed|all online tickets refunded|7PM|NEXT EVENT COMING SOON|WHITE LIES|AFTER DARK/i);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /class="skip-link" href="#main-content"/);
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  });
}

check("ticket handoff is explicit and does not invent a checkout", () => {
  assert.doesNotMatch(tickets, /http-equiv="refresh"/);
  assert.match(tickets, /canonical" href="https:\/\/d42pe\.com\/tickets\/"/);
  assert.ok(tickets.includes("Shutdown refunds apply only to tickets marked “refund if shut”."));
  assert.match(tickets, /General Access tickets without that label do not include shutdown refund protection\./);
  assert.match(tickets, /data-ticket-state="ready"/);
  const anchor = (tickets.match(/<a\b[^>]*>/g) || []).find(tag => tag.includes('id="universe-checkout"'));
  assert.ok(anchor, "tickets need an explicit Universe checkout link");
  assert.equal(anchor.match(/href="([^"]+)"/)?.[1], ticketUrl);
  assert.doesNotMatch(tickets, /Tickets coming soon|Check back here for tickets|data-ticket-state="pending"/);
});

check("campaign media are local, real files with matching intrinsic dimensions", () => {
  for (const match of home.matchAll(/<img\b([^>]+)>/g)) {
    const attrs = match[1];
    const src = attrs.match(/src="([^"]+)"/)?.[1];
    assert.ok(src?.startsWith("/assets/campaigns/"));
    const size = jpegDimensions(src.slice(1));
    assert.equal(size.width, Number(attrs.match(/\bwidth="(\d+)"/)?.[1]));
    assert.equal(size.height, Number(attrs.match(/\bheight="(\d+)"/)?.[1]));
    assert.ok(size.bytes < 2_000_000, `${src} should remain optimized`);
    assert.match(attrs, /\balt="[^"]*"/);
  }
  assert.equal((home.match(/<img\b/g) || []).length, 1);
  const social = jpegDimensions("assets/campaigns/social.jpg");
  assert.equal(social.width, Number(home.match(/property="og:image:width" content="(\d+)"/)?.[1]));
  assert.equal(social.height, Number(home.match(/property="og:image:height" content="(\d+)"/)?.[1]));
});

check("minimal homepage has one primary ticket action", () => {
  const body = home.split(/<body[^>]*>/)[1];
  assert.equal((body.match(/class="cta\b/g) || []).length, 1);
  const actions = body.match(/<a\b[^>]*class="cta\b[^>]*>/g) || [];
  assert.equal(actions.length, 1);
  assert.equal(actions[0].match(/href="([^"]+)"/)?.[1], ticketUrl);
  assert.match(body, /Get Tickets/);
  assert.match(body, /With 512 Events \+ Ritual X/);
  assert.equal((body.match(/<section\b/g) || []).length, 1);
  assert.doesNotMatch(body, /sms:|subscribers|FOLLOW D42PE|campaign-details|event-flyer|<nav\b|ARTISTS: APPLY TO PERFORM/);
});

process.stdout.write(JSON.stringify({ checks, passed: checks, failures: 0 }, null, 2) + "\n");
