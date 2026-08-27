export const EVENT_ID = "ritual-x-2016-house-party-2026-08-29";
export const SMS_NUMBER = "+15126107851";
export const SMS_DISPLAY_NUMBER = "(512) 610-7851";
export const STORAGE_KEY = "d42pe:rsvp:ritual-x-2016-house-party-2026-08-29:v1";
export const STATE_VERSION = 1;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function validateName(value) {
  const name = normalizeName(value);
  const length = Array.from(name).length;
  if (length < 2) return { ok: false, name, message: "Enter the name you want on the RSVP list." };
  if (length > 80) return { ok: false, name, message: "Keep the name to 80 characters or fewer." };
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    return { ok: false, name, message: "Remove control characters from the name." };
  }
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, name, message: "Enter a name with at least one letter or number." };
  }
  return { ok: true, name, message: "" };
}

export function buildSmsMessage(name) {
  const result = validateName(name);
  if (!result.ok) throw new TypeError(result.message);
  return `RSVP - ${result.name}`;
}

export function isIOSLike(navigatorLike = {}) {
  const userAgent = navigatorLike.userAgent || "";
  return /iPad|iPhone|iPod/.test(userAgent) ||
    (navigatorLike.platform === "MacIntel" && Number(navigatorLike.maxTouchPoints) > 1);
}

export function supportsNativeSms(navigatorLike = {}) {
  if (typeof navigatorLike.userAgentData?.mobile === "boolean") {
    return navigatorLike.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigatorLike.userAgent || "") ||
    isIOSLike(navigatorLike);
}

export function buildSmsUri(name, navigatorLike = {}) {
  const separator = isIOSLike(navigatorLike) ? "&" : "?";
  return `sms:${SMS_NUMBER}${separator}body=${encodeURIComponent(buildSmsMessage(name))}`;
}

export function createClientToken(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error("Secure random values are unavailable.");
  const bytes = new Uint8Array(32);
  cryptoLike.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createEmptyState(cryptoLike = globalThis.crypto) {
  return {
    version: STATE_VERSION,
    clientToken: createClientToken(cryptoLike),
    rsvpId: null,
    name: "",
    step: 1
  };
}

export function parseStoredState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STATE_VERSION || !TOKEN_PATTERN.test(parsed.clientToken || "")) return null;
    if (![1, 2, 3].includes(parsed.step)) return null;
    const nameResult = parsed.name ? validateName(parsed.name) : { ok: parsed.step === 1, name: "" };
    if (!nameResult.ok) return null;
    if (parsed.step > 1 && !UUID_PATTERN.test(parsed.rsvpId || "")) return null;
    return {
      version: STATE_VERSION,
      clientToken: parsed.clientToken,
      rsvpId: parsed.rsvpId || null,
      name: nameResult.name,
      step: parsed.step
    };
  } catch {
    return null;
  }
}

export function captureAttribution(locationLike, referrer = "") {
  const params = new URLSearchParams(locationLike?.search || "");
  const clean = value => typeof value === "string" ? value.trim().slice(0, 100) : "";
  let cleanReferrer = "";
  if (referrer) {
    try {
      const url = new URL(referrer);
      cleanReferrer = `${url.origin}${url.pathname}`.slice(0, 256);
    } catch {
      cleanReferrer = "";
    }
  }
  return {
    referrer: cleanReferrer,
    source: clean(params.get("src")),
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
    utm_term: clean(params.get("utm_term")),
    utm_content: clean(params.get("utm_content"))
  };
}

export function resolveApiBase(locationLike, config = {}) {
  const configured = typeof config.apiBaseUrl === "string" ? config.apiBaseUrl.trim().replace(/\/$/, "") : "";
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("The RSVP API URL must use HTTPS.");
    }
    return url.origin + url.pathname.replace(/\/$/, "");
  }
  if (["localhost", "127.0.0.1"].includes(locationLike?.hostname)) return locationLike.origin;
  return "";
}

function rsvpPath(state, suffix = "") {
  return `/v1/rsvps/${encodeURIComponent(state.rsvpId)}${suffix}`;
}

export function editRsvpState(state) {
  return { ...state, step: 1 };
}

export async function selfConfirmRsvp(state, request) {
  const payload = await request(rsvpPath(state, "/self-confirm"), {
    method: "POST",
    body: {}
  });
  return {
    ...state,
    name: normalizeName(payload.rsvp.name),
    step: 3
  };
}

export async function reopenPreparedSms(state, { request, navigatorLike, navigate }) {
  await request(rsvpPath(state, "/sms-open"), {
    method: "POST",
    body: {}
  });
  const uri = buildSmsUri(state.name, navigatorLike);
  navigate(uri);
  return uri;
}

export async function reconcileRsvpState(state, request) {
  const payload = await request(rsvpPath(state));
  return {
    ...state,
    name: normalizeName(payload.rsvp.name),
    step: payload.rsvp.status === "self_confirmed" ? 3 : 2
  };
}
