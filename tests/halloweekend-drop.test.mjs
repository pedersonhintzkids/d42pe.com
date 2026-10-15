import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP, LAUNCH_MS, serverAnchor, nowAt, countdown, ticketUrl, smsUrl } from '../halloweekend/drop-core.js';

test('drop is October 15 at 4 PM Austin CDT, not browser-local time', () => {
  assert.equal(new Date(LAUNCH_MS).toISOString(), '2026-10-15T21:00:00.000Z');
  assert.equal(DROP.eventUrl, 'https://d42pe.com/');
});
test('closed immediately before boundary, live at boundary and for late visitors', () => {
  assert.deepEqual(countdown(LAUNCH_MS - 1), { live: false, hours: '00', minutes: '00', seconds: '01' });
  assert.equal(countdown(LAUNCH_MS).live, true);
  assert.equal(countdown(LAUNCH_MS + 86400000).live, true);
  assert.deepEqual(countdown(LAUNCH_MS - 3661000), { live: false, hours: '01', minutes: '01', seconds: '01' });
});
test('fresh Pages Date anchors time independently of wrong device clock', () => {
  const sample = serverAnchor('Thu, 15 Oct 2026 20:59:00 GMT', 100);
  assert.equal(countdown(nowAt(sample, 10100, LAUNCH_MS + 86400000)).live, false);
  assert.equal(nowAt(sample, 60100, 0), LAUNCH_MS);
  assert.equal(countdown(nowAt(sample, 60100, 0)).live, true);
});
test('response Age is not added to refreshed CDN Date', () => {
  // A real Pages response had Date=current time and Age=155; adding that Age
  // would release the campaign early. The new clock only accepts Date.
  const sample = serverAnchor('Thu, 15 Oct 2026 20:58:00 GMT', 1000);
  assert.equal(sample.epoch, LAUNCH_MS - 120000);
  assert.equal(countdown(nowAt(sample, 1000)).live, false);
});
test('unavailable server clock falls back, trusted clock remains independent', () => {
  assert.equal(serverAnchor(null, 0), null);
  assert.equal(serverAnchor('bad date', 0), null);
  assert.equal(nowAt(null, 900, LAUNCH_MS - 100), LAUNCH_MS - 100);
  const sample = serverAnchor('Thu, 15 Oct 2026 21:00:00 GMT', 1000);
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
