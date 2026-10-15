/* Run against a local server only. Native share and clipboard are stubbed. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium, webkit } = require(process.env.D42PE_PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.D42PE_DROP_TEST_URL || 'http://127.0.0.1:4184';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Use a local server');
const OUT = process.env.D42PE_DROP_QA_DIR || '/tmp/d42pe-oct15-qa';
const BEFORE = Date.parse('2026-10-15T20:00:00Z');
const LIVE = Date.parse('2026-10-15T21:00:00Z');
const FLYER = '/assets/halloweekend/official-flyer.png';
const results = [];

async function waitFor(page, fn, message) {
  try { await page.waitForFunction(fn, null, { timeout: 6000 }); }
  catch (error) { throw new Error(`${message}: ${error.message}`); }
}

async function setup(browser, width, epoch, { clockUnavailable = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Pacific/Honolulu' });
  // The device is intentionally a day wrong in the opposite direction. The
  // release must follow the server Date, independent of device timezone.
  await context.addInitScript(({ deviceNow }) => {
    Date.now = () => deviceNow;
    window.__shares = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied for test'); } } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => Boolean(files?.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => {
      const files = await Promise.all((payload.files || []).map(async file => ({
        name: file.name,
        type: file.type,
        size: file.size,
        sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join(''),
      })));
      window.__shares.push({ ...payload, files });
    } });
  }, { deviceNow: epoch < LIVE ? LIVE + 86400000 : BEFORE - 86400000 });
  const page = await context.newPage();
  const state = { epoch, clockRequests: 0, flyerRequests: [], errors: [], navigations: 0 };
  await page.route('**/halloweekend/drop-clock.json?*', async route => {
    state.clockRequests += 1;
    if (clockUnavailable) return route.abort('failed');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { Date: new Date(state.epoch).toUTCString(), Age: '1800', 'Cache-Control': 'no-store' }, body: '{}' });
  });
  page.on('request', request => {
    if (/\/assets\/halloweekend\/(official-flyer\.png|flyer-\d+\.webp)/.test(request.url())) state.flyerRequests.push(request.url());
  });
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) state.navigations += 1; });
  await page.goto(`${BASE}/?ref=DropQA&utm_source=story`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.phase !== 'checking');
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1000))]));
  return { page, context, state };
}

async function geometry(page) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const targets = [...document.querySelectorAll('a[href], button, input')].filter(node => {
      const r = node.getBoundingClientRect();
      const css = getComputedStyle(node);
      return !node.closest('[inert]') && r.width && r.height && css.visibility !== 'hidden' && css.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < width;
    });
    return { overflow: document.documentElement.scrollWidth - width, small: targets.map(node => {
      const r = node.getBoundingClientRect();
      return { label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 50), width: r.width, height: r.height };
    }).filter(r => r.width < 43.5 || r.height < 43.5) };
  });
  assert.ok(result.overflow <= 1, `Horizontal overflow: ${result.overflow}px`);
  assert.deepEqual(result.small, [], 'Visible controls have at least 44px targets');
}

async function assertLive(page, state, flyerHash) {
  await waitFor(page, () => document.body.dataset.phase === 'live', 'Live phase');
  assert.equal(await page.locator('[data-before-drop]').first().isVisible(), false);
  assert.equal(await page.locator('[data-primary-after]').isVisible(), true);
  const ticket = new URL(await page.locator('[data-ticket]').first().getAttribute('href'));
  assert.equal(ticket.hostname, 'www.universe.com');
  assert.equal(ticket.searchParams.get('unii-trigger-open'), '7T6MWX');
  assert.equal(ticket.searchParams.get('ref'), 'DropQA');
  assert.equal(ticket.searchParams.get('utm_source'), 'story');
  await waitFor(page, () => { const i = document.querySelector('[data-flyer-image]'); return i.complete && i.naturalWidth > 0; }, 'Flyer loaded');
  await waitFor(page, () => !document.querySelector('[data-native-flyer]').disabled, 'Native flyer prepared');
  await page.locator('[data-share-flyer]').first().click();
  await waitFor(page, () => window.__shares.some(share => share.files.length), 'File sharing stub');
  const shared = await page.evaluate(() => window.__shares.find(share => share.files.length));
  assert.deepEqual(shared.files.map(file => ({ name: file.name, type: file.type, sha256: file.sha256 })), [{ name: 'D42PE-Halloweekend-Official.png', type: 'image/png', sha256: flyerHash }]);
  assert.ok(state.flyerRequests.length > 0, 'Flyer requested after launch');
  assert.equal(await page.locator('a[download="D42PE-Halloweekend-Official.png"]').first().getAttribute('href'), FLYER);
}

async function fallback(page) {
  await page.locator('[data-copy-link]:visible').first().click();
  assert.equal(await page.locator('[data-share-dialog]').getAttribute('open'), '');
  assert.equal(await page.locator('[data-manual-link]').inputValue(), 'https://d42pe.com/');
  assert.equal(await page.locator('.manual-copy').isVisible(), true);
  assert.equal(await page.locator('[data-manual-link]').evaluate(n => n.selectionStart === 0 && n.selectionEnd === n.value.length), true);
  await geometry(page);
  await page.locator('[data-close-dialog]').click();
}

async function sticky(page, width, selector) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-sticky]').evaluate(n => n.classList.contains('is-visible')), false, 'Sticky stays hidden above primary CTA');
  if (width >= 900) return;
  await page.locator(selector).evaluate(node => scrollTo(0, node.getBoundingClientRect().bottom + scrollY + 24));
  if (await page.locator(selector).evaluate(node => node.getBoundingClientRect().bottom >= 0)) {
    // The short pre-launch page can end before its primary CTA leaves view.
    assert.equal(await page.locator('[data-sticky]').evaluate(n => n.classList.contains('is-visible')), false);
    await page.evaluate(() => scrollTo(0, 0));
    return;
  }
  await waitFor(page, () => document.querySelector('[data-sticky]').classList.contains('is-visible'), 'Sticky appears after primary CTA');
  assert.equal(await page.locator('[data-sticky]').getAttribute('aria-hidden'), 'false');
  assert.equal(await page.locator('[data-sticky]').evaluate(n => n.inert), false);
  await geometry(page);
  await page.evaluate(() => scrollTo(0, 0));
  await waitFor(page, () => !document.querySelector('[data-sticky]').classList.contains('is-visible'), 'Sticky hides again on returning to the top');
  await page.waitForTimeout(220);
}

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  const flyerHash = createHash('sha256').update(await fs.readFile(path.join(__dirname, '..', FLYER))).digest('hex');
  for (const [name, browserType] of Object.entries({ chromium, webkit })) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of [320, 390, 1280]) {
        for (const phase of ['countdown', 'live']) {
          const { page, context, state } = await setup(browser, width, phase === 'countdown' ? BEFORE : LIVE);
          const label = `${name}-${width}-${phase}`;
          try {
            await waitFor(page, () => document.body.dataset.phase !== 'checking', 'Initial clock check');
            assert.equal(await page.locator('body').getAttribute('data-phase'), phase);
            assert.equal(await page.locator('[data-text-signup]').count(), 1);
            assert.match(await page.locator('[data-text-signup]').getAttribute('href'), /^sms:\+15126107851[?&]body=D42PE$/);
            assert.equal(await page.locator('[data-social]').count(), 4);
            await geometry(page);
            if (phase === 'countdown') {
              assert.equal(await page.locator('[data-ticket][href]').count(), 0);
              assert.equal(await page.locator('[data-flyer-image]').isVisible(), false);
              assert.deepEqual(state.flyerRequests, [], 'No flyer requested early');
              assert.equal(await page.locator('[data-hours]').textContent(), '01');
              await page.locator('[data-share-drop]').first().click();
              assert.equal(await page.evaluate(() => window.__shares[0].url), 'https://d42pe.com/');
              await fallback(page);
              await sticky(page, width, '[data-primary-before]');
            } else {
              await assertLive(page, state, flyerHash);
              await fallback(page);
              await sticky(page, width, '[data-primary-after]');
            }
            await page.screenshot({ path: path.join(OUT, `${label}.png`) });
            if (width === 390) await page.screenshot({ path: path.join(OUT, `${label}-full.png`), fullPage: true });
            if (phase === 'countdown' && width === 390) {
              for (const event of ['pageshow', 'online']) {
                const n = state.clockRequests;
                await page.evaluate(type => dispatchEvent(new Event(type)), event);
                await page.waitForFunction(() => document.body.dataset.phase === 'countdown');
                await page.waitForTimeout(100);
                assert.ok(state.clockRequests > n, `${event} refreshes server time`);
              }
              state.epoch = LIVE;
              await page.evaluate(() => dispatchEvent(new Event('online')));
              await assertLive(page, state, flyerHash);
              assert.equal(state.navigations, 1, 'Online resync reveals without navigation');
            }
            assert.deepEqual(state.errors, [], 'No JavaScript exceptions');
            results.push({ name: label, passed: true, clockRequests: state.clockRequests });
          } finally { await context.close(); }
        }
      }
      const { page, context, state } = await setup(browser, 390, LIVE - 2000);
      try {
        assert.equal(await page.locator('body').getAttribute('data-phase'), 'countdown');
        assert.deepEqual(state.flyerRequests, []);
        await assertLive(page, state, flyerHash);
        assert.equal(state.navigations, 1, 'Natural launch boundary does not reload');
        assert.equal(state.clockRequests, 1, 'Natural launch uses monotonic clock after one server sample');
        assert.deepEqual(state.errors, []);
        results.push({ name: `${name}-natural-boundary`, passed: true });
      } finally { await context.close(); }
      const failedClock = await setup(browser, 390, LIVE, { clockUnavailable: true });
      try {
        assert.equal(await failedClock.page.locator('body').getAttribute('data-phase'), 'countdown', 'Failed clock request falls back to device time without stranding checking');
        assert.equal(await failedClock.page.locator('[data-share-drop]').first().isVisible(), true);
        assert.deepEqual(failedClock.state.flyerRequests, []);
        assert.deepEqual(failedClock.state.errors, []);
        results.push({ name: `${name}-clock-unavailable-fallback`, passed: true });
      } finally { await failedClock.context.close(); }
    } finally { await browser.close(); }
  }
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ passed: true, flyerHash, results }, null, 2));
  console.log(`PASS: ${results.length} Chromium/WebKit viewport and boundary scenarios. Screenshots: ${OUT}`);
})().catch(async error => {
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ passed: false, results, error: error.stack }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
