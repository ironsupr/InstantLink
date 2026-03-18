import { Navigate } from "react-router";

/**
 * Wraps public-only pages (login, signup).
 * Redirects authenticated users to their logical next destination:
 *   - Not onboarded       → /onboarding
 *   - Onboarded, no org   → /setup-org
 *   - Fully set up        → /
 */
const PublicRoute = ({ children, isAuthenticated, isOnboarded, hasOrg }) => {
  if (!isAuthenticated) return children;
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;
  if (!hasOrg) return <Navigate to="/setup-org" replace />;
  return <Navigate to="/" replace />;
};

export default PublicRoute;
