import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { STORY_LINK, STORY_CAPTION, STORY_MESSAGE, FREE_MESSAGE, TEXT_NUMBER, smsLink, copyText } from '../vip/vip-core.js';
import { preservedAttribution, getLaunchDestination, RELEASE_CAMPAIGN_CONFIG } from '../campaign-launch.js';

test('Story traffic goes to Halloweekend and keeps its attribution through checkout', () => {
  const story = new URL(STORY_LINK);
  assert.equal(story.origin, 'https://d42pe.com');
  assert.equal(story.pathname, '/halloweekend/');
  const ticket = new URL('https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX');
  for (const [key, value] of new URLSearchParams(preservedAttribution(story.search))) ticket.searchParams.set(key, value);
  assert.equal(ticket.searchParams.get('ref'), 'VIPStory');
  assert.equal(ticket.searchParams.get('utm_medium'), 'story');
  assert.equal(ticket.searchParams.get('unii-trigger-open'), '7T6MWX');
});

test('VIP entry pages never participate in the homepage handoff', () => {
  for (const pathname of ['/vip', '/vip/', '/vip/index.html']) {
    for (const launchEnabled of [false, true]) {
      for (const nowMs of [Date.parse('2026-10-03T20:59:59-05:00'), Date.parse('2026-10-03T21:00:01-05:00')]) {
        assert.equal(getLaunchDestination({ config: { ...RELEASE_CAMPAIGN_CONFIG, launchEnabled }, location: { hostname: 'd42pe.com', pathname, search: '?src=confirmation' }, nowMs }), null);
      }
    }
  }
});

test('Messages handoff supports Apple and Android syntax, preserving recipient and entry type', () => {
  for (const body of [STORY_MESSAGE, FREE_MESSAGE]) {
    const iphone = smsLink(body, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    const ipad = smsLink(body, { platform: 'MacIntel', maxTouchPoints: 5 });
    const android = smsLink(body, { userAgent: 'Mozilla/5.0 (Linux; Android 15)' });
    assert.equal(iphone, `sms:${TEXT_NUMBER}&body=${encodeURIComponent(body)}`);
    assert.equal(ipad, iphone);
    assert.equal(android, `sms:${TEXT_NUMBER}?body=${encodeURIComponent(body)}`);
    assert.equal(decodeURIComponent(android.split('body=')[1]), body);
  }
  assert.notEqual(STORY_MESSAGE, FREE_MESSAGE);
});

test('clipboard success copies only the requested value', async () => {
  const written = [];
  let fallbackCalled = false;
  assert.equal(await copyText(STORY_CAPTION, { writeText: async text => written.push(text) }, () => { fallbackCalled = true; }), true);
  assert.deepEqual(written, ['D42PE giveaway entry']);
  assert.equal(fallbackCalled, false);
});

test('denied or missing clipboard reveals manual copy and never reports success', async () => {
  for (const clipboard of [undefined, {}, { writeText: async () => { throw new Error('Permission denied'); } }]) {
    const fallbackValues = [];
    assert.equal(await copyText(STORY_LINK, clipboard, text => fallbackValues.push(text)), false);
    assert.deepEqual(fallbackValues, [STORY_LINK]);
  }
});

test('entry guide preserves manual validation, genuine free entry, and original artwork', () => {
  const html = readFileSync(new URL('../vip/index.html', import.meta.url), 'utf8');
  assert.match(html, /We’ll check it and confirm your entry by text/);
  assert.match(html, /Multiple winning groups/);
  assert.match(html, /four VIP passes, each valid for both nights/);
  assert.match(html, /Free entries have the same chance of winning/);
  assert.match(html, /entering does not sign you up for promotional texts/);
  assert.match(html, /data-free-sms href="sms:\+15126107851/);
  assert.match(html, /href="\/assets\/halloweekend\/official-flyer.png" download=/);
  assert.doesNotMatch(html, /countdown|closing time|priority entry|bottle service/i);
  assert.doesNotMatch(html, /<form\b|tracking-pixel|gtag\(/);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
    let target = match[1];
    if (target.endsWith('/')) target += 'index.html';
    assert.ok(existsSync(new URL(`..${target}`, import.meta.url)), `Missing local asset or link: ${target}`);
  }
});
