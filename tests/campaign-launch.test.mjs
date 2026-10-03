import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseLaunchAt,
  isLoopbackHost,
  isSafeHttpsUrl,
  validateCampaignConfig,
  isCampaignLive,
  preservedAttribution,
  getLaunchDestination,
  createClockSample,
  clockNow,
  startCampaignLaunch,
  RELEASE_CAMPAIGN_CONFIG,
  campaignConfigRequestUrl,
  fetchCampaignConfig
} from "../campaign-launch.js";

const savedConfig = JSON.parse(await readFile(new URL("../campaign-config.json", import.meta.url), "utf8"));
const launchAt = Date.parse("2026-10-04T02:00:00.000Z");
const armedConfig = { ...savedConfig, launchEnabled: true };
const disarmedConfig = { ...savedConfig, launchEnabled: false };
const publicLocation = { hostname: "d42pe.com", pathname: "/", search: "" };

test("the checked-in release is armed with supplied ticket and profile destinations", () => {
  assert.equal(savedConfig.launchEnabled, true);
  assert.equal(isSafeHttpsUrl(savedConfig.ticketUrl), true);
  assert.ok(savedConfig.instagramPostUrl === null || isSafeHttpsUrl(savedConfig.instagramPostUrl));
  assert.equal(isSafeHttpsUrl(savedConfig.instagram512Url), true);
  assert.equal(isSafeHttpsUrl(savedConfig.snapchatAtxUrl), true);
  assert.equal(savedConfig.launchAt, "2026-10-03T21:00:00-05:00");
  assert.equal(validateCampaignConfig(savedConfig).ok, true);
  assert.equal(validateCampaignConfig(savedConfig).canLaunch, true);
  assert.equal(validateCampaignConfig(RELEASE_CAMPAIGN_CONFIG).canLaunch, true);
  assert.equal(RELEASE_CAMPAIGN_CONFIG.launchAt, savedConfig.launchAt);
  assert.equal(RELEASE_CAMPAIGN_CONFIG.ticketUrl, savedConfig.ticketUrl);
});

test("October 3 at 9 PM Austin CDT is exactly October 4 at 02:00 UTC", () => {
  assert.equal(parseLaunchAt(savedConfig.launchAt), launchAt);
  assert.equal(parseLaunchAt("2026-10-04T02:00:00Z"), launchAt);
  assert.equal(isCampaignLive(armedConfig, launchAt - 1), false);
  assert.equal(isCampaignLive(armedConfig, launchAt), true);
  assert.equal(isCampaignLive(armedConfig, launchAt + 1), true);
});

test("invalid calendars, ambiguous local times, and impossible offsets cannot launch", () => {
  for (const value of [null, "", "tomorrow", "2026-10-03T21:00:00", "2026-10-03", "2026-02-30T21:00:00-05:00", "2026-13-03T21:00:00-05:00", "2026-10-03T24:00:00-05:00", "2026-10-03T21:00:00-25:00", "2026-10-03T21:00:00+14:30"]) {
    assert.equal(parseLaunchAt(value), null, String(value));
    assert.equal(isCampaignLive({ ...armedConfig, launchAt: value }, launchAt + 1), false);
  }
});

test("arming requires an explicit boolean and secure public ticket URL", () => {
  for (const config of [null, [], {}, { ...armedConfig, launchEnabled: "true" }, { ...armedConfig, ticketUrl: null }, { ...armedConfig, ticketUrl: "http://tickets.d42pe.com" }]) {
    assert.equal(validateCampaignConfig(config).canLaunch, false);
    assert.equal(isCampaignLive(config, launchAt + 1), false);
  }
  assert.equal(isCampaignLive({ ...armedConfig, launchEnabled: false }, launchAt + 1), false);
  assert.equal(isCampaignLive(armedConfig, NaN), false);
  assert.equal(validateCampaignConfig(armedConfig).canLaunch, true);
});

test("pending optional social links do not block an otherwise ready launch", () => {
  const pendingSocialConfig = { ...armedConfig, instagramPostUrl: null, instagram512Url: null, snapchatAtxUrl: null };
  assert.equal(isCampaignLive(pendingSocialConfig, launchAt), true);
});

test("URL validation accepts real HTTPS links and rejects schemes, credentials, and private placeholders", () => {
  for (const value of ["https://www.universe.com/events/test?ref=Website", "https://d42pe.com/halloweekend/", "https://www.instagram.com/d42pe.events_atx/"]) assert.equal(isSafeHttpsUrl(value), true);
  for (const value of [null, "", "/tickets/", "//tickets.com", "javascript:alert(1)", "data:text/html,test", "http://d42pe.com", "https://user:password@d42pe.com", " https://d42pe.com", "https://d42pe.com/a b", "https://localhost/", "https://localhost./", "https://127.0.0.1/", "https://10.0.0.1/", "https://172.16.2.3/", "https://192.168.1.1/", "https://169.254.169.254/", "https://[::1]/", "https://tickets.invalid", "https://tickets.test", "https://tickets.example"]) assert.equal(isSafeHttpsUrl(value), false, String(value));
});

test("only loopback hosts qualify for the direct local preview", () => {
  for (const host of ["localhost", "localhost.", "preview.localhost", "127.0.0.1", "127.12.0.2", "::1", "[::1]"]) assert.equal(isLoopbackHost(host), true, host);
  for (const host of ["d42pe.com", "preview.d42pe.com", "localhost.evil.com", "127.0.0.1.evil.com", "127.999.0.1", "192.168.1.1"]) assert.equal(isLoopbackHost(host), false, host);
});

test("root stays ACL before launch and moves to Halloweekend at the exact boundary", () => {
  assert.equal(getLaunchDestination({ config: armedConfig, location: publicLocation, nowMs: launchAt - 1 }), null);
  assert.equal(getLaunchDestination({ config: armedConfig, location: publicLocation, nowMs: launchAt }), "/halloweekend/");
  assert.equal(getLaunchDestination({ config: disarmedConfig, location: publicLocation, nowMs: launchAt + 60_000 }), null);
});

test("ACL, existing ticket, and unrelated routes are never redirected", () => {
  for (const pathname of ["/acl", "/acl/", "/acl/index.html", "/acl/details/", "/tickets", "/tickets/", "/tickets/thank-you/", "/rsvp/", "/privacy/"]) {
    for (const nowMs of [launchAt - 1, launchAt + 1]) {
      assert.equal(getLaunchDestination({ config: armedConfig, location: { ...publicLocation, pathname }, nowMs }), null, pathname);
    }
  }
});

test("the public Halloweekend route is closed before launch or while disarmed", () => {
  for (const pathname of ["/halloweekend", "/halloweekend/", "/halloweekend/index.html"]) {
    const location = { ...publicLocation, pathname };
    assert.equal(getLaunchDestination({ config: disarmedConfig, location, nowMs: launchAt + 1 }), "/");
    assert.equal(getLaunchDestination({ config: armedConfig, location, nowMs: launchAt - 1 }), "/");
    assert.equal(getLaunchDestination({ config: armedConfig, location, nowMs: launchAt }), null);
    for (const unavailableConfig of [null, {}, []]) {
      assert.equal(getLaunchDestination({ config: unavailableConfig, location, nowMs: launchAt }), null);
    }
  }
});

test("loopback Halloweekend preview works while disarmed without a query override", () => {
  assert.equal(getLaunchDestination({ config: disarmedConfig, location: { hostname: "127.0.0.1", pathname: "/halloweekend/", search: "" }, nowMs: launchAt - 86_400_000 }), null);
  assert.equal(getLaunchDestination({ config: armedConfig, location: { ...publicLocation, pathname: "/halloweekend/", search: "?preview=true&launch=true&now=9999999999999" }, nowMs: launchAt - 1 }), "/");
});

test("redirects preserve UTM/ref attribution, but remove preview and arbitrary redirect parameters", () => {
  const search = "?utm_source=instagram&utm_campaign=hall%20night&ref=ritual-x&src=snap&sc_click_id=123&preview=true&redirect=https://evil.com&launchEnabled=true";
  const expected = "?utm_source=instagram&utm_campaign=hall+night&ref=ritual-x&src=snap&sc_click_id=123";
  assert.equal(preservedAttribution(search), expected);
  assert.equal(getLaunchDestination({ config: armedConfig, location: { ...publicLocation, search }, nowMs: launchAt }), `/halloweekend/${expected}`);
  assert.equal(getLaunchDestination({ config: disarmedConfig, location: { ...publicLocation, pathname: "/halloweekend/", search }, nowMs: launchAt }), `/${expected}`);
});

test("server Date and Age override an incorrect phone clock", () => {
  const sample = createClockSample({ dateHeader: "Sun, 04 Oct 2026 01:59:40 GMT", ageHeader: "10", clientNowMs: launchAt + 86_400_000, monotonicNowMs: 300, roundTripMs: 200 });
  assert.equal(sample.source, "server");
  assert.equal(sample.epochMs, launchAt - 9_900);
  assert.equal(clockNow(sample, 400, launchAt + 86_400_000), launchAt - 9_800);
  assert.equal(isCampaignLive(armedConfig, clockNow(sample, 400, launchAt + 86_400_000)), false);
  assert.equal(isCampaignLive(armedConfig, clockNow(sample, 10_200, launchAt - 86_400_000)), true);
});

test("clock fallback is monotonic and ignores invalid Age values", () => {
  const fallback = createClockSample({ dateHeader: null, ageHeader: null, clientNowMs: launchAt - 1_000, monotonicNowMs: 400 });
  assert.equal(fallback.source, "device");
  assert.equal(clockNow(fallback, 900, launchAt + 86_400_000), launchAt - 500);
  assert.equal(clockNow(fallback, 1_400, launchAt - 86_400_000), launchAt);
  for (const ageHeader of ["-10", "bad", "Infinity", "1.5", "9999999999999999999999999999999"]) {
    const sample = createClockSample({ dateHeader: "Sun, 04 Oct 2026 02:00:00 GMT", ageHeader, clientNowMs: 0, monotonicNowMs: 0 });
    assert.equal(sample.epochMs, launchAt);
  }
  assert.equal(createClockSample({ dateHeader: "0", clientNowMs: 123, monotonicNowMs: 0 }).source, "device");
});

test("missing performance timing holds a server observation rather than trusting a wrong device clock", () => {
  const sample = createClockSample({ dateHeader: "Sun, 04 Oct 2026 01:59:59 GMT", clientNowMs: launchAt + 100_000 });
  assert.equal(clockNow(sample, undefined, launchAt + 100_000), launchAt - 1_000);
  assert.equal(clockNow(null, undefined, 1234), 1234);
});

function browserHarness({ config = armedConfig, pathname = "/", hostname = "d42pe.com", serverTimeMs = launchAt - 1_000, deviceTimeMs = launchAt + 86_400_000, storage = new Map(), storageBlocked = false } = {}) {
  let monotonicMs = 100;
  let nextTimerId = 1;
  let responseConfig = config;
  let responseDate = new Date(serverTimeMs).toUTCString();
  let responseAge = null;
  let responseOk = true;
  let failFetch = false;
  let hangFetch = false;
  const timers = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const redirects = [];
  const requests = [];
  const configEvents = [];
  const win = {
    location: { hostname, pathname, search: "?utm_source=instagram", replace: value => redirects.push(value) },
    performance: { now: () => monotonicMs },
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw new Error("Storage blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (storageBlocked) throw new Error("Storage blocked"); storage.set(key, value); }
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent(event) { configEvents.push(event); },
    setTimeout(callback, delay) { const id = nextTimerId++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    removeEventListener(name) { windowEvents.delete(name); }
  };
  const doc = {
    visibilityState: "visible",
    addEventListener(name, callback) { documentEvents.set(name, callback); },
    removeEventListener(name) { documentEvents.delete(name); }
  };
  const fetch = async (path, options) => {
    requests.push({ path, options });
    if (failFetch) throw new Error("offline");
    if (hangFetch) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("Request aborted")), { once: true }));
    return { ok: responseOk, headers: { get: name => name === "Date" ? responseDate : name === "Age" ? responseAge : null }, json: async () => responseConfig };
  };
  return {
    win, doc, fetch, timers, redirects, requests, windowEvents, documentEvents, configEvents, storage,
    now: () => deviceTimeMs,
    setDeviceTime(value) { deviceTimeMs = value; },
    setMonotonic(value) { monotonicMs = value; },
    setResponse(value, date) { responseConfig = value; responseDate = date; },
    setAge(value) { responseAge = value; },
    setOk(value) { responseOk = value; },
    fail() { failFetch = true; },
    hang() { hangFetch = true; },
    fireTimer(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected a ${delay}ms timer`);
      timers.delete(entry[0]);
      entry[1].callback();
    }
  };
}

test("browser bootstrap requests uncached configuration and switches an open page at the deadline", async () => {
  const harness = browserHarness();
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  assert.equal(new URL(harness.requests[0].path, "https://d42pe.com").pathname, "/campaign-config.json");
  assert.match(harness.requests[0].path, /[?&]request=[^&]+/);
  assert.equal(harness.requests[0].options.cache, "no-store");
  assert.deepEqual(harness.redirects, [], "wrong phone clock must not trigger early launch");
  const boundaryTimer = [...harness.timers.values()].find(timer => timer.delay === 1_000);
  assert.ok(boundaryTimer, "timer should target the exact remaining second");
  harness.setMonotonic(1_100);
  boundaryTimer.callback();
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("browser runtime refetches on visibility and BFcache return, and cleanup removes listeners", async () => {
  const harness = browserHarness({ config: disarmedConfig });
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  assert.equal(harness.requests.length, 1);
  harness.documentEvents.get("visibilitychange")();
  await controller.refresh();
  assert.equal(harness.requests.length, 2);
  harness.windowEvents.get("pageshow")({ persisted: true });
  await controller.refresh();
  assert.equal(harness.requests.length, 3);
  assert.equal(new Set(harness.requests.map(request => request.path)).size, 3, "every refresh must use a fresh cache key");
  controller.stop();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.windowEvents.size, 0);
  assert.equal(harness.documentEvents.size, 0);
});

test("a later missing Date or network failure keeps the last trusted server clock", async () => {
  const harness = browserHarness();
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  harness.setMonotonic(500);
  harness.setResponse(armedConfig, null);
  await controller.refresh();
  assert.deepEqual(harness.redirects, [], "missing Date must not replace server time with the phone's wrong time");
  harness.fail();
  harness.setMonotonic(600);
  await controller.refresh();
  assert.deepEqual(harness.redirects, []);
  controller.stop();
});

test("initial network failure uses the approved release without bouncing the destination", async () => {
  for (const { pathname, hostname, deviceTimeMs, expected } of [
    { pathname: "/", hostname: "d42pe.com", deviceTimeMs: launchAt - 1_000, expected: [] },
    { pathname: "/", hostname: "d42pe.com", deviceTimeMs: launchAt + 1_000, expected: ["/halloweekend/?utm_source=instagram"] },
    { pathname: "/halloweekend/", hostname: "127.0.0.1", deviceTimeMs: launchAt - 86_400_000, expected: [] },
    { pathname: "/halloweekend/", hostname: "d42pe.com", deviceTimeMs: launchAt - 86_400_000, expected: [] }
  ]) {
    const harness = browserHarness({ pathname, hostname, deviceTimeMs });
    harness.fail();
    const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
    await controller.ready;
    assert.deepEqual(harness.redirects, expected);
    controller.stop();
  }
});

test("permanent ACL routes do not start runtime timers or configuration requests", () => {
  for (const pathname of ["/acl/", "/tickets/", "/rsvp/"]) {
    const harness = browserHarness({ pathname });
    assert.equal(startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now }), null);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.timers.size, 0);
  }
});

test("a synchronous fetch error does not permanently lock later refreshes", async () => {
  const harness = browserHarness({ config: disarmedConfig, deviceTimeMs: launchAt - 1_000 });
  let requests = 0;
  const fetch = (path, options) => {
    requests += 1;
    if (requests === 1) throw new Error("fetch was temporarily unavailable");
    return harness.fetch(path, options);
  };
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch, now: harness.now });
  await controller.ready;
  await controller.refresh();
  assert.equal(requests, 2);
  assert.equal(harness.requests.length, 1);
  controller.stop();
});

test("a fresh disabled configuration rolls an already-open public Halloweekend page back to ACL", async () => {
  const harness = browserHarness({ pathname: "/halloweekend/", serverTimeMs: launchAt + 1_000 });
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  assert.deepEqual(harness.redirects, []);
  harness.setResponse(disarmedConfig, new Date(launchAt + 2_000).toUTCString());
  await controller.refresh();
  assert.deepEqual(harness.redirects, ["/?utm_source=instagram"]);
  controller.stop();
});

test("the shared fetch helper uses a unique cache key and retains the caller's abort signal", async () => {
  assert.notEqual(campaignConfigRequestUrl(), campaignConfigRequestUrl());
  const abort = new AbortController();
  const requests = [];
  const response = { ok: true };
  const fetch = async (path, options) => { requests.push({ path, options }); return response; };
  assert.equal(await fetchCampaignConfig(fetch, { signal: abort.signal }), response);
  await fetchCampaignConfig(fetch, { signal: abort.signal });
  assert.notEqual(requests[0].path, requests[1].path);
  for (const { path, options } of requests) {
    assert.equal(new URL(path, "https://d42pe.com").pathname, "/campaign-config.json");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.match(options.headers["Cache-Control"], /no-cache/);
    assert.equal(options.signal, abort.signal);
  }
});

test("an HTTP error still supplies server time for the release fallback and exact deadline timer", async () => {
  const harness = browserHarness();
  harness.setOk(false);
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  assert.deepEqual(harness.redirects, [], "a wrong device clock must not outrank the HTTP error response's Date");
  harness.setMonotonic(1_100);
  harness.fireTimer(1_000);
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("an invalid initial config uses release settings with the response's Date and cache Age", async () => {
  const harness = browserHarness({ config: {}, serverTimeMs: launchAt - 11_000 });
  harness.setAge("10");
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  assert.deepEqual(harness.redirects, []);
  assert.equal(harness.configEvents.length, 0, "invalid config must not reach UI consumers");
  harness.setMonotonic(1_100);
  harness.fireTimer(1_000);
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("malformed later configurations preserve a live page until an explicit rollback arrives", async () => {
  const harness = browserHarness({ pathname: "/halloweekend/", serverTimeMs: launchAt + 1_000 });
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  for (const invalid of [{}, null, [], { ...armedConfig, launchAt: "invalid" }, { ...armedConfig, ticketUrl: null }]) {
    harness.setResponse(invalid, new Date(launchAt + 2_000).toUTCString());
    await controller.refresh();
    assert.deepEqual(harness.redirects, []);
    assert.equal(harness.configEvents.length, 1, "only validated configurations should be dispatched");
  }
  harness.setResponse(disarmedConfig, new Date(launchAt + 3_000).toUTCString());
  await controller.refresh();
  assert.deepEqual(harness.redirects, ["/?utm_source=instagram"]);
  controller.stop();
});

test("network failures never replace known disabled or rescheduled settings with the release fallback", async () => {
  for (const config of [disarmedConfig, { ...armedConfig, launchAt: "2026-10-03T22:00:00-05:00" }]) {
    const harness = browserHarness({ config, serverTimeMs: launchAt + 1_000 });
    const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
    await controller.ready;
    harness.fail();
    harness.setMonotonic(2_100);
    await controller.refresh();
    assert.deepEqual(harness.redirects, []);
    assert.equal(harness.configEvents.length, 1);
    controller.stop();
  }
});

test("a confirmed rollback survives navigation when the homepage's next request fails", async () => {
  const storage = new Map();
  const landing = browserHarness({ storage, config: disarmedConfig, pathname: "/halloweekend/", serverTimeMs: launchAt + 1_000 });
  const landingController = startCampaignLaunch({ window: landing.win, document: landing.doc, fetch: landing.fetch, now: landing.now });
  await landingController.ready;
  assert.deepEqual(landing.redirects, ["/?utm_source=instagram"]);
  landingController.stop();

  const home = browserHarness({ storage, deviceTimeMs: launchAt + 86_400_000 });
  home.fail();
  const homeController = startCampaignLaunch({ window: home.win, document: home.doc, fetch: home.fetch, now: home.now });
  await homeController.ready;
  assert.deepEqual(home.redirects, [], "the bundled release must not undo the known rollback");
  homeController.stop();
});

test("a successful handoff stays on Halloweekend if its first request fails and the phone clock is behind", async () => {
  const storage = new Map();
  const home = browserHarness({ storage, serverTimeMs: launchAt + 1_000 });
  const homeController = startCampaignLaunch({ window: home.win, document: home.doc, fetch: home.fetch, now: home.now });
  await homeController.ready;
  assert.deepEqual(home.redirects, ["/halloweekend/?utm_source=instagram"]);
  homeController.stop();

  const landing = browserHarness({ storage, pathname: "/halloweekend/", deviceTimeMs: launchAt - 86_400_000 });
  landing.fail();
  const landingController = startCampaignLaunch({ window: landing.win, document: landing.doc, fetch: landing.fetch, now: landing.now });
  await landingController.ready;
  assert.deepEqual(landing.redirects, []);
  landingController.stop();
});

test("device-clock fallback remains monotonic across refreshes without Date headers", async () => {
  const harness = browserHarness({ deviceTimeMs: launchAt - 1_000 });
  harness.setResponse(armedConfig, null);
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  harness.setDeviceTime(launchAt + 86_400_000);
  await controller.refresh();
  assert.deepEqual(harness.redirects, [], "changing the phone clock must not replace the existing monotonic anchor");
  harness.setMonotonic(1_100);
  harness.fireTimer(1_000);
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("a resumed tab corrects a suspended monotonic clock using fresh server time", async () => {
  const harness = browserHarness();
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  harness.setResponse(armedConfig, new Date(launchAt + 60_000).toUTCString());
  harness.documentEvents.get("visibilitychange")();
  await controller.refresh();
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("a hung initial request aborts after eight seconds and uses the release fallback", async () => {
  const harness = browserHarness({ deviceTimeMs: launchAt + 1_000 });
  harness.hang();
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await Promise.resolve();
  harness.fireTimer(8_000);
  await controller.ready;
  assert.equal(harness.requests[0].options.signal.aborted, true);
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});

test("stopping an in-flight request prevents fallback redirects and removes all timers", async () => {
  const harness = browserHarness({ deviceTimeMs: launchAt + 1_000 });
  harness.hang();
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await Promise.resolve();
  controller.stop();
  await controller.ready;
  assert.deepEqual(harness.redirects, []);
  assert.equal(harness.timers.size, 0);
});

test("unavailable session storage does not prevent server-timed launch", async () => {
  const harness = browserHarness({ storageBlocked: true });
  const controller = startCampaignLaunch({ window: harness.win, document: harness.doc, fetch: harness.fetch, now: harness.now });
  await controller.ready;
  harness.setMonotonic(1_100);
  harness.fireTimer(1_000);
  assert.deepEqual(harness.redirects, ["/halloweekend/?utm_source=instagram"]);
  controller.stop();
});
