const CONFIG_PATH = "/campaign-config.json";
const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const STORED_CONFIG_KEY = "d42pe:halloweekend:2026-10-03:campaign";
const REQUEST_SESSION = Math.random().toString(36).slice(2);
let requestNumber = 0;
const ATTRIBUTION_KEYS = new Set(["ref", "src", "fbclid", "igshid", "sc_click_id"]);

// Approved release settings keep the scheduled handoff available if its first JSON request fails.
// A validated server or session configuration, including an explicit rollback, always takes priority.
export const RELEASE_CAMPAIGN_CONFIG = Object.freeze({
  launchEnabled: true,
  launchAt: "2026-10-03T21:00:00-05:00",
  ticketUrl: "https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX"
});

/** A fresh URL also bypasses shared caches that ignore the browser's cache option. */
export function campaignConfigRequestUrl() {
  return `${CONFIG_PATH}?release=20261003&request=${REQUEST_SESSION}-${++requestNumber}`;
}

export function fetchCampaignConfig(fetcher = globalThis.fetch, { signal } = {}) {
  return fetcher(campaignConfigRequestUrl(), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache, no-store" },
    signal
  });
}

/** Require a complete ISO timestamp with an explicit offset; never infer a device timezone. */
export function parseLaunchAt(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  if (zone !== "Z") {
    const [offsetHour, offsetMinute] = zone.slice(1).split(":").map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function isLoopbackHost(hostname) {
  if (typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  return /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host) && host.split(".").every(part => Number(part) <= 255);
}

/** External campaign links must be explicit HTTPS URLs, with no embedded credentials. */
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || !value || value.trim() !== value || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || isLoopbackHost(url.hostname)) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host.includes(".") || /\.(?:localhost|local|invalid|test|example)$/.test(host)) return false;
    if (/^\d+(?:\.\d+){3}$/.test(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Incomplete preview links are allowed, but a real ticket URL is required to arm launch. */
export function validateCampaignConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { ok: false, errors: ["Campaign configuration must be an object."], launchAtMs: null, canLaunch: false };
  }
  if (typeof config.launchEnabled !== "boolean") errors.push("launchEnabled must be a boolean.");
  const launchAtMs = parseLaunchAt(config.launchAt);
  if (launchAtMs === null) errors.push("launchAt must be a valid ISO timestamp with an explicit timezone.");
  const validTickets = isSafeHttpsUrl(config.ticketUrl);
  if (config.ticketUrl !== null && config.ticketUrl !== undefined && !validTickets) errors.push("ticketUrl must be a public HTTPS URL.");
  if (config.launchEnabled === true && !validTickets) errors.push("A ticket URL is required before launch can be enabled.");
  return {
    ok: errors.length === 0,
    errors,
    launchAtMs,
    canLaunch: errors.length === 0 && config.launchEnabled === true && validTickets
  };
}

export function isCampaignLive(config, nowMs) {
  const result = validateCampaignConfig(config);
  return result.canLaunch && Number.isFinite(nowMs) && nowMs >= result.launchAtMs;
}

/** Carry campaign attribution through internal redirects; never carry a launch override. */
export function preservedAttribution(search = "") {
  const kept = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (/^utm_[a-z0-9_]+$/i.test(key) || ATTRIBUTION_KEYS.has(key.toLowerCase())) kept.append(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}

export function getLaunchDestination({ config, location, nowMs }) {
  if (!location) return null;
  const path = location.pathname || "/";
  // These are permanent ACL routes, including any nested ticket/confirmation paths.
  if (/^\/(?:acl|tickets)(?:\/|$)/.test(path)) return null;
  const isHomepage = path === "/" || path === "/index.html";
  const isHalloweekend = path === "/halloweekend" || path === "/halloweekend/" || path === "/halloweekend/index.html";
  if (!isHomepage && !isHalloweekend) return null;
  // An unavailable or malformed observation is not an instruction to roll back a live page.
  if (!validateCampaignConfig(config).ok) return null;
  const live = isCampaignLive(config, nowMs);
  const query = preservedAttribution(location.search);
  if (isHomepage && live) return `/halloweekend/${query}`;
  if (isHalloweekend && !live && !isLoopbackHost(location.hostname)) return `/${query}`;
  return null;
}

/** Anchor server time to performance.now so a phone clock change does not move the launch. */
export function createClockSample({ dateHeader, ageHeader, clientNowMs, monotonicNowMs, roundTripMs = 0 }) {
  const dateIsHttp = typeof dateHeader === "string" && /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(dateHeader);
  const serverDateMs = dateIsHttp ? Date.parse(dateHeader) : NaN;
  const ageSeconds = typeof ageHeader === "string" && /^\d+$/.test(ageHeader.trim()) ? Number(ageHeader.trim()) : 0;
  const parsedAgeMs = ageSeconds * 1_000;
  const safeAgeMs = Number.isSafeInteger(parsedAgeMs) && parsedAgeMs >= 0 && Number.isSafeInteger(serverDateMs + parsedAgeMs) ? parsedAgeMs : 0;
  const transitMs = Number.isFinite(roundTripMs) && roundTripMs > 0 ? Math.min(roundTripMs / 2, 2_000) : 0;
  const hasServerTime = Number.isFinite(serverDateMs) && Number.isSafeInteger(serverDateMs + safeAgeMs);
  return {
    epochMs: hasServerTime ? serverDateMs + safeAgeMs + transitMs : clientNowMs,
    monotonicMs: Number.isFinite(monotonicNowMs) ? monotonicNowMs : null,
    source: hasServerTime ? "server" : "device"
  };
}

export function clockNow(sample, monotonicNowMs, fallbackNowMs) {
  if (!sample || !Number.isFinite(sample.epochMs)) return fallbackNowMs;
  if (Number.isFinite(sample.monotonicMs) && Number.isFinite(monotonicNowMs)) {
    return sample.epochMs + Math.max(0, monotonicNowMs - sample.monotonicMs);
  }
  // Hold the last server observation rather than jumping to an untrusted device clock.
  return sample.source === "server" ? sample.epochMs : fallbackNowMs;
}

function readStoredConfig(win) {
  try {
    const stored = JSON.parse(win.sessionStorage?.getItem(STORED_CONFIG_KEY) || "null");
    return validateCampaignConfig(stored).ok ? stored : null;
  } catch {
    return null;
  }
}

function storeConfig(win, config) {
  try {
    // Preserve just the public routing settings across the root/landing-page navigation.
    const { launchEnabled, launchAt, ticketUrl } = config;
    win.sessionStorage?.setItem(STORED_CONFIG_KEY, JSON.stringify({ launchEnabled, launchAt, ticketUrl }));
  } catch {
    // Storage may be unavailable in privacy modes; the current page still retains its valid config.
  }
}

/** Start only on routes involved in the homepage handoff. Returns a stop hook for tests/previews. */
export function startCampaignLaunch({ window: win = globalThis.window, document: doc = globalThis.document, fetch: fetchOverride, now = () => Date.now() } = {}) {
  if (!win || !doc || !/^\/(?:index\.html|halloweekend(?:\/index\.html|\/)?)?$/.test(win.location.pathname)) return null;
  const fetcher = fetchOverride || win.fetch.bind(win);
  const monotonicNow = () => win.performance?.now?.();
  let config = readStoredConfig(win);
  let clock = null;
  let timer = null;
  let inFlight = null;
  let stopped = false;
  let redirected = false;
  let activeRequest = null;

  const currentTime = () => clockNow(clock, monotonicNow(), now());

  function evaluate() {
    if (stopped || redirected) return false;
    // A wrong device clock must not undo the root's handoff when the destination cannot get time.
    // An explicit disabled config still rolls back immediately, without needing a clock.
    if (win.location.pathname.startsWith("/halloweekend") && config?.launchEnabled === true && clock?.source !== "server") return false;
    const destination = getLaunchDestination({ config, location: win.location, nowMs: currentTime() });
    if (destination) {
      redirected = true;
      win.location.replace(destination);
      return true;
    }
    return false;
  }

  function schedule() {
    win.clearTimeout(timer);
    if (stopped || redirected) return;
    const { canLaunch, launchAtMs } = validateCampaignConfig(config);
    const untilLaunch = canLaunch ? launchAtMs - currentTime() : Infinity;
    const delay = untilLaunch > 0 ? Math.min(POLL_INTERVAL_MS, Math.max(100, untilLaunch)) : POLL_INTERVAL_MS;
    timer = win.setTimeout(() => {
      // An already-open ACL homepage switches at the deadline using its server-time anchor.
      if (!evaluate()) void refresh();
    }, delay);
  }

  function refresh() {
    if (stopped || redirected) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(async () => {
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = win.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const startedAt = monotonicNow();
      try {
        const response = await fetchCampaignConfig(fetcher, { signal: controller.signal });
        const receivedAt = monotonicNow();
        const receivedClientTime = now();
        if (stopped) return;
        // Even an HTTP error can supply trustworthy server time for the bundled release settings.
        const sample = createClockSample({
          dateHeader: response.headers.get("Date"),
          ageHeader: response.headers.get("Age"),
          clientNowMs: receivedClientTime,
          monotonicNowMs: receivedAt,
          roundTripMs: Number.isFinite(startedAt) && Number.isFinite(receivedAt) ? receivedAt - startedAt : 0
        });
        if (sample.source === "server" || !clock) clock = sample;
        if (!response.ok) throw new Error("Campaign configuration was unavailable.");
        const nextConfig = await response.json();
        if (stopped) return;
        if (!validateCampaignConfig(nextConfig).ok) throw new Error("Campaign configuration was invalid.");
        config = nextConfig;
        storeConfig(win, config);
        if (typeof win.CustomEvent === "function") {
          win.dispatchEvent(new win.CustomEvent("campaign-config", { detail: { config, clockSource: clock.source } }));
        }
        evaluate();
      } catch {
        if (!stopped) {
          // Never replace a validated response (especially a rollback) with bundled launch settings.
          if (!config && validateCampaignConfig(RELEASE_CAMPAIGN_CONFIG).ok) config = RELEASE_CAMPAIGN_CONFIG;
          if (!clock) clock = createClockSample({ clientNowMs: now(), monotonicNowMs: monotonicNow() });
          evaluate();
        }
      } finally {
        win.clearTimeout(timeout);
        activeRequest = null;
        inFlight = null;
        schedule();
      }
    });
    return inFlight;
  }

  function onVisibility() {
    if (doc.visibilityState === "visible") void refresh();
  }
  function onPageShow() { void refresh(); }
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pageshow", onPageShow);
  const ready = refresh();

  return {
    ready,
    refresh,
    stop() {
      stopped = true;
      win.clearTimeout(timer);
      activeRequest?.abort();
      doc.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("pageshow", onPageShow);
    }
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") startCampaignLaunch();
