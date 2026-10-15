import { DROP, countdown, nowAt, serverAnchor, smsUrl, ticketUrl } from './drop-core.js?v=20261015-1';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let anchor = null;
let checked = false;
let live = false;
let clockRequest = null;
let flyerFile = null;
let flyerLoading = false;
let toastTimer;
let observer;
const dialog = $('[data-share-dialog]');
const shareUrl = DROP.eventUrl;

function toast(message) {
  const node = $('[data-toast]');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 4000);
}
function openShare() {
  $('#share-title').textContent = live ? 'Post on your story' : 'Share the drop';
  $('[data-share-description]').textContent = live ? 'Share the flyer. Add the ticket link.' : 'Send the countdown to your friends.';
  $('.manual-copy').hidden = true;
  $('[data-copy-status]').hidden = true;
  if (!dialog.open) dialog.showModal();
  if (live) prepareFlyer();
}
async function copyLink() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(shareUrl);
    if (dialog.open) {
      $('[data-copy-status]').hidden = false;
      $('[data-copy-status]').textContent = 'Link copied. Paste it into your message or story link sticker.';
    } else toast('Website link copied');
  } catch {
    openShare();
    $('.manual-copy').hidden = false;
    const field = $('[data-manual-link]');
    field.value = shareUrl;
    field.focus();
    field.select();
    field.setSelectionRange(0, shareUrl.length);
  }
}
async function shareDrop() {
  if (!navigator.share) return openShare();
  try {
    await navigator.share({ title: 'HALLOWEEKEND · AUSTIN', text: live ? 'Halloweekend · Oct 30 + 31. Tickets are live.' : 'Halloweekend drops today at 4 PM Austin time.', url: shareUrl });
  } catch (error) {
    if (error.name !== 'AbortError') openShare();
  }
}
function canShareFlyer() {
  try { return Boolean(flyerFile && navigator.share && navigator.canShare?.({ files: [flyerFile] })); }
  catch { return false; }
}
async function prepareFlyer() {
  if (flyerFile || flyerLoading || !live) return;
  flyerLoading = true;
  const button = $('[data-native-flyer]');
  try {
    const response = await fetch(DROP.flyerUrl);
    if (!response.ok) throw new Error('Flyer unavailable');
    const blob = await response.blob();
    flyerFile = new File([blob], 'D42PE-Halloweekend-Official.png', { type: 'image/png' });
    const canShare = canShareFlyer();
    button.hidden = !canShare;
    button.disabled = !canShare;
    button.textContent = 'Share flyer from your phone ↗';
  } catch {
    button.hidden = true; // Original download and full-size links remain usable.
  } finally {
    flyerLoading = false;
  }
}
async function shareFlyer() {
  // File is prepared in advance to preserve iOS user activation on this click.
  if (!canShareFlyer()) return openShare();
  try {
    await navigator.share({ files: [flyerFile], title: 'HALLOWEEKEND', text: 'Oct 30 + 31 · Austin, Texas · Tickets at D42PE.com' });
  } catch (error) {
    if (error.name !== 'AbortError') openShare();
  }
}
function watchPrimary() {
  const sticky = $('[data-sticky]');
  const primary = $(live ? '[data-primary-after]' : '[data-primary-before]');
  observer?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(([entry]) => {
    // Keep the sticky CTA out of view until visitors have passed the main one.
    const visible = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    sticky.classList.toggle('is-visible', visible);
    sticky.inert = !visible;
    sticky.setAttribute('aria-hidden', String(!visible));
  }, { threshold: 0 });
  observer.observe(primary);
}
function reveal() {
  live = true;
  document.body.dataset.phase = 'live';
  $$('[data-ticket]').forEach(link => { link.href = ticketUrl(location.search); });
  $$('[data-before-drop]').forEach(node => { node.hidden = true; });
  $$('[data-after-drop]').forEach(node => { node.hidden = false; });
  $$('source[data-srcset]').forEach(node => { node.srcset = node.dataset.srcset; });
  $('[data-flyer-image]').src = $('[data-flyer-image]').dataset.src;
  $('[data-scroll-cue]').href = '#flyer';
  $('[data-scroll-cue]').innerHTML = 'Flyer &amp; socials <span aria-hidden="true">↓</span>';
  $('[data-sticky-caption]').textContent = 'Oct 30 + 31 · Austin';
  $('[data-launch-status]').textContent = 'Halloweekend is live. Get tickets, download the flyer, and share.';
  if (dialog.open) openShare();
  watchPrimary();
  prepareFlyer();
}
function tick() {
  if (!checked || live) return;
  const state = countdown(nowAt(anchor, performance.now()));
  if (state.live) return reveal();
  document.body.dataset.phase = 'countdown';
  $('[data-hours]').textContent = state.hours;
  $('[data-minutes]').textContent = state.minutes;
  $('[data-seconds]').textContent = state.seconds;
  $('[data-countdown]').setAttribute('aria-label', `${Number(state.hours)} hours, ${Number(state.minutes)} minutes, ${Number(state.seconds)} seconds until the drop`);
}
async function synchronize() {
  if (clockRequest || live) return clockRequest;
  clockRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${DROP.clockUrl}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`, { cache: 'no-store', signal: controller.signal });
      const sample = serverAnchor(response.headers.get('Date'), performance.now());
      if (sample) anchor = sample;
    } catch {
      // Retain an established server anchor offline. On first load only, use
      // the device clock after the bounded request rather than strand the page.
    } finally {
      clearTimeout(timeout);
      if (!anchor) anchor = { epoch: Date.now(), monotonic: performance.now(), trusted: false };
      checked = true;
      clockRequest = null;
      tick();
    }
  })();
  return clockRequest;
}

$$('[data-text-signup]').forEach(link => { link.href = smsUrl(navigator.userAgent, navigator.platform, navigator.maxTouchPoints); });
$$('[data-share-drop]').forEach(button => button.addEventListener('click', shareDrop));
$$('[data-copy-link]').forEach(button => button.addEventListener('click', copyLink));
$$('[data-share-flyer], [data-native-flyer]').forEach(button => button.addEventListener('click', shareFlyer));
$$('[data-story-help]').forEach(button => button.addEventListener('click', openShare));
$('[data-close-dialog]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) dialog.close();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) synchronize(); });
window.addEventListener('pageshow', synchronize);
window.addEventListener('online', synchronize);
setInterval(tick, 250);
setInterval(synchronize, 60_000);
watchPrimary();
synchronize();
