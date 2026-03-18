import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import App from "./App.jsx";

import { BrowserRouter } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

// When any Axios request gets a 401, clear the React Query cache so that
// the authUser query refetches and the app redirects to /login.
window.addEventListener("auth:unauthorized", () => {
  // Clear all queries EXCEPT the authUser query.
  // We must not destroy the active authUser query instance, or else
  // its observer gets orphaned and stuck in an infinite loading state.
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "authUser",
  });
  // Safely resolve the existing active observer to unblock the UI
  queryClient.setQueryData(["authUser"], null);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
