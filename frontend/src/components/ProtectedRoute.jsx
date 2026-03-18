import { Navigate } from "react-router";
import Layout from "./Layout.jsx";

/**
 * Wraps any page that requires the user to be:
 *   1. Authenticated
 *   2. Fully onboarded (profile complete)
 *   3. A member of an organisation
 *
 * Any missing step redirects to the appropriate setup page.
 * Pass `withSidebar={false}` for full-screen pages (e.g. call view).
 */
const ProtectedRoute = ({
  children,
  isAuthenticated,
  isOnboarded,
  hasOrg,
  withSidebar = true,
}) => {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;
  if (!hasOrg) return <Navigate to="/setup-org" replace />;

  if (!withSidebar) return children;
  return <Layout showSidebar={true}>{children}</Layout>;
};

export default ProtectedRoute;
