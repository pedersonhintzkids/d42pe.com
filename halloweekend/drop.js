import { DROP, saleState, nowAt, serverAnchor, smsUrl, ticketUrl } from './drop-core.js?v=20261023-1';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icons = {
  message: '<img class="icon" src="/assets/halloweekend/icons/message.svg" alt="">',
  arrow: '<img class="icon" src="/assets/halloweekend/icons/arrow-up-right.svg" alt="">',
};
const panel = $('#panel');
const sms = smsUrl(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
const checkout = ticketUrl(location.search);
let anchor = null;
let checked = false;
let clockRequest = null;
let currentPhase = '';
let priorFocus;
let toastTimeout;
let flyerFile;
let flyerRequest;

function toast(text) {
  if (panel.open) {
    let feedback = $('#panel-content [data-feedback]');
    if (!feedback) {
      feedback = document.createElement('p');
      feedback.dataset.feedback = '';
      feedback.className = 'preview-feedback';
      feedback.setAttribute('role', 'status');
      $('#panel-content').append(feedback);
    }
    feedback.textContent = text;
    return;
  }
  clearTimeout(toastTimeout);
  $('.toast').textContent = text;
  $('.toast').classList.add('is-visible');
  toastTimeout = setTimeout(() => $('.toast').classList.remove('is-visible'), 4000);
}
function openPanel(content, kind = '') {
  if (!panel.open) priorFocus = document.activeElement;
  $('#panel-content').innerHTML = content;
  panel.dataset.kind = kind;
  panel.classList.toggle('flyer-modal', kind === 'flyer');
  if (!panel.open) panel.showModal();
  $('.dialog-close').focus();
  document.body.style.overflow = 'hidden';
}
function closePanel() { panel.close(); }
panel.addEventListener('close', () => {
  document.body.style.overflow = '';
  (priorFocus?.isConnected && priorFocus.getClientRects().length ? priorFocus : $('#primary')).focus();
});
$('.dialog-close').addEventListener('click', closePanel);
panel.addEventListener('click', event => {
  if (event.target !== panel) return;
  const bounds = panel.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePanel();
});

async function copyLink() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await Promise.race([
      navigator.clipboard.writeText(DROP.eventUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard unavailable')), 1500)),
    ]);
    toast('D42PE.com link copied. Add it to your message or story link sticker.');
  } catch {
    openPanel('<h2 id="panel-title">Copy website link</h2><p class="dialog-copy">Send this link to your friends.</p><input class="share-link" aria-label="Website link" readonly value="https://d42pe.com/"><p class="preview-note">Select the link to copy it.</p>', 'copy');
    const field = $('.share-link');
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
  }
}
function shareOptions() {
  openPanel(`<p class="section-eyebrow">HALLOWEEKEND · OCT 30 + 31</p><h2 id="panel-title">${currentPhase === 'before' ? 'Share the countdown' : 'Share Halloweekend'}</h2><p class="dialog-copy">${currentPhase === 'before' ? 'The flash sale starts Thursday, October 22 at 4 PM Austin time.' : 'One pass. Both nights. Send the ticket link to your friends.'}</p><input class="share-link" aria-label="Website link" readonly value="https://d42pe.com/"><button class="button button-ticket" data-action="copy">COPY WEBSITE LINK</button><button class="button button-secondary" data-action="story">POST ON YOUR STORY ${icons.arrow}</button>`, 'share');
}
async function shareWebsite() {
  if (!navigator.share) return shareOptions();
  try {
    await navigator.share({ title: 'HALLOWEEKEND · AUSTIN', text: currentPhase === 'before' ? 'Halloweekend flash sale starts Thursday, October 22 at 4 PM Austin time. One pass. Both nights.' : 'Halloweekend · Oct 30 + 31. One pass. Both nights.', url: DROP.eventUrl });
  } catch (error) {
    if (error.name !== 'AbortError') shareOptions();
  }
}
function canShareFlyer() {
  try { return Boolean(flyerFile && navigator.share && navigator.canShare?.({ files: [flyerFile] })); }
  catch { return false; }
}
function prepareFlyer() {
  if (flyerFile || flyerRequest) return;
  flyerRequest = (async () => {
    try {
      const response = await fetch(DROP.flyerUrl);
      if (!response.ok) throw new Error('Flyer unavailable');
      flyerFile = new File([await response.blob()], 'D42PE-Halloweekend-Official.png', { type: 'image/png' });
      const button = $('[data-action="native-flyer"]');
      if (button) button.hidden = !canShareFlyer();
    } catch { /* Full-size and direct download remain available. */ }
    finally { flyerRequest = null; }
  })();
}
async function shareFlyer() {
  if (!canShareFlyer()) return action('story');
  try {
    await navigator.share({ files: [flyerFile], title: 'HALLOWEEKEND', text: 'Oct 30 + 31 · Austin, Texas · D42PE.com' });
  } catch (error) {
    if (error.name !== 'AbortError') action('story');
  }
}
function action(type) {
  if (type === 'copy') return copyLink();
  if (type === 'share') return shareWebsite();
  if (type === 'native-flyer') return shareFlyer();
  if (type === 'early-bonus') {
    tick();
    if (currentPhase !== 'before') return;
    openPanel(`<p class="section-eyebrow">EARLY-BUYER BONUS</p><h2 id="panel-title">Bring a friend.<br>On us.</h2><p class="dialog-copy">Buy a paid ticket before <strong>Thursday, October 22 at 4 PM Austin time</strong> and get <strong>one free friend pass for every paid ticket</strong>. Each friend pass covers both October 30 and 31.</p><div class="bonus-included"><strong>Already bought your ticket?</strong><span>You’re included too.</span></div><a class="button button-ticket" data-early-purchase href="${checkout}">BUY BEFORE THE DROP ${icons.arrow}</a><p class="preview-note">Free passes will be emailed to the original buyer’s purchase email after the flash sale ends Friday, October 23 at midnight Austin time. Refunded and complimentary tickets do not qualify.</p>`, 'bonus');
    return;
  }
  if (type === 'story') {
    openPanel(`<h2 id="panel-title">Post on your story</h2><div class="steps"><p><b>1.</b> Save the official flyer.</p><p><b>2.</b> Add it to your Instagram or Snapchat story.</p><p><b>3.</b> Add a link sticker with <strong>D42PE.com</strong>.</p></div><button class="button button-ticket" data-action="native-flyer" ${canShareFlyer() ? '' : 'hidden'}>SHARE FLYER FROM YOUR PHONE</button><a class="button button-ticket" href="${DROP.flyerUrl}" download="D42PE-Halloweekend-Official.png">SAVE FLYER</a><button class="button button-secondary" data-action="copy">COPY WEBSITE LINK</button><p class="preview-note">On iPhone, open the full-size flyer and use Share → Save Image.</p>`, 'story');
    prepareFlyer();
    return;
  }
  if (type === 'flyer') {
    openPanel(`<h2 class="sr-only" id="panel-title">Official Halloweekend flyer</h2><img class="full-flyer" src="${DROP.flyerUrl}" alt="Official Halloweekend flyer"><a class="button button-ticket" href="${DROP.flyerUrl}" download="D42PE-Halloweekend-Official.png">DOWNLOAD FLYER</a>`, 'flyer');
  }
}
function renderPhase(phase) {
  currentPhase = phase;
  document.body.dataset.phase = phase;
  document.body.classList.toggle('live', phase === 'live');
  document.body.classList.toggle('expired', phase === 'ended');
  const before = phase === 'before';
  $('.early-bonus').hidden = !before;
  for (const link of $$('[data-primary]')) link.href = before ? sms : checkout;
  $('#primary').innerHTML = before ? icons.message + 'TEXT ME THE DROP' + icons.arrow : 'GET TICKETS' + icons.arrow;
  $('#sticky-action').textContent = before ? 'TEXT ME THE DROP' : 'GET TICKETS';
  $('.share-drop').dataset.action = before ? 'share' : 'story';
  $('.share-drop').innerHTML = (before ? 'SHARE THE COUNTDOWN' : 'SHARE THE FLYER') + icons.arrow;
  $('#action-help').textContent = before ? '600+ active members · Get the drop by text.' : 'One ticket includes October 30 + 31.';
  $('.offer-price').textContent = phase === 'ended' ? '$17.59' : '$8';
  $('#phase-label').textContent = before ? 'FLASH SALE' : phase === 'live' ? 'FLASH SALE IS LIVE' : 'FLASH SALE ENDED';
  $('#deadline').innerHTML = before ? '<span>STARTS</span> THU OCT 22 · 4 PM AUSTIN TIME' : phase === 'live' ? '<span>ENDS IN</span> FRI OCT 23 · MIDNIGHT AUSTIN TIME' : '<span>NEXT UP</span> HALLOWEEKEND · OCT 30 + 31';
  $('#offer-detail').textContent = before ? '100 passes. Until midnight Friday, October 23. Then price doubles.' : phase === 'live' ? 'Until midnight. Then ticket price doubles to $16 + fees.' : 'One pass still includes both nights.';
  $('.fee-note').textContent = phase === 'ended' ? 'Total includes fees: $16 ticket + $1.59 fees.' : '$8 ticket + $1.19 fees = $9.19 total.';
  $('#sticky-title').textContent = phase === 'ended' ? '$17.59 TOTAL' : '$8 FLASH SALE';
  $('#sticky-caption').textContent = before ? 'THU · 4 PM AUSTIN' : phase === 'live' ? 'UNTIL MIDNIGHT · THEN PRICE DOUBLES' : 'OCT 30 + 31';
  if (panel.open && panel.dataset.kind === 'bonus' && !before) closePanel();
  if (panel.open && panel.dataset.kind === 'share') shareOptions();
}
function tick() {
  if (!checked) return;
  const state = saleState(nowAt(anchor, performance.now()));
  for (const unit of ['hours', 'minutes', 'seconds']) $('#' + unit).textContent = state[unit];
  $('.timer').setAttribute('aria-label', `${Number(state.hours)} hours, ${Number(state.minutes)} minutes, ${Number(state.seconds)} seconds ${state.phase === 'before' ? 'until the flash sale' : 'remaining in the flash sale'}`);
  if (state.phase !== currentPhase) renderPhase(state.phase);
}
async function synchronize() {
  if (clockRequest) return clockRequest;
  clockRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${DROP.clockUrl}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Clock unavailable');
      const sample = serverAnchor(response.headers.get('Date'), performance.now());
      if (sample) anchor = sample;
    } catch { /* Retain server anchor; first-load fallback is bounded below. */ }
    finally {
      clearTimeout(timeout);
      if (!anchor) anchor = { epoch: Date.now(), monotonic: performance.now(), trusted: false };
      checked = true;
      clockRequest = null;
      tick();
    }
  })();
  return clockRequest;
}
$$('[data-primary], [data-text-signup]').forEach(link => { link.href = sms; });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) action(button.dataset.action);
  if (event.target.closest('[data-primary], [data-early-purchase]')) tick();
});
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    $('.sticky').hidden = entry.isIntersecting || entry.boundingClientRect.bottom >= 0;
  }, { threshold: 0 }).observe($('#main-actions'));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) synchronize(); });
window.addEventListener('pageshow', synchronize);
window.addEventListener('online', synchronize);
setInterval(tick, 250);
setInterval(synchronize, 60_000);
synchronize();
