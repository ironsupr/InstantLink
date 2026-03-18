const DEFAULT_API_BASE_URL = import.meta.env.MODE === "development"
  ? "http://localhost:5000/api"
  : "/api";

const sanitizeBaseUrl = (value) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;
  return trimmed.replace(/\/$/, "");
};

export const API_BASE_URL = sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const buildApiUrl = (path = "") => {
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};