import { isLoopbackHost, isSafeHttpsUrl, validateCampaignConfig, preservedAttribution, fetchCampaignConfig } from "/campaign-launch.js?v=20261003-1";

const localPreview = isLoopbackHost(location.hostname);
const defaults = {
  eventUrl: "https://d42pe.com/halloweekend/",
  ticketUrl: "https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX",
  instagramPostUrl: null,
  instagramD42peUrl: "https://www.instagram.com/d42pe.events_atx/",
  snapchatD42peUrl: "https://www.snapchat.com/add/d42pe.atx",
  instagram512Url: "https://www.instagram.com/512__events/",
  snapchatAtxUrl: "https://www.snapchat.com/@atxpartys",
  textNumber: "+15126107851",
  textKeyword: "D42PE",
  flyerUrl: "/assets/halloweekend/official-flyer.png"
};
let config = { ...defaults };
let flyerFile = null;
let flyerPromise = null;
let toastTimer;
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const shareDialog = $("#share-dialog");

function safeHttps(value) {
  return isSafeHttpsUrl(value) ? new URL(value).href : null;
}

function attributedUrl(value) {
  const safe = safeHttps(value);
  if (!safe) return null;
  const url = new URL(safe);
  for (const [key, entry] of new URLSearchParams(preservedAttribution(location.search))) {
    url.searchParams.set(key, entry);
  }
  return url.href;
}

function toast(message) {
  clearTimeout(toastTimer);
  const el = $("#toast");
  const activeDialog = document.querySelector("dialog[open]");
  if (activeDialog) {
    el.classList.remove("is-visible");
    el.textContent = "";
    let status = activeDialog.querySelector(".dialog-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "dialog-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
      activeDialog.append(status);
    }
    status.textContent = message;
    return;
  }
  el.textContent = message;
  el.classList.add("is-visible");
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 4200);
}

function openDialog(dialog) {
  if (dialog.open) return;
  dialog.querySelector(".dialog-status")?.remove();
  dialog.showModal();
  document.body.classList.add("dialog-open");
}

function applyConfig() {
  const ticketUrl = attributedUrl(config.ticketUrl);
  all("[data-ticket]").forEach(el => {
    el.href = ticketUrl || "#tickets";
    el.dataset.ready = String(Boolean(ticketUrl));
  });
  const postUrl = safeHttps(config.instagramPostUrl);
  const instagramUrl = postUrl || safeHttps(config.instagramD42peUrl) || defaults.instagramD42peUrl;
  all("[data-instagram-post]").forEach(el => { el.href = instagramUrl; });
  all("[data-instagram-label]").forEach(el => { el.textContent = postUrl ? "View flyer on Instagram" : "Open Instagram"; });
  all("[data-instagram-description]").forEach(el => { el.textContent = postUrl ? "Add the post to your story" : "Follow the drop"; });
  all("[data-copy-post]").forEach(el => { el.hidden = !postUrl; });
  all("[data-social]").forEach(el => {
    const url = safeHttps(config[el.dataset.social]);
    if (url) {
      el.href = url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.removeAttribute("aria-disabled");
      el.removeAttribute("data-pending-link");
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.hidden = false;
    } else {
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.removeAttribute("rel");
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("data-pending-link", "");
      el.setAttribute("role", "link");
      el.setAttribute("tabindex", "0");
      el.hidden = !localPreview;
      el.title = "Profile link pending for this preview";
    }
  });
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const number = /^\+[0-9]{10,15}$/.test(config.textNumber) ? config.textNumber : defaults.textNumber;
  const keyword = typeof config.textKeyword === "string" ? config.textKeyword : defaults.textKeyword;
  const sms = `sms:${number}${iOS ? "&" : "?"}body=${encodeURIComponent(keyword)}`;
  all("[data-text-signup]").forEach(el => { el.href = sms; });
}

const configReady = fetchCampaignConfig(window.fetch.bind(window))
  .then(response => { if (!response.ok) throw new Error("Config unavailable"); return response.json(); })
  .then(value => { if (!validateCampaignConfig(value).ok) throw new Error("Invalid config"); config = { ...defaults, ...value }; })
  .catch(() => { /* Keep working static links or the last valid live update. */ })
  .finally(applyConfig);

window.addEventListener("campaign-config", event => {
  const value = event.detail?.config;
  if (validateCampaignConfig(value).ok) {
    config = { ...defaults, ...value };
    applyConfig();
  }
});

function updateNativeShare() {
  const button = $("#native-share");
  const supported = typeof navigator.share === "function" && typeof navigator.canShare === "function";
  button.hidden = !supported || Boolean(flyerFile && !navigator.canShare({ files: [flyerFile] }));
  button.disabled = !flyerFile;
  button.querySelector("span").textContent = flyerFile ? "Share the flyer" : "Preparing flyer…";
}

function preloadFlyer() {
  if (flyerPromise) return flyerPromise;
  // The exact approved PNG is used for sharing and downloads, never the web thumbnail.
  flyerPromise = fetch(defaults.flyerUrl)
    .then(response => { if (!response.ok) throw new Error("Flyer unavailable"); return response.blob(); })
    .then(blob => {
      flyerFile = new File([blob], "D42PE-Halloweekend-Official.png", { type: "image/png" });
      updateNativeShare();
      return flyerFile;
    })
    .catch(() => { flyerPromise = null; $("#native-share").hidden = true; return null; });
  return flyerPromise;
}

async function shareFlyer() {
  // Call share synchronously from the tap when the file is ready, preserving iOS user activation.
  if (flyerFile && typeof navigator.share === "function" && navigator.canShare?.({ files: [flyerFile] })) {
    try {
      await navigator.share({
        files: [flyerFile],
        title: "Halloweekend · Oct 30 + 31 · Austin",
        text: `HALLOWEEKEND · OCT 30 + 31 · AUSTIN, TEXAS\n${attributedUrl(config.eventUrl) || defaults.eventUrl}`
      });
      if (shareDialog.open) shareDialog.close();
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  preloadFlyer();
  updateNativeShare();
  openDialog(shareDialog);
}

async function copyLink(value) {
  const url = safeHttps(value);
  if (!url) { toast("The Instagram post link will be available when the post is live."); return; }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const field = document.createElement("textarea");
      field.value = url;
      field.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      (document.querySelector("dialog[open]") || document.body).append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    toast("Link copied.");
  } catch {
    openDialog(shareDialog);
    const fallback = $("#manual-copy");
    fallback.hidden = false;
    const input = fallback.querySelector("input");
    input.value = url;
    input.focus();
    input.select();
    toast("Select and copy the link below.");
  }
}

all("[data-ticket]").forEach(el => el.addEventListener("click", event => {
  if (safeHttps(config.ticketUrl)) return;
  event.preventDefault();
  $("#ticket-dialog-title").textContent = localPreview ? "Ticket link pending." : "Ticket updates.";
  $("#ticket-dialog-copy").textContent = localPreview
    ? "This is the design preview. Your ticket URL will go straight on this button before launch."
    : "Get ticket drops and important updates by text, or refresh to try loading the ticket link again.";
  openDialog($("#ticket-dialog"));
}));
all("[data-share]").forEach(el => {
  el.addEventListener("click", shareFlyer);
  el.addEventListener("pointerenter", preloadFlyer, { once: true });
  el.addEventListener("focus", preloadFlyer, { once: true });
});
all("[data-copy-event]").forEach(el => el.addEventListener("click", () => copyLink(attributedUrl(config.eventUrl))));
all("[data-copy-post]").forEach(el => el.addEventListener("click", () => copyLink(config.instagramPostUrl)));
all("[data-open-flyer]").forEach(el => el.addEventListener("click", () => openDialog($("#flyer-dialog"))));
all("[data-download]").forEach(el => el.addEventListener("click", () => toast("Keep the flyer handy for your story. On iPhone, you can also open it and press to save the image.")));
all("[data-social]").forEach(el => {
  const pending = event => { if (!el.hasAttribute("data-pending-link")) return; event.preventDefault(); toast("This profile link is waiting to be added to the preview."); };
  el.addEventListener("click", pending);
  el.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") pending(event); });
});
all("[data-close-dialog]").forEach(el => el.addEventListener("click", () => el.closest("dialog").close()));
all("dialog").forEach(dialog => {
  dialog.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) document.body.classList.remove("dialog-open"); });
  dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
});

const mainTicket = $(".hero-actions [data-ticket]");
function setStickyTicket(show) {
  const sticky = $("#mobile-ticket");
  sticky.classList.toggle("is-visible", show);
  sticky.inert = !show;
  sticky.setAttribute("aria-hidden", String(!show));
  document.body.classList.toggle("has-sticky-ticket", show);
}
if ("IntersectionObserver" in window) {
  new IntersectionObserver(entries => {
    setStickyTicket(!entries[0].isIntersecting);
  }).observe(mainTicket);
} else {
  setStickyTicket(true);
}

function setupScrollHint() {
  const hint = $("#scroll-hint");
  const listeners = new AbortController();
  let hideTimer;
  // Suggest scrolling without moving the page or shifting its layout.
  const showTimer = setTimeout(() => {
    if (document.hidden || window.scrollY > 8 || document.querySelector("dialog[open]") || document.documentElement.scrollHeight <= innerHeight + 80) {
      dismiss();
      return;
    }
    hint.hidden = false;
    hideTimer = setTimeout(dismiss, 8000);
  }, 3000);

  function dismiss() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hint.hidden = true;
    listeners.abort();
  }

  const passive = { passive: true, signal: listeners.signal };
  window.addEventListener("scroll", () => { if (window.scrollY > 8) dismiss(); }, passive);
  window.addEventListener("wheel", dismiss, passive);
  window.addEventListener("touchmove", dismiss, passive);
  document.addEventListener("pointerdown", event => { if (!hint.contains(event.target)) dismiss(); }, passive);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" || !hint.contains(event.target)) dismiss();
  }, { signal: listeners.signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) dismiss(); }, { signal: listeners.signal });
  hint.addEventListener("click", () => {
    dismiss();
    const target = $("#flyer");
    const heading = target.querySelector("h2");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, { once: true });
}

setupScrollHint();
if (localPreview) $("#preview-badge").hidden = false;
applyConfig();
configReady.then(() => {
  if (typeof navigator.share !== "function" || navigator.connection?.saveData) return;
  if ("requestIdleCallback" in window) requestIdleCallback(preloadFlyer, { timeout: 3000 });
  else setTimeout(preloadFlyer, 1000);
});
