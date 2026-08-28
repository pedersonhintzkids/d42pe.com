#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { EVENT_ID } from "./src/validation.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PLACEHOLDER_PATTERN = /(?:REPLACE_WITH|PLACEHOLDER|CHANGE_ME|YOUR[_-]|<[^>]+>|\bTODO\b)/i;
const SECRET_KEY_PATTERN = /(?:SECRET|PASSWORD|PASSCODE|PRIVATE[_-]?KEY|API[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL|TOKEN)/i;
const EXPECTED_RATE_LIMITERS = new Set(["RSVP_EDGE_RATE_LIMITER", "RSVP_ACTOR_RATE_LIMITER"]);

function addError(errors, code, file, message) {
  errors.push({ code, file, message });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlaceholder(value) {
  return typeof value !== "string" || !value.trim() || PLACEHOLDER_PATTERN.test(value);
}

function stripJsoncComments(source) {
  let output = "";
  let mode = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (mode === "string") {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') mode = "code";
      continue;
    }

    if (mode === "line-comment") {
      if (character === "\n" || character === "\r") {
        output += character;
        mode = "code";
      } else {
        output += " ";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        mode = "code";
      } else {
        output += character === "\n" || character === "\r" ? character : " ";
      }
      continue;
    }

    if (character === '"') {
      output += character;
      mode = "string";
    } else if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      mode = "line-comment";
    } else if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      mode = "block-comment";
    } else {
      output += character;
    }
  }

  if (mode === "block-comment") throw new SyntaxError("Unterminated JSONC block comment.");
  return output;
}

function stripTrailingCommas(source) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      output += character;
      inString = true;
      continue;
    }

    if (character === ",") {
      let cursor = index + 1;
      while (/\s/.test(source[cursor] || "")) cursor += 1;
      if (source[cursor] === "}" || source[cursor] === "]") continue;
    }
    output += character;
  }
  return output;
}

export function parseJsonc(source) {
  return JSON.parse(stripTrailingCommas(stripJsoncComments(source)));
}

function validateExpectedVars(config, errors, file) {
  const vars = config.vars;
  if (!isObject(vars)) {
    addError(errors, "wrangler_vars_missing", file, "Wrangler must define the public RSVP vars object.");
    return;
  }

  if (vars.RSVP_ALLOWED_ORIGINS !== "https://d42pe.com") {
    addError(errors, "allowed_origins_invalid", file, "RSVP_ALLOWED_ORIGINS must be exactly https://d42pe.com for this deployment.");
  }
  if (vars.RSVP_EVENT_ID !== EVENT_ID) {
    addError(errors, "event_id_invalid", file, `RSVP_EVENT_ID must be exactly ${EVENT_ID}.`);
  }
}

function validateRequiredSecrets(config, errors, file) {
  const declaration = config.secrets;
  if (!isObject(declaration) || Object.keys(declaration).some(key => key !== "required")) {
    addError(errors, "secret_declaration_invalid", file, "Wrangler secrets must use only the non-sensitive secrets.required declaration.");
    return;
  }
  if (!Array.isArray(declaration.required)
    || declaration.required.length !== 1
    || declaration.required[0] !== "RSVP_ADMIN_SECRET") {
    addError(errors, "required_admin_secret_missing", file, "Wrangler secrets.required must declare exactly RSVP_ADMIN_SECRET.");
  }
}

function validatePlaintextSecretConfig(value, errors, file, location = "wrangler") {
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (location === "wrangler" && key === "secrets") continue;
    if (SECRET_KEY_PATTERN.test(key)) {
      if (key === "RSVP_ADMIN_SECRET") {
        addError(errors, "admin_secret_in_wrangler", file, "RSVP_ADMIN_SECRET may be declared in secrets.required but must never have a value in Wrangler config.");
      }
      addError(
        errors,
        "secret_in_plaintext_config",
        file,
        `${location}.${key} looks secret-bearing; store secrets with Wrangler secrets, never in configuration.`
      );
    }
    if (isObject(child)) validatePlaintextSecretConfig(child, errors, file, `${location}.${key}`);
    if (Array.isArray(child)) {
      child.forEach((item, index) => validatePlaintextSecretConfig(item, errors, file, `${location}.${key}[${index}]`));
    }
  }
}

function validateD1(config, errors, file, production) {
  if (!Array.isArray(config.d1_databases)) {
    addError(errors, "d1_bindings_missing", file, "Wrangler must define a d1_databases array.");
    return;
  }
  const matches = config.d1_databases.filter(binding => binding?.binding === "DB");
  if (matches.length !== 1) {
    addError(errors, "d1_binding_invalid", file, "Wrangler must define exactly one D1 binding named DB.");
    return;
  }

  const binding = matches[0];
  if (binding.database_name !== "d42pe-rsvp") {
    addError(errors, "d1_name_invalid", file, "The DB binding must target the d42pe-rsvp database name.");
  }
  if (binding.migrations_dir !== "migrations") {
    addError(errors, "d1_migrations_dir_invalid", file, "The DB binding migrations_dir must be migrations.");
  }
  if (production) {
    if (binding.database_id == null || (typeof binding.database_id === "string" && isPlaceholder(binding.database_id))) {
      addError(errors, "d1_id_placeholder", file, "Production database_id is missing or still contains a placeholder.");
    } else if (typeof binding.database_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(binding.database_id)) {
      addError(errors, "d1_id_invalid", file, "Production database_id must be the D1 database UUID returned by Cloudflare.");
    }
  } else if (!PLACEHOLDER_PATTERN.test(String(binding.database_id || ""))) {
    addError(errors, "template_d1_id_not_placeholder", file, "The committed example must not contain an account-specific D1 database ID.");
  }
}

function validateRateLimits(config, errors, file, production) {
  if (!Array.isArray(config.ratelimits)) {
    addError(errors, "rate_limits_missing", file, "Wrangler must define the two RSVP rate-limit bindings.");
    return;
  }

  const names = new Map();
  const canonicalNamespaces = new Map();
  for (const binding of config.ratelimits) {
    const name = binding?.name;
    if (typeof name !== "string" || !name) {
      addError(errors, "rate_binding_name_invalid", file, "Every rate-limit binding must have a name.");
      continue;
    }
    names.set(name, (names.get(name) || 0) + 1);
    if (!EXPECTED_RATE_LIMITERS.has(name)) {
      addError(errors, "rate_binding_unexpected", file, `Unexpected rate-limit binding ${name}.`);
    }

    const namespace = binding.namespace_id;
    if (production) {
      if (namespace == null || (typeof namespace === "string" && isPlaceholder(namespace))) {
        addError(errors, "rate_namespace_placeholder", file, `${name} namespace_id is missing or still contains a placeholder.`);
      } else if (typeof namespace !== "string" || !/^[1-9]\d*$/.test(namespace)) {
        addError(errors, "rate_namespace_invalid", file, `${name} namespace_id must be a string containing a positive integer.`);
      } else {
        const canonical = BigInt(namespace).toString();
        const existing = canonicalNamespaces.get(canonical);
        if (existing) {
          addError(errors, "rate_namespace_duplicate", file, `${name} and ${existing} must use different namespace IDs.`);
        } else {
          canonicalNamespaces.set(canonical, name);
        }
      }
    } else if (!PLACEHOLDER_PATTERN.test(String(namespace || ""))) {
      addError(errors, "template_rate_namespace_not_placeholder", file, `${name} must use a placeholder namespace in the committed example.`);
    }

    if (!Number.isSafeInteger(binding.simple?.limit) || binding.simple.limit < 1) {
      addError(errors, "rate_limit_invalid", file, `${name} simple.limit must be a positive safe integer.`);
    }
    if (![10, 60].includes(binding.simple?.period)) {
      addError(errors, "rate_period_invalid", file, `${name} simple.period must be 10 or 60 seconds.`);
    }
  }

  for (const expectedName of EXPECTED_RATE_LIMITERS) {
    if (names.get(expectedName) !== 1) {
      addError(errors, "rate_binding_missing_or_duplicate", file, `Wrangler must define exactly one ${expectedName} binding.`);
    }
  }
}

function validateWrangler(source, errors, file, production) {
  let config;
  try {
    config = parseJsonc(source);
  } catch (error) {
    addError(errors, "wrangler_parse_failed", file, `Wrangler JSONC could not be parsed: ${error.message}`);
    return;
  }
  if (!isObject(config)) {
    addError(errors, "wrangler_root_invalid", file, "Wrangler configuration must be a JSON object.");
    return;
  }

  if (config.main !== "src/index.js") {
    addError(errors, "wrangler_main_invalid", file, "Wrangler main must be src/index.js.");
  }
  if (config.name !== "d42pe-rsvp-api") {
    addError(errors, "worker_name_invalid", file, "Wrangler name must be exactly d42pe-rsvp-api.");
  }
  if (config.workers_dev !== true) {
    addError(errors, "workers_dev_required", file, "This deployment must use its workers.dev origin unless a different hosting change is explicitly approved.");
  }
  if (config.route !== undefined || config.routes !== undefined) {
    addError(errors, "worker_routes_not_authorized", file, "Wrangler routes are not authorized for this deployment; use the assigned workers.dev origin without changing DNS.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date || "")) {
    addError(errors, "compatibility_date_invalid", file, "Wrangler compatibility_date must use YYYY-MM-DD.");
  }
  validateExpectedVars(config, errors, file);
  validateRequiredSecrets(config, errors, file);
  validatePlaintextSecretConfig(config, errors, file);
  validateD1(config, errors, file, production);
  validateRateLimits(config, errors, file, production);
}

function extractPublicApiBase(source, errors, file) {
  let uncommented;
  try {
    uncommented = stripJsoncComments(source);
  } catch (error) {
    addError(errors, "public_config_parse_failed", file, `Public config comments could not be parsed: ${error.message}`);
    return "";
  }
  const matches = [...uncommented.matchAll(/\bapiBaseUrl\s*:\s*"([^"\r\n]*)"/g)];
  if (matches.length !== 1) {
    addError(errors, "public_api_literal_invalid", file, "Public config must contain exactly one double-quoted apiBaseUrl literal.");
    return "";
  }
  return matches[0][1].trim();
}

function validatePublicConfig(source, errors, file, production) {
  if (/\b(?:RSVP_ADMIN_SECRET|adminSecret|password|passcode|authorization|bearer)\b/i.test(source)) {
    addError(errors, "secret_reference_in_public_config", file, "Public RSVP config contains a secret- or credential-bearing reference.");
  }

  const configured = extractPublicApiBase(source, errors, file);
  if (!configured) {
    if (production) addError(errors, "production_api_url_missing", file, "Production apiBaseUrl must contain the deployed HTTPS Worker origin.");
    return null;
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") {
      addError(errors, "production_api_not_https", file, "Production apiBaseUrl must use HTTPS.");
    }
    if (url.username || url.password) {
      addError(errors, "production_api_has_credentials", file, "Production apiBaseUrl must not contain URL credentials.");
    }
    if (url.hostname.includes("*")) {
      addError(errors, "production_api_wildcard", file, "Production apiBaseUrl must name one exact host, not a wildcard.");
    }
    if (url.search || url.hash || (url.pathname && url.pathname !== "/")) {
      addError(errors, "production_api_not_origin", file, "Production apiBaseUrl must be an origin without a path, query, or fragment.");
    }
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".local")) {
      addError(errors, "production_api_loopback", file, "Production apiBaseUrl must not target loopback or a local hostname.");
    }
    return url.origin;
  } catch {
    addError(errors, "production_api_url_invalid", file, "Production apiBaseUrl is not a valid URL.");
    return null;
  }
}

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2] ?? null;
}

function extractCsp(html, errors, file) {
  const policies = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if ((htmlAttribute(tag, "http-equiv") || "").toLowerCase() === "content-security-policy") {
      const content = htmlAttribute(tag, "content");
      if (content !== null) policies.push(content);
    }
  }
  if (policies.length !== 1) {
    addError(errors, "csp_meta_invalid", file, "RSVP HTML must contain exactly one Content-Security-Policy meta tag.");
    return null;
  }
  return policies[0];
}

function cspDirectives(policy) {
  const directives = new Map();
  for (const rawDirective of policy.split(";")) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (parts.length) directives.set(parts[0].toLowerCase(), parts.slice(1));
  }
  return directives;
}

function validateCsp(html, errors, file, apiOrigin) {
  const policy = extractCsp(html, errors, file);
  if (!policy) return;
  const connectSources = cspDirectives(policy).get("connect-src") || [];
  const connectDirectiveCount = [...policy.split(";")]
    .map(directive => directive.trim().split(/\s+/, 1)[0]?.toLowerCase())
    .filter(name => name === "connect-src").length;
  if (connectDirectiveCount !== 1) {
    addError(errors, "csp_connect_directive_invalid", file, "CSP must contain exactly one connect-src directive.");
  }
  if (!connectSources.includes("'self'")) {
    addError(errors, "csp_connect_self_missing", file, "connect-src must include 'self'.");
  }
  if (!apiOrigin) return;

  if (!connectSources.includes(apiOrigin)) {
    addError(errors, "csp_api_origin_missing", file, `connect-src must include the exact deployed API origin ${apiOrigin}.`);
  }
  const unexpected = connectSources.filter(source => source !== "'self'" && source !== apiOrigin);
  if (unexpected.length) {
    addError(errors, "csp_connect_src_too_broad", file, "Production connect-src may contain only 'self' and the exact deployed API origin.");
  }
}

function validateDocs(source, errors, file) {
  for (const match of source.matchAll(/RSVP_ADMIN_SECRET\s*=\s*([^\s`]+)/gi)) {
    if (!isPlaceholder(match[1])) {
      addError(errors, "secret_assignment_in_docs", file, "Documentation must not contain an assigned organizer secret value.");
    }
  }
  if (/Authorization\s*:\s*Bearer\s+[A-Za-z0-9_-]{16,}/i.test(source)) {
    addError(errors, "bearer_value_in_docs", file, "Documentation must not contain a concrete organizer bearer value.");
  }
  if (!source.includes("npm run validate:rsvp-production")) {
    addError(errors, "production_validator_not_documented", file, "Operations docs must require the production configuration validator before deployment.");
  }
  if (!source.includes("npx wrangler d1 migrations apply d42pe-rsvp --remote")) {
    addError(errors, "remote_migration_command_missing", file, "Operations docs must name the d42pe-rsvp database and --remote when applying production migrations.");
  }
  if (!source.includes("npx wrangler deploy --secrets-file .env.production")) {
    addError(errors, "first_deploy_secret_command_missing", file, "Operations docs must upload the organizer secret with the first Worker deployment via an ignored secrets file.");
  }
}

export function validateConfigurationSet({
  wranglerSource,
  publicConfigSource,
  publicHtmlSource,
  adminHtmlSource,
  docsSource,
  production = false,
  wranglerFile = production ? "worker/wrangler.jsonc" : "worker/wrangler.example.jsonc"
}) {
  const errors = [];
  validateWrangler(wranglerSource, errors, wranglerFile, production);
  const apiOrigin = validatePublicConfig(publicConfigSource, errors, "rsvp/config.js", production);
  validateCsp(publicHtmlSource, errors, "rsvp/index.html", apiOrigin);
  validateCsp(adminHtmlSource, errors, "rsvp/admin/index.html", apiOrigin);
  validateDocs(docsSource, errors, "docs/rsvp-operations.md");
  return {
    ok: errors.length === 0,
    mode: production ? "production" : "safe-template",
    productionApiConfigured: Boolean(apiOrigin),
    errors
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      production: { type: "boolean", default: false },
      wrangler: { type: "string" }
    },
    strict: true
  });
  const configuredPath = values.wrangler || process.env.RSVP_WRANGLER_CONFIG || path.join(HERE, "wrangler.jsonc");
  const productionConfigExists = await exists(path.resolve(configuredPath));
  const production = values.production || Boolean(values.wrangler) || Boolean(process.env.RSVP_WRANGLER_CONFIG) || productionConfigExists;

  if (production && !productionConfigExists) {
    const result = {
      ok: false,
      mode: "production",
      productionApiConfigured: false,
      errors: [{
        code: "production_wrangler_missing",
        file: path.relative(ROOT, path.resolve(configuredPath)),
        message: "Production Wrangler config is missing. Copy the example to the ignored worker/wrangler.jsonc and replace every placeholder."
      }]
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const wranglerPath = production ? path.resolve(configuredPath) : path.join(HERE, "wrangler.example.jsonc");
  const [wranglerSource, publicConfigSource, publicHtmlSource, adminHtmlSource, docsSource] = await Promise.all([
    readFile(wranglerPath, "utf8"),
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
    docsSource,
    production,
    wranglerFile: path.relative(ROOT, wranglerPath)
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
