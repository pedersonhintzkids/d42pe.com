import { smsUrl, ticketUrl } from './drop-core.js?v=20261023-1';

const flyerUrl = '/assets/halloweekend/official-flyer-20261024-no-price.png';
const websiteUrl = 'https://d42pe.com/';
const sms = smsUrl(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
document.querySelectorAll('[data-ticket]').forEach(link => { link.href = ticketUrl(location.search); });
document.querySelectorAll('[data-sms]').forEach(link => { link.href = sms; });
let flyerFile, flyerRequest, toastTimer, dialogRestoreFocus, dialogBodyOverflow;

function feedback(message) {
  let el = document.querySelector('.simple-dialog[open] [role="status"]') || document.querySelector('.simple-toast');
  if (!el) {
    el = document.createElement('p');
    el.className = 'simple-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  if (el.classList.contains('simple-toast')) {
    clearTimeout(toastTimer);
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }
}
function openDialog(content) {
  const existing = document.querySelector('.simple-dialog[open]');
  if (!existing) {
    dialogRestoreFocus = document.activeElement;
    dialogBodyOverflow = document.body.style.overflow;
  }
  existing?.close();
  const dialog = document.createElement('dialog');
  dialog.className = 'simple-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = '<button class="dialog-close" aria-label="Close dialog">×</button>' + content + '<p role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  dialog.showModal();
  document.body.style.overflow = 'hidden';
  dialog.querySelector('.dialog-close').focus();
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (!document.querySelector('.simple-dialog[open]')) {
      document.body.style.overflow = dialogBodyOverflow;
      if (dialogRestoreFocus?.isConnected && dialogRestoreFocus.getClientRects().length) dialogRestoreFocus.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  return dialog;
}
async function copyLink() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await Promise.race([
      navigator.clipboard.writeText(websiteUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard timed out')), 1500)),
    ]);
    feedback('D42PE.com link copied');
  } catch {
    const dialog = openDialog('<h2 id="dialog-title">Copy ticket link</h2><p>Select and copy the link below.</p><input class="share-link" aria-label="Ticket website link" readonly value="https://d42pe.com/">');
    const input = dialog.querySelector('input');
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
  }
}
function canShareFlyer() {
  try { return Boolean(flyerFile && navigator.share && navigator.canShare?.({files:[flyerFile]})); }
  catch { return false; }
}
function prepareFlyer() {
  if (flyerFile || flyerRequest) return;
  flyerRequest = (async () => {
    try {
      const response = await fetch(flyerUrl);
      if (!response.ok) throw new Error('Flyer unavailable');
      flyerFile = new File([await response.blob()], 'D42PE-Halloweekend-Official.png', {type:'image/png'});
      const native = document.querySelector('[data-native-share]');
      if (native) native.hidden = !canShareFlyer();
    } catch { /* Full-size and download links still work without native sharing. */ }
    finally { flyerRequest = null; }
  })();
}
function showShareOptions() {
  openDialog(`<h2 id="dialog-title">Post on your story</h2><p>Save the flyer, then add <strong>D42PE.COM</strong> as the link on your Instagram or Snapchat story.</p><button class="dialog-action" data-native-share ${canShareFlyer() ? '' : 'hidden'}>Share flyer from your phone ↗</button><a href="${flyerUrl}" download="D42PE-Halloweekend-Official.png">Save flyer ↓</a><button class="dialog-action" data-copy>Copy ticket link ↗</button><p class="dialog-note">On iPhone, open the full-size flyer and use Share → Save Image.</p>`);
  prepareFlyer();
}
async function shareFlyer() {
  if (!canShareFlyer()) return showShareOptions();
  try { await navigator.share({files:[flyerFile], title:'HALLOWEEKEND', text:'Oct 30 + 31 · Austin, Texas · D42PE.com'}); }
  catch(error) { if(error.name !== 'AbortError') showShareOptions(); }
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-copy], [data-share], [data-zoom], [data-native-share]');
  if (!control) return;
  event.preventDefault();
  if (control.hasAttribute('data-copy')) return copyLink();
  if (control.hasAttribute('data-native-share')) return shareFlyer();
  if (control.hasAttribute('data-share')) return showShareOptions();
  if (control.hasAttribute('data-zoom')) openDialog(`<h2 id="dialog-title">Official flyer</h2><img class="full-flyer" src="${flyerUrl}" alt="Official Halloweekend flyer"><a href="${flyerUrl}" download="D42PE-Halloweekend-Official.png">Save flyer ↓</a>`);
});
