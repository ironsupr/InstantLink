import axios from "axios";
import { clearCachedAuthUser } from "./authCache";
import { clearCachedDashboardSummary } from "./dashboardCache";
import { API_BASE_URL } from "./runtimeConfig";

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send cookies with the request
});

// Automatically handle 401 Unauthorized responses globally.
// The QueryClient cache is cleared so React Query re-fetches /auth/me
// on the next navigation, which redirects the user to /login.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearCachedAuthUser();
      clearCachedDashboardSummary();
      // Use a CustomEvent so any listener (e.g. QueryClient) can react
      // without creating a circular import with the query client module.
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    return Promise.reject(error);
  }
);
