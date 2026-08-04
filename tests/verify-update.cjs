#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const home = read("index.html");
const join = read("join/index.html");
const portfolio = read("portfolio/index.html");
const css = read("style.css");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const manifest = JSON.parse(read("assets/social-preview-manifest.json"));
const checks = [];

function check(name, test) {
  test();
  checks.push(name);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metaContent(html, attribute, key) {
  const match = html.match(new RegExp(`<meta\\s+[^>]*${attribute}="${escapeRegExp(key)}"[^>]*content="([^"]*)"[^>]*>`, "i"));
  return match?.[1] ?? null;
}

function jsonLd(html) {
  return [...html.matchAll(/<script\s+type="application\/ld\+json">\s*([\s\S]*?)<\/script>/gi)]
    .map(match => JSON.parse(match[1]));
}

function pngDimensions(relative) {
  const data = fs.readFileSync(path.join(root, relative));
  assert.equal(data.subarray(1, 4).toString(), "PNG", `${relative} must be a PNG`);
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const routeExpectations = [
  {
    html: home,
    canonical: "https://d42pe.com/",
    image: "https://d42pe.com/assets/d42pe-home-social-preview-2026-08-04.png",
    alt: "D42PE — Austin Events — Event Drops, Ticket Links and Updates — d42pe.com",
    title: "D42PE | Austin Events, Concerts &amp; Event Drops",
    description: "D42PE produces and promotes live events in Austin. Get ticket drops, event updates and official social links."
  },
  {
    html: join,
    canonical: "https://d42pe.com/join/",
    image: "https://d42pe.com/assets/d42pe-join-social-preview-2026-08-04.png",
    alt: "D42PE — Stay Tapped In — Text Updates and Official Socials — d42pe.com/join",
    title: "Stay Tapped In | D42PE Austin",
    description: "Get D42PE event drops by text and follow the official D42PE Instagram and Snapchat accounts."
  }
];

check("homepage Past Events section removed", () => {
  for (const text of ["past-events-title", "Austin concerts and events", "PAST EVENTS", "Winter Blackout", "July 24 Promotion", "Lil Xan at Empire ATX"]) {
    assert.ok(!home.includes(text), `homepage must not contain ${text}`);
  }
  assert.ok(home.includes("FOLLOW D42PE"));
  assert.ok(portfolio.includes("Winter Blackout"));
  assert.ok(portfolio.includes("JULY 24 PROMOTION"));
  assert.ok(portfolio.includes("LIL XAN AT EMPIRE ATX"));
});

check("Past Events-only CSS removed", () => {
  assert.ok(!css.includes("proof-list"));
  assert.ok(!css.includes("proof-row"));
});

check("join heading exact", () => {
  assert.match(join, /<h1[^>]*id="page-title"[^>]*>STAY TAPPED IN<\/h1>/);
  assert.ok(!join.includes("STAY TAPPED IN."));
});

check("Snapchat corrected without touching Instagram", () => {
  const publicSource = `${home}\n${join}`;
  const oldHandle = "@d42pe." + "events";
  const oldUrl = "snapchat.com/add/d42pe." + "events";
  assert.ok(!new RegExp(`${escapeRegExp(oldHandle)}(?!_atx)`).test(publicSource));
  assert.ok(!publicSource.includes(oldUrl));
  assert.equal((publicSource.match(/@d42pe\.atx/g) || []).length, 2);
  assert.equal((publicSource.match(/https:\/\/www\.snapchat\.com\/add\/d42pe\.atx/g) || []).length, 3);
  assert.equal((publicSource.match(/@d42pe\.events_atx/g) || []).length, 2);
  assert.equal((publicSource.match(/https:\/\/www\.instagram\.com\/d42pe\.events_atx\//g) || []).length, 3);
});

for (const route of routeExpectations) {
  check(`${route.canonical} complete social metadata`, () => {
    assert.ok(route.html.includes(`<link rel="canonical" href="${route.canonical}">`));
    assert.equal(metaContent(route.html, "property", "og:type"), "website");
    assert.equal(metaContent(route.html, "property", "og:site_name"), "D42PE");
    assert.equal(metaContent(route.html, "property", "og:locale"), "en_US");
    assert.equal(metaContent(route.html, "property", "og:url"), route.canonical);
    assert.equal(metaContent(route.html, "property", "og:title"), route.title);
    assert.equal(metaContent(route.html, "property", "og:description"), route.description);
    assert.equal(metaContent(route.html, "property", "og:image"), route.image);
    assert.equal(metaContent(route.html, "property", "og:image:secure_url"), route.image);
    assert.equal(metaContent(route.html, "property", "og:image:type"), "image/png");
    assert.equal(metaContent(route.html, "property", "og:image:width"), "1200");
    assert.equal(metaContent(route.html, "property", "og:image:height"), "630");
    assert.equal(metaContent(route.html, "property", "og:image:alt"), route.alt);
    assert.equal(metaContent(route.html, "name", "twitter:card"), "summary_large_image");
    assert.equal(metaContent(route.html, "name", "twitter:title"), route.title);
    assert.equal(metaContent(route.html, "name", "twitter:description"), route.description);
    assert.equal(metaContent(route.html, "name", "twitter:image"), route.image);
    assert.equal(metaContent(route.html, "name", "twitter:image:alt"), route.alt);
    assert.equal(metaContent(route.html, "name", "twitter:site"), null);
  });

  check(`${route.canonical} previews do not load visibly`, () => {
    const body = route.html.split(/<body[^>]*>/i)[1];
    assert.ok(body);
    assert.ok(!body.includes("social-preview"));
    assert.ok(!/<img\b|<picture\b|<video\b/i.test(body));
    assert.ok(!/rel="preload"/i.test(route.html));
  });
}

check("structured data exact and valid", () => {
  const entities = jsonLd(home);
  assert.equal(entities.length, 2);
  const organization = entities.find(entity => entity["@type"] === "Organization");
  const website = entities.find(entity => entity["@type"] === "WebSite");
  assert.ok(organization);
  assert.ok(website);
  assert.equal(organization.name, "D42PE");
  assert.equal(organization.url, "https://d42pe.com/");
  assert.equal(organization.email, "contact@d42pe.com");
  assert.deepEqual(organization.sameAs, [
    "https://www.instagram.com/d42pe.events_atx/",
    "https://www.snapchat.com/add/d42pe.atx"
  ]);
  assert.deepEqual(organization.logo, {
    "@type": "ImageObject",
    url: "https://d42pe.com/assets/d42pe-brand-logo-512.png",
    width: 512,
    height: 512
  });
  assert.deepEqual(website, {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "D42PE",
    alternateName: "d42pe.com",
    url: "https://d42pe.com/"
  });
});

check("preview and icon assets exact", () => {
  const dimensions = new Map([
    ["assets/d42pe-home-social-preview-2026-08-04.png", [1200, 630]],
    ["assets/d42pe-join-social-preview-2026-08-04.png", [1200, 630]],
    ["assets/d42pe-brand-logo-512.png", [512, 512]],
    ["apple-touch-icon.png", [180, 180]]
  ]);
  for (const [relative, expected] of dimensions) {
    const { data, width, height } = pngDimensions(relative);
    assert.deepEqual([width, height], expected, `${relative} dimensions`);
    assert.ok(data.length < 350_000, `${relative} should remain optimized`);
    const record = manifest.assets.find(asset => asset.file === relative);
    assert.ok(record, `${relative} must be in the manifest`);
    assert.equal(record.mimeType, "image/png");
    assert.equal(record.bytes, data.length);
    assert.equal(record.sha256, crypto.createHash("sha256").update(data).digest("hex"));
  }
  for (const html of [home, join]) {
    assert.ok(html.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'));
    assert.ok(html.includes('<link rel="icon" href="/assets/d42pe-brand-logo-512.png" type="image/png" sizes="512x512">'));
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">'));
  }
});

check("crawl and portfolio invariants preserved", () => {
  assert.ok(robots.includes("User-agent: *"));
  assert.ok(robots.includes("Allow: /"));
  assert.ok(robots.includes("Sitemap: https://d42pe.com/sitemap.xml"));
  assert.ok(!robots.toLowerCase().includes("portfolio"));
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), [
    "https://d42pe.com/",
    "https://d42pe.com/join/"
  ]);
  assert.match(portfolio, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.ok(!home.includes("/portfolio/"));
  assert.ok(!join.includes("/portfolio/"));
});

check("no remote visible media or fonts", () => {
  assert.ok(!/@import|@font-face|url\(/i.test(css));
  for (const html of [home, join, portfolio]) {
    assert.ok(!/<script[^>]+src=/i.test(html));
    assert.ok(!/<(?:img|picture|video|audio|iframe|object)\b/i.test(html));
  }
});

process.stdout.write(JSON.stringify({ checks: checks.length, passed: checks.length, failures: 0 }, null, 2) + "\n");
