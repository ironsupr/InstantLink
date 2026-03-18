import { Navigate, Route, Routes } from "react-router";
import { lazy, Suspense } from "react";

// ── Lazy-loaded pages (each becomes its own chunk) ──
const HomePage              = lazy(() => import("./pages/HomePage.jsx"));
const SignUpPage            = lazy(() => import("./pages/SignUpPage.jsx"));
const LoginPage             = lazy(() => import("./pages/LoginPage.jsx"));
const NotificationsPage     = lazy(() => import("./pages/NotificationsPage.jsx"));
const CallPage              = lazy(() => import("./pages/CallPage.jsx"));
const FullScreenChatPage    = lazy(() => import("./pages/FullScreenChatPage.jsx"));
const OnboardingPage        = lazy(() => import("./pages/OnboardingPage.jsx"));
const OrganizationSetupPage = lazy(() => import("./pages/OrganizationSetupPage.jsx"));
const FriendsPage           = lazy(() => import("./pages/FriendsPage.jsx"));
const SearchPage            = lazy(() => import("./pages/SearchPage.jsx"));
const FilesPage             = lazy(() => import("./pages/FilesPage.jsx"));
const SchedulePage          = lazy(() => import("./pages/SchedulePage.jsx"));
const AdminPage             = lazy(() => import("./pages/AdminPage.jsx"));
const ProfilePage           = lazy(() => import("./pages/ProfilePage.jsx"));
const MeetingRecordsPage    = lazy(() => import("./pages/MeetingRecordsPage.jsx"));

// Heavy Stream Video SDK — only loaded when a user is authenticated
const GlobalVideoCallHandler = lazy(() => import("./components/GlobalVideoCallHandler.jsx"));

import { Toaster } from "react-hot-toast";
import PageLoader from "./components/PageLoader.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PublicRoute from "./components/PublicRoute.jsx";
import useAuthUser from "./hooks/useAuthUser.js";
import { useThemeStore } from "./store/useThemeStore.js";
import { StreamProvider } from "./context/StreamContext.jsx";

const App = () => {
  const { isLoading, authUser } = useAuthUser();
  const { theme } = useThemeStore();

  const isAuthenticated = Boolean(authUser);
  const isOnboarded = Boolean(authUser?.isOnboarded);
  const hasOrg = Boolean(authUser?.organization);
  const shouldEnableRealtime = isAuthenticated && isOnboarded && hasOrg;

  console.log("App state:", { isLoading, authUser, isAuthenticated });

  if (isLoading) return <PageLoader />;

  // Shared props passed to every route guard
  const guardProps = { isAuthenticated, isOnboarded, hasOrg };

  const routes = (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      {/* ── Public routes (redirect away when already authenticated) ── */}
      <Route
        path="/signup"
        element={<PublicRoute {...guardProps}><SignUpPage /></PublicRoute>}
      />
      <Route
        path="/login"
        element={<PublicRoute {...guardProps}><LoginPage /></PublicRoute>}
      />

      {/* ── Onboarding: auth required, but no org yet ── */}
      <Route
        path="/onboarding"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : isOnboarded ? (
            <Navigate to={hasOrg ? "/" : "/setup-org"} replace />
          ) : (
            <OnboardingPage />
          )
        }
      />

      {/* ── Org setup: auth + onboarded required, but no org yet ── */}
      <Route
        path="/setup-org"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : !isOnboarded ? (
            <Navigate to="/onboarding" replace />
          ) : hasOrg ? (
            <Navigate to="/" replace />
          ) : (
            <OrganizationSetupPage />
          )
        }
      />

      {/* ── Protected pages ── */}
      <Route path="/"              element={<ProtectedRoute {...guardProps}><HomePage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute {...guardProps}><NotificationsPage /></ProtectedRoute>} />
      <Route path="/friends"       element={<ProtectedRoute {...guardProps}><FriendsPage /></ProtectedRoute>} />
      <Route path="/search"        element={<ProtectedRoute {...guardProps}><SearchPage /></ProtectedRoute>} />
      <Route path="/files"         element={<ProtectedRoute {...guardProps}><FilesPage /></ProtectedRoute>} />
      <Route path="/schedule"      element={<ProtectedRoute {...guardProps}><SchedulePage /></ProtectedRoute>} />
      <Route path="/admin"         element={<ProtectedRoute {...guardProps}><AdminPage /></ProtectedRoute>} />
      <Route path="/profile"       element={<ProtectedRoute {...guardProps}><ProfilePage /></ProtectedRoute>} />
      <Route path="/records"       element={<ProtectedRoute {...guardProps}><MeetingRecordsPage /></ProtectedRoute>} />
      <Route path="/chat/:id"      element={<ProtectedRoute {...guardProps}><FullScreenChatPage /></ProtectedRoute>} />
      <Route path="/call/:id"      element={<ProtectedRoute {...guardProps} withSidebar={false}><CallPage /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );

  return (
    <div className="h-screen" data-theme={theme}>
      {shouldEnableRealtime ? (
        <StreamProvider>
          {routes}
          <Suspense fallback={null}>
            <GlobalVideoCallHandler />
          </Suspense>
        </StreamProvider>
      ) : (
        routes
      )}

      <Toaster />
    </div>
  );
};
export default App;

