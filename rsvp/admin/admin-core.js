const DEFAULT_FILTERS = Object.freeze({ status: "all", search: "" });

export function normalizeAdminFilters(filters = DEFAULT_FILTERS) {
  return {
    status: typeof filters.status === "string" && filters.status ? filters.status : "all",
    search: typeof filters.search === "string" ? filters.search.trim() : ""
  };
}

export function createAdminListState({ generation = 0 } = {}) {
  return {
    generation,
    loadedRecords: [],
    nextCursor: "",
    activeFilters: { ...DEFAULT_FILTERS },
    pagination: null,
    counts: { confirmed: 0, started: 0, total: 0 }
  };
}

export function beginAdminListRequest(state, { append = false, filters = DEFAULT_FILTERS } = {}) {
  const generation = state.generation + 1;
  const request = {
    append,
    generation,
    filters: append ? { ...state.activeFilters } : normalizeAdminFilters(filters),
    cursor: append ? state.nextCursor : ""
  };
  return {
    state: { ...state, generation },
    request
  };
}

export function applyAdminListResponse(state, request, payload) {
  if (request.generation !== state.generation) return { applied: false, state };

  const records = Array.isArray(payload.records) ? payload.records : [];
  const pagination = payload.pagination || null;
  return {
    applied: true,
    state: {
      ...state,
      activeFilters: request.append ? state.activeFilters : { ...request.filters },
      loadedRecords: request.append ? [...state.loadedRecords, ...records] : [...records],
      nextCursor: pagination?.nextCursor || "",
      pagination,
      counts: payload.counts || state.counts
    }
  };
}

export function invalidateAdminListState(state) {
  return createAdminListState({ generation: state.generation + 1 });
}

export function buildAdminQuery({ filters = DEFAULT_FILTERS, cursor = "", limit = "" } = {}) {
  const normalized = normalizeAdminFilters(filters);
  const params = new URLSearchParams();
  params.set("status", normalized.status);
  if (normalized.search) params.set("search", normalized.search);
  if (limit) params.set("limit", limit);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}
