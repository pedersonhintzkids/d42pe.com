#!/usr/bin/env node

const assert = require("node:assert/strict");

const baseUrl = new URL(process.env.D42PE_BASE_URL || "http://127.0.0.1:4173/");
const userAgents = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Discordbot/2.0"
];
const routes = [
  {
    path: "/",
    canonical: "https://d42pe.com/",
    image: "https://d42pe.com/assets/d42pe-home-social-preview-2026-08-04.png"
  },
  {
    path: "/join/",
    canonical: "https://d42pe.com/join/",
    image: "https://d42pe.com/assets/d42pe-join-social-preview-2026-08-04.png"
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metaContent(html, attribute, key) {
  const match = html.match(new RegExp(`<meta\\s+[^>]*${attribute}="${escapeRegExp(key)}"[^>]*content="([^"]*)"[^>]*>`, "i"));
  return match?.[1] ?? null;
}

async function fetchRaw(url, userAgent) {
  const response = await fetch(url, { headers: { "user-agent": userAgent }, redirect: "follow" });
  assert.equal(response.status, 200, `${url} status`);
  return response;
}

async function main() {
  const results = [];
  for (const userAgent of userAgents) {
    for (const route of routes) {
      const url = new URL(route.path, baseUrl);
      const response = await fetchRaw(url, userAgent);
      assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
      const html = await response.text();
      const head = html.split(/<\/head>/i)[0];
      assert.ok(head.includes(`<link rel="canonical" href="${route.canonical}">`));
      assert.equal(metaContent(head, "property", "og:type"), "website");
      assert.equal(metaContent(head, "property", "og:url"), route.canonical);
      assert.equal(metaContent(head, "property", "og:image"), route.image);
      assert.equal(metaContent(head, "property", "og:image:secure_url"), route.image);
      assert.equal(metaContent(head, "property", "og:image:type"), "image/png");
      assert.equal(metaContent(head, "property", "og:image:width"), "1200");
      assert.equal(metaContent(head, "property", "og:image:height"), "630");
      assert.ok(metaContent(head, "property", "og:image:alt"));
      assert.equal(metaContent(head, "property", "og:site_name"), "D42PE");
      assert.equal(metaContent(head, "property", "og:locale"), "en_US");
      assert.equal(metaContent(head, "name", "twitter:card"), "summary_large_image");
      assert.equal(metaContent(head, "name", "twitter:image"), route.image);
      assert.ok(metaContent(head, "name", "twitter:image:alt"));
      if (route.path === "/") {
        const jsonLdScripts = head.match(/<script\s+type="application\/ld\+json">/gi) || [];
        assert.equal(jsonLdScripts.length, 2);
        assert.match(head, /"@type":\s*"Organization"/);
        assert.match(head, /"@type":\s*"WebSite"/);
      }
      results.push({ userAgent: userAgent.split(" ")[0], route: route.path, status: response.status });
    }
  }

  for (const route of routes) {
    const assetUrl = new URL(new URL(route.image).pathname, baseUrl);
    const response = await fetchRaw(assetUrl, userAgents[0]);
    assert.match(response.headers.get("content-type") || "", /^image\/png\b/i);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(data.readUInt32BE(16), 1200);
    assert.equal(data.readUInt32BE(20), 630);
  }

  for (const assetPath of ["/favicon.svg", "/assets/d42pe-brand-logo-512.png", "/apple-touch-icon.png"]) {
    const response = await fetchRaw(new URL(assetPath, baseUrl), userAgents[0]);
    assert.match(response.headers.get("content-type") || "", /^image\/(?:svg\+xml|png)\b/i);
  }

  process.stdout.write(JSON.stringify({ baseUrl: baseUrl.href, checks: results.length + 5, failures: 0, results }, null, 2) + "\n");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
