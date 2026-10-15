// Isolated homepage release. Do not import campaign-launch.js: that legacy
// module starts an October 3 redirect as a side effect.
export const DROP = Object.freeze({
  launchAt: '2026-10-15T16:00:00-05:00',
  eventUrl: 'https://d42pe.com/',
  ticketUrl: 'https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX',
  flyerUrl: '/assets/halloweekend/official-flyer.png',
  clockUrl: '/halloweekend/drop-clock.json',
});
export const LAUNCH_MS = Date.parse(DROP.launchAt);

export function serverAnchor(dateHeader, receivedAt) {
  const epoch = Date.parse(dateHeader || '');
  // GitHub Pages refreshes Date while retaining Age. Adding Age would launch
  // minutes early. Use Date alone, conservatively anchored on receipt.
  return Number.isFinite(epoch) ? { epoch, monotonic: receivedAt, trusted: true } : null;
}
export function nowAt(anchor, monotonicNow, deviceNow = Date.now()) {
  return anchor ? anchor.epoch + Math.max(0, monotonicNow - anchor.monotonic) : deviceNow;
}
export function countdown(now, launchAt = LAUNCH_MS) {
  const seconds = Math.max(0, Math.ceil((launchAt - now) / 1000));
  return {
    live: now >= launchAt,
    hours: String(Math.floor(seconds / 3600)).padStart(2, '0'),
    minutes: String(Math.floor(seconds / 60) % 60).padStart(2, '0'),
    seconds: String(seconds % 60).padStart(2, '0'),
  };
}
export function ticketUrl(search = '') {
  const url = new URL(DROP.ticketUrl);
  const incoming = new URLSearchParams(search);
  for (const key of ['ref', 'src', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = incoming.get(key);
    if (value && value.length <= 200) url.searchParams.set(key, value);
  }
  return url.href;
}
export function smsUrl(userAgent = '', platform = '', maxTouchPoints = 0) {
  const apple = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return `sms:+15126107851${apple ? '&' : '?'}body=D42PE`;
}
