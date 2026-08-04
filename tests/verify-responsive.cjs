#!/usr/bin/env node

const fs = require("node:fs/promises");
const modulePath = require("node:module");
const path = require("node:path");

if (process.env.D42PE_NODE_MODULES) {
  modulePath.Module._nodeModulePaths(process.env.D42PE_NODE_MODULES)
    .reverse()
    .forEach(candidate => module.paths.unshift(candidate));
}

const { chromium, webkit } = require("playwright");

const baseUrl = process.env.D42PE_BASE_URL || "http://127.0.0.1:4173";
const reportPath = process.env.D42PE_RESPONSIVE_REPORT || "/tmp/d42pe-responsive-update.json";
const widths = [320, 375, 390, 768, 1024, 1440];
const routes = [
  { path: "/", h1: "NEXT EVENT COMING SOON." },
  { path: "/join/", h1: "STAY TAPPED IN" },
  { path: "/portfolio/", h1: "SELECTED WORK" }
];
const engines = [
  ["Chromium", chromium],
  ["WebKit", webkit]
];

async function inspect(engineName, engine, width, route) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 1000 },
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const requests = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("response", response => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });

  const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "load" });
  const result = await page.evaluate(expectedH1 => {
    const root = document.documentElement;
    const h1 = document.querySelector("h1");
    const h1Rect = h1.getBoundingClientRect();
    const focusables = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
      .filter(element => !element.hasAttribute("disabled") && element.getAttribute("tabindex") !== "-1")
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          name: element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " "),
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
          width: rect.width,
          height: rect.height
        };
      });
    return {
      title: document.title,
      h1: h1.textContent.trim(),
      expectedH1,
      h1Clipped: h1Rect.left < -0.5 || h1Rect.right > root.clientWidth + 0.5 || h1.scrollWidth > h1.clientWidth + 1,
      clientWidth: root.clientWidth,
      scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth),
      undersized: focusables.filter(item => item.visible && (item.width < 44 || item.height < 44)),
      unnamed: focusables.filter(item => item.visible && !item.name),
      footerFixed: getComputedStyle(document.querySelector("footer")).position === "fixed",
      footerInsideMain: Boolean(document.querySelector("main footer")),
      images: document.images.length,
      videos: document.querySelectorAll("video").length,
      portfolioLinks: document.querySelectorAll('a[href*="/portfolio/"]').length,
      robots: document.querySelector('meta[name="robots"]')?.content || null,
      tableOverflows: [...document.querySelectorAll(".data-table-wrap")]
        .filter(element => element.scrollWidth > element.clientWidth + 1).length
    };
  }, route.h1);

  // Safari/WebKit follows macOS's default link-focus behavior, where Option+Tab
  // advances to links unless full keyboard access is enabled. Chromium uses Tab.
  await page.keyboard.press(engineName === "WebKit" ? "Alt+Tab" : "Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      name: element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " "),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      visible: element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
    };
  });

  await browser.close();
  const sameOrigin = requests.every(url => new URL(url).origin === new URL(baseUrl).origin);
  const previewRequests = requests.filter(url => url.includes("social-preview"));
  const pass = response?.status() === 200 &&
    result.h1 === route.h1 &&
    !result.h1Clipped &&
    result.scrollWidth <= result.clientWidth &&
    result.undersized.length === 0 &&
    result.unnamed.length === 0 &&
    !result.footerFixed &&
    !result.footerInsideMain &&
    result.images === 0 &&
    result.videos === 0 &&
    result.tableOverflows === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    failedRequests.length === 0 &&
    badResponses.length === 0 &&
    sameOrigin &&
    previewRequests.length === 0 &&
    focus.visible && focus.name && focus.outlineStyle !== "none" && focus.outlineWidth !== "0px" &&
    (route.path === "/portfolio/" ? result.robots === "noindex,nofollow,noarchive" : result.portfolioLinks === 0);

  return {
    engine: engineName,
    width,
    route: route.path,
    status: response?.status() || null,
    requests,
    consoleErrors,
    pageErrors,
    failedRequests,
    badResponses,
    focus,
    ...result,
    pass
  };
}

async function navigationCheck(engineName, engine) {
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  await page.getByRole("link", { name: "View Socials", exact: true }).click();
  await page.waitForURL(/\/join\/$/);
  const joinH1 = await page.locator("h1").innerText();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/");
  const homeH1 = await page.locator("h1").innerText();
  await browser.close();
  return { engine: engineName, pass: joinH1 === "STAY TAPPED IN" && homeH1 === "NEXT EVENT COMING SOON.", joinH1, homeH1 };
}

async function main() {
  const results = [];
  const navigation = [];
  for (const [engineName, engine] of engines) {
    for (const width of widths) {
      for (const route of routes) results.push(await inspect(engineName, engine, width, route));
    }
    navigation.push(await navigationCheck(engineName, engine));
  }
  const failures = [...results.filter(item => !item.pass), ...navigation.filter(item => !item.pass)];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    widths,
    routes: routes.map(route => route.path),
    cases: results.length,
    passed: results.filter(item => item.pass).length,
    navigation,
    failures,
    results
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ reportPath, cases: report.cases, passed: report.passed, navigation, failures: failures.length }, null, 2) + "\n");
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
