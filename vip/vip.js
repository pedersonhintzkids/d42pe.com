import { STORY_LINK, STORY_CAPTION, STORY_MESSAGE, FREE_MESSAGE, smsLink, copyText } from './vip-core.js?v=20261003-1';

const $ = selector => document.querySelector(selector);
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-visible');
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4800);
}

function revealCopy(text) {
  const fallback = $('#link-fallback');
  fallback.hidden = false;
  const input = fallback.querySelector('input');
  input.type = text.startsWith('https:') ? 'url' : 'text';
  input.value = text;
  input.setAttribute('aria-label', text.startsWith('https:') ? 'Ticket link to copy' : 'Giveaway caption to copy');
  fallback.firstChild.textContent = text.startsWith('https:') ? 'Copy this ticket link' : 'Copy this Story caption';
  input.focus();
  input.select();
  toast('Press and hold the selected text to copy it.');
}

$('[data-copy-link]').addEventListener('click', async () => {
  if (await copyText(STORY_LINK, navigator.clipboard, revealCopy)) {
    toast('Link copied. Add it with the Link sticker on Instagram or the paperclip on Snapchat.');
  }
});
$('[data-copy-caption]').addEventListener('click', async () => {
  if (await copyText(STORY_CAPTION, navigator.clipboard, revealCopy)) toast('Caption copied. Add it as visible text on your Story.');
});
$('[data-save]').addEventListener('click', () => toast('On iPhone: if the flyer opens, press and hold the image to save it.'));

const device = { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints };
$('[data-entry-sms]').href = smsLink(STORY_MESSAGE, device);
$('[data-free-sms]').href = smsLink(FREE_MESSAGE, device);
// Opening Messages is not evidence of sending, receiving, or confirming an entry.
$('[data-entry-sms]').addEventListener('click', () => toast('Attach your posted Story screenshot and add your username before sending.'));

document.querySelectorAll('a[href="#entry-details"]').forEach(link => link.addEventListener('click', () => {
  $('#entry-details').open = true;
}));
if (location.hash === '#entry-details') $('#entry-details').open = true;
