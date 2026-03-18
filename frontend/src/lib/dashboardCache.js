const DASHBOARD_CACHE_KEY = "collab_dashboard_summary_cache";

export const getCachedDashboardSummary = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;

    return parsed;
  } catch {
    return null;
  }
};

export const setCachedDashboardSummary = (data) => {
  try {
    if (!data) {
      localStorage.removeItem(DASHBOARD_CACHE_KEY);
      return;
    }

    localStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({
        data,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // ignore storage failures
  }
};

export const clearCachedDashboardSummary = () => {
  try {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
  } catch {
    // ignore storage failures
  }
};
