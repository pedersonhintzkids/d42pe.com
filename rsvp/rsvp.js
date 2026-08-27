import {
  EVENT_ID,
  SMS_DISPLAY_NUMBER,
  STORAGE_KEY,
  buildSmsMessage,
  buildSmsUri,
  captureAttribution,
  createEmptyState,
  normalizeName,
  parseStoredState,
  resolveApiBase,
  supportsNativeSms,
  validateName
} from "./rsvp-core.js";

const elements = {
  steps: [...document.querySelectorAll("[data-step]")],
  form: document.getElementById("rsvp-form"),
  name: document.getElementById("rsvp-name"),
  nameError: document.getElementById("name-error"),
  startError: document.getElementById("start-error"),
  startButton: document.getElementById("start-rsvp"),
  stepTwoTitle: document.getElementById("step-two-title"),
  stepTwoName: document.getElementById("step-two-name"),
  fallback: document.getElementById("desktop-fallback"),
  preparedNumber: document.getElementById("prepared-number"),
  preparedMessage: document.getElementById("prepared-message"),
  copyNumber: document.getElementById("copy-number"),
  copyMessage: document.getElementById("copy-message"),
  copyStatus: document.getElementById("copy-status"),
  confirmButton: document.getElementById("confirm-rsvp"),
  confirmError: document.getElementById("confirm-error"),
  openTextAgain: document.getElementById("open-text-again"),
  editName: document.getElementById("edit-name"),
  stepThreeTitle: document.getElementById("step-three-title"),
  confirmedName: document.getElementById("confirmed-name"),
  reset: document.getElementById("reset-rsvp"),
  socialLinks: [...document.querySelectorAll("[data-click-type]")]
};

class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readStoredState() {
  try {
    return parseStoredState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

let state = readStoredState() || createEmptyState();
const nativeSms = supportsNativeSms(navigator);
const attribution = captureAttribution(window.location, document.referrer);
let apiBase = "";

try {
  apiBase = resolveApiBase(window.location, window.D42PE_RSVP_CONFIG || {});
} catch {
  apiBase = "";
}

function canPersistState() {
  try {
    const testKey = `${STORAGE_KEY}:test`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function clearStoredState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The reset still applies to this page session.
  }
}

function renderPreparedValues() {
  elements.stepTwoName.textContent = `Prepared for: ${state.name}`;
  elements.preparedNumber.textContent = SMS_DISPLAY_NUMBER;
  elements.preparedMessage.textContent = buildSmsMessage(state.name);
  elements.confirmedName.textContent = state.name;
  elements.fallback.hidden = nativeSms;
}

function showStep(step, { focus = false } = {}) {
  state.step = step;
  for (const element of elements.steps) {
    element.hidden = Number(element.dataset.step) !== step;
  }
  if (state.name) renderPreparedValues();
  if (focus) {
    const target = step === 1 ? elements.name : step === 2 ? elements.stepTwoTitle : elements.stepThreeTitle;
    requestAnimationFrame(() => target.focus({ preventScroll: false }));
  }
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.textContent = busy ? busyText : button.dataset.originalText;
}

function clearErrors() {
  elements.nameError.textContent = "";
  elements.startError.textContent = "";
  elements.confirmError.textContent = "";
  elements.name.removeAttribute("aria-invalid");
}

async function apiRequest(path, { method = "GET", body, keepalive = false } = {}) {
  if (!apiBase) throw new ApiError("RSVP saving is not configured yet. Please try again later.", 503);
  const headers = {
    Accept: "application/json",
    Authorization: `RSVP ${state.clientToken}`
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      keepalive
    });
  } catch {
    throw new ApiError("Couldn’t reach the RSVP service. Check your connection and try again.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error || "The RSVP service could not save that update. Please try again.", response.status);
  }
  return payload;
}

async function createOrUpdateStartedRsvp(name) {
  if (state.rsvpId) {
    try {
      const payload = await apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}`, {
        method: "PATCH",
        body: { name }
      });
      if (nativeSms) {
        await apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}/sms-open`, { method: "POST", body: {} });
      }
      return payload.rsvp;
    } catch (error) {
      if (error.status !== 404) throw error;
      state.rsvpId = "";
      state.step = 1;
      persistState();
    }
  }

  const payload = await apiRequest("/v1/rsvps", {
    method: "POST",
    body: {
      eventId: EVENT_ID,
      name,
      smsOpened: nativeSms,
      ...attribution
    }
  });
  return payload.rsvp;
}

function openPreparedSms() {
  window.location.assign(buildSmsUri(state.name, navigator));
}

elements.form.addEventListener("submit", async event => {
  event.preventDefault();
  clearErrors();

  const nameResult = validateName(elements.name.value);
  elements.name.value = nameResult.name;
  if (!nameResult.ok) {
    elements.name.setAttribute("aria-invalid", "true");
    elements.nameError.textContent = nameResult.message;
    elements.name.focus();
    return;
  }
  if (!canPersistState()) {
    elements.startError.textContent = "Browser storage is unavailable. Enable it so your RSVP can survive the switch to Messages.";
    return;
  }
  state.name = nameResult.name;
  state.step = 1;
  if (!persistState()) {
    elements.startError.textContent = "Browser storage is unavailable. Enable it so your RSVP can survive the switch to Messages.";
    return;
  }

  setBusy(elements.startButton, true, "SAVING RSVP…");
  try {
    const rsvp = await createOrUpdateStartedRsvp(nameResult.name);
    state = {
      ...state,
      rsvpId: rsvp.id,
      name: rsvp.name,
      step: 2
    };
    if (!persistState()) throw new ApiError("The RSVP was saved, but this browser could not preserve your return step.");
    showStep(2);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (nativeSms) requestAnimationFrame(openPreparedSms);
    else elements.copyNumber.focus();
  } catch (error) {
    elements.startError.textContent = error.message;
  } finally {
    setBusy(elements.startButton, false, "SAVING RSVP…");
  }
});

elements.confirmButton.addEventListener("click", async () => {
  elements.confirmError.textContent = "";
  setBusy(elements.confirmButton, true, "CONFIRMING…");
  try {
    const payload = await apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}/self-confirm`, {
      method: "POST",
      body: {}
    });
    state = { ...state, name: payload.rsvp.name, step: 3 };
    persistState();
    showStep(3, { focus: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (error) {
    elements.confirmError.textContent = error.message;
  } finally {
    setBusy(elements.confirmButton, false, "CONFIRMING…");
  }
});

elements.openTextAgain.addEventListener("click", async () => {
  elements.confirmError.textContent = "";
  if (!nativeSms) {
    elements.fallback.hidden = false;
    elements.copyStatus.textContent = "Use the copy buttons, then send the prepared message from your phone.";
    elements.copyNumber.focus();
    return;
  }

  setBusy(elements.openTextAgain, true, "OPENING…");
  try {
    await apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}/sms-open`, { method: "POST", body: {} });
    openPreparedSms();
  } catch (error) {
    elements.confirmError.textContent = error.message;
  } finally {
    setBusy(elements.openTextAgain, false, "OPENING…");
  }
});

elements.editName.addEventListener("click", () => {
  clearErrors();
  elements.name.value = state.name;
  state.step = 1;
  persistState();
  showStep(1, { focus: true });
  window.scrollTo({ top: document.querySelector(".rsvp-form").offsetTop - 20, behavior: "auto" });
});

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Clipboard unavailable");
  }
  elements.copyStatus.textContent = successMessage;
}

elements.copyNumber.addEventListener("click", () => {
  void copyText("+15126107851", "Number copied.").catch(() => {
    elements.copyStatus.textContent = "Copy the number shown above manually.";
  });
});

elements.copyMessage.addEventListener("click", () => {
  void copyText(buildSmsMessage(state.name), "Message copied.").catch(() => {
    elements.copyStatus.textContent = "Copy the prepared message shown above manually.";
  });
});

for (const link of elements.socialLinks) {
  link.addEventListener("click", () => {
    if (!state.rsvpId || !apiBase) return;
    void apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}/clicks`, {
      method: "POST",
      body: { type: link.dataset.clickType },
      keepalive: true
    }).catch(() => {});
  });
}

elements.reset.addEventListener("click", () => {
  clearStoredState();
  state = createEmptyState();
  elements.name.value = "";
  elements.copyStatus.textContent = "";
  clearErrors();
  showStep(1, { focus: true });
  window.scrollTo({ top: 0, behavior: "auto" });
});

async function reconcileStoredState() {
  if (!state.rsvpId || state.step === 1 || !apiBase) return;
  try {
    const payload = await apiRequest(`/v1/rsvps/${encodeURIComponent(state.rsvpId)}`);
    state.name = normalizeName(payload.rsvp.name);
    state.step = payload.rsvp.status === "self_confirmed" ? 3 : 2;
    persistState();
    showStep(state.step);
  } catch (error) {
    if ([401, 404].includes(error.status)) {
      clearStoredState();
      state = createEmptyState();
      showStep(1);
    }
  }
}

elements.name.value = state.name;
showStep(state.step);
void reconcileStoredState();
