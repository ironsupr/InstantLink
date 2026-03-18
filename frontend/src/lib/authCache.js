const AUTH_CACHE_KEY = "collab_auth_user_cache";

export const getCachedAuthUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.data?.user) return null;

    return parsed;
  } catch {
    return null;
  }
};

export const setCachedAuthUser = (data) => {
  try {
    if (!data?.user) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    localStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        data,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // ignore storage failures
  }
};

export const clearCachedAuthUser = () => {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // ignore storage failures
  }
};
