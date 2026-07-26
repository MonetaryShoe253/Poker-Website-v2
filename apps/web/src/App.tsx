import { Component, lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";

/**
 * Home loads eagerly (it's the landing page); everything else is lazy so the
 * initial bundle stays small. The table route in particular pulls framer +
 * sound + socket logic that most visitors never need.
 */
const SocietyPage = lazy(() => import("./pages/SocietyPage").then((m) => ({ default: m.SocietyPage })));
const SessionsPage = lazy(() => import("./pages/SessionsPage").then((m) => ({ default: m.SessionsPage })));
const LearnPage = lazy(() => import("./pages/LearnPage").then((m) => ({ default: m.LearnPage })));
const LeaderboardsPage = lazy(() =>
  import("./pages/LeaderboardsPage").then((m) => ({ default: m.LeaderboardsPage })),
);
const PlayPage = lazy(() => import("./pages/PlayPage").then((m) => ({ default: m.PlayPage })));
const TablePage = lazy(() => import("./pages/TablePage").then((m) => ({ default: m.TablePage })));
const SubmitResultPage = lazy(() =>
  import("./pages/SubmitResultPage").then((m) => ({ default: m.SubmitResultPage })),
);
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const ManageTournamentPage = lazy(() =>
  import("./pages/ManageTournamentPage").then((m) => ({ default: m.ManageTournamentPage })),
);
const AuthPage = lazy(() => import("./pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const CheckInboxPage = lazy(() =>
  import("./pages/CheckInboxPage").then((m) => ({ default: m.CheckInboxPage })),
);
const OnboardingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-32 text-sm text-muted" aria-busy="true">
      Shuffling up…
    </div>
  );
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm text-muted">
          <p>That page hit an error. Try refreshing or going back home.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export function App() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="society" element={withSuspense(<SocietyPage />)} />
          <Route path="sessions" element={withSuspense(<SessionsPage />)} />
          <Route path="learn" element={withSuspense(<LearnPage />)} />
          <Route path="leaderboards" element={withSuspense(<LeaderboardsPage />)} />
          <Route path="play" element={withSuspense(<PlayPage />)} />
          <Route path="table" element={withSuspense(<TablePage />)} />
          <Route path="submit" element={withSuspense(<SubmitResultPage />)} />
          <Route path="profile" element={withSuspense(<ProfilePage />)} />
          <Route path="admin" element={withSuspense(<AdminPage />)} />
          <Route path="manage-tournament" element={withSuspense(<ManageTournamentPage />)} />
          <Route path="auth" element={withSuspense(<AuthPage />)} />
          <Route path="check-inbox" element={withSuspense(<CheckInboxPage />)} />
          <Route path="onboarding" element={withSuspense(<OnboardingPage />)} />
          <Route path="reset-password" element={withSuspense(<ResetPasswordPage />)} />
          <Route path="*" element={withSuspense(<NotFoundPage />)} />
        </Route>
      </Routes>
    </RouteErrorBoundary>
  );
}
