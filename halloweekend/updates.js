// Keep text signup working on both iOS and Android while event promotion is paused.
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

document.querySelectorAll("[data-text-signup]").forEach(link => {
  if (iOS) link.href = link.getAttribute("href").replace("?body=", "&body=");
});
