import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseJsonc,
  validateConfigurationSet
} from "../validate-production-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API_ORIGIN = "https://d42pe-rsvp-api.example.workers.dev";

function productionWrangler(overrides = {}) {
  const config = {
    name: "d42pe-rsvp-api",
    main: "src/index.js",
    compatibility_date: "2026-08-26",
    workers_dev: true,
    vars: {
      RSVP_ALLOWED_ORIGINS: "https://d42pe.com",
      RSVP_EVENT_ID: "ritual-x-2016-house-party-2026-08-29"
    },
    secrets: {
      required: ["RSVP_ADMIN_SECRET"]
    },
    d1_databases: [{
      binding: "DB",
      database_name: "d42pe-rsvp",
      database_id: "f495af5f-dd71-4554-9974-97bdda7137b3",
      migrations_dir: "migrations"
    }],
    ratelimits: [
      {
        name: "RSVP_EDGE_RATE_LIMITER",
        namespace_id: "1001",
        simple: { limit: 120, period: 60 }
      },
      {
        name: "RSVP_ACTOR_RATE_LIMITER",
        namespace_id: "1002",
        simple: { limit: 30, period: 60 }
      }
    ],
    ...overrides
  };
  return JSON.stringify(config, null, 2);
}

function publicConfig(apiBaseUrl = API_ORIGIN, extra = "") {
  return `window.D42PE_RSVP_CONFIG = Object.freeze({ apiBaseUrl: "${apiBaseUrl}"${extra} });`;
}

function html(connectSources = `'self' ${API_ORIGIN}`) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src ${connectSources}; object-src 'none'">`;
}

function validateProduction(overrides = {}) {
  return validateConfigurationSet({
    wranglerSource: productionWrangler(),
    publicConfigSource: publicConfig(),
    publicHtmlSource: html(),
    adminHtmlSource: html(),
    docsSource: [
      "Release gate: npm run validate:rsvp-production.",
      "Apply with npx wrangler d1 migrations apply d42pe-rsvp --remote.",
      "First deploy with npx wrangler deploy --secrets-file .env.production."
    ].join("\n"),
    production: true,
    ...overrides
  });
}

function codes(result) {
  return result.errors.map(error => error.code);
}

test("parses Wrangler JSONC comments and trailing commas", () => {
  assert.deepEqual(parseJsonc(`{
    // Wrangler accepts JSONC.
    "name": "rsvp//worker",
    "items": [1, 2,],
  }`), {
    name: "rsvp//worker",
    items: [1, 2]
  });
});

test("the committed credential-free template passes safe-template validation", async () => {
  const [wranglerSource, publicConfigSource, publicHtmlSource, adminHtmlSource, docsSource] = await Promise.all([
    readFile(path.join(ROOT, "worker/wrangler.example.jsonc"), "utf8"),
    readFile(path.join(ROOT, "rsvp/config.js"), "utf8"),
    readFile(path.join(ROOT, "rsvp/index.html"), "utf8"),
    readFile(path.join(ROOT, "rsvp/admin/index.html"), "utf8"),
    readFile(path.join(ROOT, "docs/rsvp-operations.md"), "utf8")
  ]);
  const result = validateConfigurationSet({
    wranglerSource,
    publicConfigSource,
    publicHtmlSource,
    adminHtmlSource,
    docsSource
  });
  assert.deepEqual(result, {
    ok: true,
    mode: "safe-template",
    productionApiConfigured: false,
    errors: []
  });
});

test("local secret-file variants are ignored while committed examples remain allowed", async () => {
  const ignore = await readFile(path.join(ROOT, ".gitignore"), "utf8");
  for (const rule of [
    ".env*",
    "!.env.example",
    "worker/.dev.vars*",
    "!worker/.dev.vars.example",
    "worker/.env*",
    "!worker/.env.example",
    "worker/wrangler.jsonc"
  ]) {
    assert.ok(ignore.split(/\r?\n/).includes(rule), `.gitignore must contain ${rule}`);
  }
});

test("accepts a fully staged production configuration", () => {
  assert.deepEqual(validateProduction(), {
    ok: true,
    mode: "production",
    productionApiConfigured: true,
    errors: []
  });
});

test("rejects an unexpected Worker identity or DNS route configuration", () => {
  const config = JSON.parse(productionWrangler());
  config.name = "unexpected-worker";
  config.workers_dev = false;
  config.routes = [{ pattern: "d42pe.com/rsvp/*", zone_name: "d42pe.com" }];
  const result = validateProduction({ wranglerSource: JSON.stringify(config) });
  assert.ok(codes(result).includes("worker_name_invalid"));
  assert.ok(codes(result).includes("workers_dev_required"));
  assert.ok(codes(result).includes("worker_routes_not_authorized"));
});

test("requires the safe Wrangler declaration for the encrypted organizer secret", () => {
  const config = JSON.parse(productionWrangler());
  delete config.secrets;
  assert.ok(codes(validateProduction({ wranglerSource: JSON.stringify(config) })).includes("secret_declaration_invalid"));
});

test("requires explicit remote migration and first-deploy secret commands", () => {
  const result = validateProduction({
    docsSource: "Release gate only: npm run validate:rsvp-production."
  });
  assert.ok(codes(result).includes("remote_migration_command_missing"));
  assert.ok(codes(result).includes("first_deploy_secret_command_missing"));
});

test("rejects production D1 and rate-limit placeholders", async () => {
  const wranglerSource = await readFile(path.join(ROOT, "worker/wrangler.example.jsonc"), "utf8");
  const result = validateProduction({ wranglerSource });
  assert.ok(codes(result).includes("d1_id_placeholder"));
  assert.equal(codes(result).filter(code => code === "rate_namespace_placeholder").length, 2);
});

test("rejects invalid and duplicate Cloudflare rate-limit namespace IDs", () => {
  const duplicate = JSON.parse(productionWrangler());
  duplicate.ratelimits[1].namespace_id = "1001";
  assert.ok(codes(validateProduction({ wranglerSource: JSON.stringify(duplicate) })).includes("rate_namespace_duplicate"));

  const invalid = JSON.parse(productionWrangler());
  invalid.ratelimits[0].namespace_id = 1001;
  invalid.ratelimits[1].namespace_id = "0";
  assert.equal(codes(validateProduction({ wranglerSource: JSON.stringify(invalid) })).filter(code => code === "rate_namespace_invalid").length, 2);
});

test("rejects a malformed D1 identifier", () => {
  const config = JSON.parse(productionWrangler());
  config.d1_databases[0].database_id = "not-a-d1-uuid";
  assert.ok(codes(validateProduction({ wranglerSource: JSON.stringify(config) })).includes("d1_id_invalid"));
});

test("requires a production API origin and an exact CSP match on both pages", () => {
  const missing = validateProduction({ publicConfigSource: publicConfig("") });
  assert.ok(codes(missing).includes("production_api_url_missing"));

  const broadCsp = html("'self' https://*.workers.dev");
  const mismatch = validateProduction({ publicHtmlSource: broadCsp, adminHtmlSource: broadCsp });
  assert.equal(codes(mismatch).filter(code => code === "csp_api_origin_missing").length, 2);
  assert.equal(codes(mismatch).filter(code => code === "csp_connect_src_too_broad").length, 2);
});

test("rejects duplicate connect-src directives", () => {
  const duplicate = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; connect-src 'self' ${API_ORIGIN}">`;
  assert.ok(codes(validateProduction({ publicHtmlSource: duplicate })).includes("csp_connect_directive_invalid"));
});

test("rejects secret-bearing Wrangler, public, and documentation config without echoing values", () => {
  const leakedValue = "do-not-print-this-organizer-value-123456789";
  const config = JSON.parse(productionWrangler());
  config.vars.RSVP_ADMIN_SECRET = leakedValue;
  const result = validateProduction({
    wranglerSource: JSON.stringify(config),
    publicConfigSource: publicConfig(API_ORIGIN, `, adminSecret: "${leakedValue}"`),
    docsSource: `npm run validate:rsvp-production\nRSVP_ADMIN_SECRET=${leakedValue}`
  });
  assert.ok(codes(result).includes("admin_secret_in_wrangler"));
  assert.ok(codes(result).includes("secret_in_plaintext_config"));
  assert.ok(codes(result).includes("secret_reference_in_public_config"));
  assert.ok(codes(result).includes("secret_assignment_in_docs"));
  assert.equal(JSON.stringify(result).includes(leakedValue), false);
});
