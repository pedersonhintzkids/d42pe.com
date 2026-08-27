export const EVENT_ID = "ritual-x-2016-house-party-2026-08-29";
export const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CLICK_TYPES = new Set([
  "official_host_instagram",
  "d42pe_instagram",
  "d42pe_snapchat"
]);

export function normalizeName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function validateName(value) {
  const name = normalizeName(value);
  const length = Array.from(name).length;
  if (length < 2) return { ok: false, name, error: "Enter the name you want on the RSVP list." };
  if (length > 80) return { ok: false, name, error: "Keep the name to 80 characters or fewer." };
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    return { ok: false, name, error: "Remove control characters from the name." };
  }
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, name, error: "Enter a name with at least one letter or number." };
  }
  return { ok: true, name, error: "" };
}

export function readClientToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^RSVP ([A-Za-z0-9_-]{43})$/);
  return match?.[1] || "";
}

export function sanitizeAttribution(body = {}) {
  const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) || null : null;
  let referrer = clean(body.referrer, 256);
  if (referrer) {
    try {
      const url = new URL(referrer);
      if (!["http:", "https:"].includes(url.protocol)) referrer = null;
      else referrer = `${url.origin}${url.pathname}`.slice(0, 256);
    } catch {
      referrer = null;
    }
  }
  return {
    referrer,
    source: clean(body.source, 100),
    utm_source: clean(body.utm_source, 100),
    utm_medium: clean(body.utm_medium, 100),
    utm_campaign: clean(body.utm_campaign, 100),
    utm_term: clean(body.utm_term, 100),
    utm_content: clean(body.utm_content, 100)
  };
}

export function normalizeSearch(value) {
  if (typeof value !== "string") return "";
  return normalizeName(value).toLocaleLowerCase("en-US").slice(0, 80);
}
