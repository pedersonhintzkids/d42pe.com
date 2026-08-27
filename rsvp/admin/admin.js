import { resolveApiBase } from "../rsvp-core.js";

const elements = {
  authPanel: document.getElementById("auth-panel"),
  authForm: document.getElementById("auth-form"),
  secret: document.getElementById("admin-secret"),
  unlock: document.getElementById("unlock-admin"),
  authError: document.getElementById("auth-error"),
  lock: document.getElementById("lock-admin"),
  listPanel: document.getElementById("list-panel"),
  filters: document.getElementById("filters-form"),
  statusFilter: document.getElementById("status-filter"),
  search: document.getElementById("name-search"),
  export: document.getElementById("export-csv"),
  status: document.getElementById("list-status"),
  error: document.getElementById("list-error"),
  rows: document.getElementById("rsvp-rows"),
  table: document.getElementById("table-wrap"),
  loadMore: document.getElementById("load-more"),
  confirmed: document.getElementById("confirmed-count"),
  started: document.getElementById("started-count"),
  total: document.getElementById("total-count")
};

let adminSecret = "";
let apiBase = "";
let loadedRecords = [];
let nextCursor = "";
let activeFilters = { status: "all", search: "" };
let listGeneration = 0;

try {
  apiBase = resolveApiBase(window.location, window.D42PE_RSVP_CONFIG || {});
} catch {
  apiBase = "";
}

function setBusy(button, busy, text) {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.textContent = busy ? text : button.dataset.originalText;
}

async function adminRequest(path, { accept = "application/json" } = {}) {
  if (!apiBase) throw new Error("The production RSVP API has not been configured.");
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${adminSecret}`
      },
      cache: "no-store",
      credentials: "omit"
    });
  } catch {
    throw new Error("Couldn’t reach the RSVP service.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || (response.status === 401 ? "That organizer secret was not accepted." : "The organizer list could not be loaded."));
    error.status = response.status;
    throw error;
  }
  return response;
}

function currentFilters() {
  return {
    status: elements.statusFilter.value,
    search: elements.search.value.trim()
  };
}

function queryString({ cursor = "", limit = "", filters = activeFilters } = {}) {
  const params = new URLSearchParams();
  params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (limit) params.set("limit", limit);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function sourceLabel(record) {
  const values = [record.utm_source, record.source, record.referrer].filter(Boolean);
  return values.join(" / ") || "Direct / unknown";
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function renderRows(records, pagination) {
  elements.rows.replaceChildren();
  for (const record of records) {
    const row = document.createElement("tr");
    appendCell(row, record.name);
    const statusCell = appendCell(row, "");
    const status = document.createElement("span");
    status.className = "status-pill";
    status.textContent = record.status === "self_confirmed" ? "Confirmed" : "Started";
    statusCell.append(status);
    appendCell(row, formatDate(record.created_at));
    appendCell(row, formatDate(record.sms_opened_at));
    appendCell(row, formatDate(record.confirmed_at));
    appendCell(row, sourceLabel(record));
    elements.rows.append(row);
  }
  elements.table.hidden = records.length === 0;
  elements.loadMore.hidden = !pagination?.hasMore;
  if (!records.length) {
    elements.status.textContent = "No RSVPs match these filters.";
  } else {
    const totalMatching = Number(pagination?.totalMatching || records.length);
    elements.status.textContent = `${records.length} of ${totalMatching} matching record${totalMatching === 1 ? "" : "s"} shown.`;
  }
}

async function loadList({ append = false } = {}) {
  elements.error.textContent = "";
  elements.status.textContent = append ? "Loading more RSVP records…" : "Loading RSVP records…";
  const generation = append ? listGeneration : ++listGeneration;
  if (!append) elements.loadMore.hidden = true;
  const requestedFilters = append ? activeFilters : currentFilters();
  let response;
  try {
    response = await adminRequest(`/v1/admin/rsvps?${queryString({
      cursor: append ? nextCursor : "",
      limit: "100",
      filters: requestedFilters
    })}`);
  } catch (error) {
    if (generation !== listGeneration) return false;
    throw error;
  }
  const payload = await response.json();
  if (generation !== listGeneration) return false;
  elements.confirmed.textContent = String(payload.counts.confirmed);
  elements.started.textContent = String(payload.counts.started);
  elements.total.textContent = String(payload.counts.total);
  if (!append) activeFilters = requestedFilters;
  loadedRecords = append ? [...loadedRecords, ...payload.records] : payload.records;
  nextCursor = payload.pagination?.nextCursor || "";
  renderRows(loadedRecords, payload.pagination);
  return true;
}

function lockAdmin() {
  listGeneration += 1;
  adminSecret = "";
  elements.secret.value = "";
  elements.rows.replaceChildren();
  loadedRecords = [];
  nextCursor = "";
  activeFilters = { status: "all", search: "" };
  elements.table.hidden = true;
  elements.loadMore.hidden = true;
  elements.listPanel.hidden = true;
  elements.lock.hidden = true;
  elements.authPanel.hidden = false;
  elements.authError.textContent = "";
  elements.secret.focus();
}

elements.authForm.addEventListener("submit", async event => {
  event.preventDefault();
  elements.authError.textContent = "";
  adminSecret = elements.secret.value;
  if (!adminSecret) return;
  setBusy(elements.unlock, true, "CHECKING…");
  try {
    await loadList();
    elements.secret.value = "";
    elements.authPanel.hidden = true;
    elements.listPanel.hidden = false;
    elements.lock.hidden = false;
    elements.statusFilter.focus();
  } catch (error) {
    adminSecret = "";
    elements.authError.textContent = error.message;
    elements.secret.select();
  } finally {
    setBusy(elements.unlock, false, "CHECKING…");
  }
});

elements.filters.addEventListener("submit", event => {
  event.preventDefault();
  void loadList().catch(error => {
    elements.error.textContent = error.message;
    if (error.status === 401) lockAdmin();
  });
});

elements.loadMore.addEventListener("click", async () => {
  if (!nextCursor) return;
  setBusy(elements.loadMore, true, "LOADING…");
  try {
    await loadList({ append: true });
  } catch (error) {
    elements.error.textContent = error.message;
    if (error.status === 401) lockAdmin();
  } finally {
    setBusy(elements.loadMore, false, "LOADING…");
  }
});

elements.export.addEventListener("click", async () => {
  elements.error.textContent = "";
  setBusy(elements.export, true, "EXPORTING…");
  try {
    const response = await adminRequest(`/v1/admin/rsvps.csv?${queryString({ filters: activeFilters })}`, { accept: "text/csv" });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "d42pe-ritual-x-rsvps.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    elements.status.textContent = "CSV export started.";
  } catch (error) {
    elements.error.textContent = error.message;
    if (error.status === 401) lockAdmin();
  } finally {
    setBusy(elements.export, false, "EXPORTING…");
  }
});

elements.lock.addEventListener("click", lockAdmin);
