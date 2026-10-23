import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DROP, LAUNCH_MS, END_MS, saleState, serverAnchor, nowAt, countdown, ticketUrl, smsUrl } from '../halloweekend/drop-core.js';

test('drop is October 22 at 4 PM Austin CDT, not browser-local time', () => {
  assert.equal(new Date(LAUNCH_MS).toISOString(), '2026-10-22T21:00:00.000Z');
  assert.equal(DROP.eventUrl, 'https://d42pe.com/');
});
test('closed immediately before boundary, live at boundary and for late visitors', () => {
  assert.deepEqual(countdown(LAUNCH_MS - 1), { live: false, hours: '00', minutes: '00', seconds: '01' });
  assert.equal(countdown(LAUNCH_MS).live, true);
  assert.equal(countdown(LAUNCH_MS + 86400000).live, true);
  assert.deepEqual(countdown(LAUNCH_MS - 3661000), { live: false, hours: '01', minutes: '01', seconds: '01' });
});
test('fresh Pages Date anchors time independently of wrong device clock', () => {
  const sample = serverAnchor('Thu, 22 Oct 2026 20:59:00 GMT', 100);
  assert.equal(countdown(nowAt(sample, 10100, LAUNCH_MS + 86400000)).live, false);
  assert.equal(nowAt(sample, 60100, 0), LAUNCH_MS);
  assert.equal(countdown(nowAt(sample, 60100, 0)).live, true);
});
test('response Age is not added to refreshed CDN Date', () => {
  // A real Pages response had Date=current time and Age=155; adding that Age
  // would release the campaign early. The new clock only accepts Date.
  const sample = serverAnchor('Thu, 22 Oct 2026 20:58:00 GMT', 1000);
  assert.equal(sample.epoch, LAUNCH_MS - 120000);
  assert.equal(countdown(nowAt(sample, 1000)).live, false);
});
test('unavailable server clock falls back, trusted clock remains independent', () => {
  assert.equal(serverAnchor(null, 0), null);
  assert.equal(serverAnchor('bad date', 0), null);
  assert.equal(nowAt(null, 900, LAUNCH_MS - 100), LAUNCH_MS - 100);
  const sample = serverAnchor('Thu, 22 Oct 2026 21:00:00 GMT', 1000);
  assert.equal(nowAt(sample, 900, 0), LAUNCH_MS);
});
test('affiliate attribution preserved without allowing ticket endpoint override', () => {
  const url = new URL(ticketUrl('?ref=Promoter42&utm_source=snapchat&url=https://evil.example&unii-trigger-open=other'));
  assert.equal(url.origin, 'https://www.universe.com');
  assert.equal(url.searchParams.get('ref'), 'Promoter42');
  assert.equal(url.searchParams.get('utm_source'), 'snapchat');
  assert.equal(url.searchParams.get('unii-trigger-open'), '7T6MWX');
  assert.equal(url.searchParams.has('url'), false);
  assert.equal(new URL(ticketUrl()).searchParams.get('ref'), 'Website');
});
test('text signup opens composer correctly on iPhone and Android', () => {
  assert.equal(smsUrl('iPhone'), 'sms:+15126107851&body=D42PE');
  assert.equal(smsUrl('Macintosh', 'MacIntel', 5), 'sms:+15126107851&body=D42PE');
  assert.equal(smsUrl('Android'), 'sms:+15126107851?body=D42PE');
});


test('sale closes at midnight Friday night Austin, including late arrivals', () => {
  assert.equal(new Date(END_MS).toISOString(), '2026-10-24T05:00:00.000Z');
  assert.equal(END_MS - LAUNCH_MS, 32 * 60 * 60 * 1000);
  assert.equal(saleState(LAUNCH_MS - 1).phase, 'before');
  assert.equal(saleState(LAUNCH_MS - 1).seconds, '01');
  assert.equal(saleState(LAUNCH_MS).phase, 'live');
  assert.equal(saleState(LAUNCH_MS).hours, '32');
  assert.equal(saleState(END_MS - 1).phase, 'live');
  assert.equal(saleState(END_MS - 1).seconds, '01');
  assert.equal(saleState(END_MS).phase, 'ended');
  assert.equal(saleState(END_MS).price, 16);
  assert.equal(saleState(END_MS + 86400000).phase, 'ended');
});
test('Friday 4 PM and the rest of Friday evening retain the $8 sale', () => {
  const oldCutoff = Date.parse('2026-10-23T16:00:00-05:00');
  for (const now of [oldCutoff - 1, oldCutoff, oldCutoff + 1, Date.parse('2026-10-23T23:59:59.999-05:00')]) {
    assert.equal(saleState(now).phase, 'live');
    assert.equal(saleState(now).price, 8);
  }
  assert.equal(saleState(oldCutoff).hours, '08');
});
test('the UTC boundary is 05:00 Saturday and doubles the base price exactly then', () => {
  const before = saleState(Date.parse('2026-10-24T04:59:59.999Z'));
  assert.equal(before.phase, 'live');
  assert.equal(before.price, 8);
  assert.equal(before.seconds, '01');
  const midnight = saleState(Date.parse('2026-10-24T05:00:00.000Z'));
  assert.equal(midnight.phase, 'ended');
  assert.equal(midnight.price, before.price * 2);
  assert.equal(midnight.seconds, '00');
});
test('an open page reaches midnight using server time despite a wrong device clock', () => {
  const sample = serverAnchor('Sat, 24 Oct 2026 04:59:59 GMT', 100);
  assert.equal(saleState(nowAt(sample, 1099, LAUNCH_MS)).phase, 'live');
  assert.equal(saleState(nowAt(sample, 1100, LAUNCH_MS)).phase, 'ended');
});
test('clock metadata matches the unchanged launch and midnight sale cutoff', () => {
  const clock = JSON.parse(readFileSync(new URL('../halloweekend/drop-clock.json', import.meta.url), 'utf8'));
  assert.equal(clock.launchAt, DROP.launchAt);
  assert.equal(clock.endsAt, DROP.endsAt);
});
test('refreshed time can correct either direction across both boundaries', () => {
  for (const [date, expected] of [
    ['Sat, 24 Oct 2026 05:01:00 GMT', 'ended'],
    ['Fri, 23 Oct 2026 21:01:00 GMT', 'live'],
    ['Thu, 22 Oct 2026 21:01:00 GMT', 'live'],
    ['Thu, 22 Oct 2026 20:59:00 GMT', 'before'],
  ]) {
    assert.equal(saleState(nowAt(serverAnchor(date, 100), 100, END_MS + 86400000)).phase, expected);
  }
});
