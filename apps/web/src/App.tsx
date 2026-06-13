import { lazy, Suspense } from "react";
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

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="society" element={<SocietyPage />} />
                <Route path="sessions" element={<SessionsPage />} />
                <Route path="learn" element={<LearnPage />} />
                <Route path="leaderboards" element={<LeaderboardsPage />} />
                <Route path="play" element={<PlayPage />} />
                <Route path="table" element={<TablePage />} />
                <Route path="submit" element={<SubmitResultPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="auth" element={<AuthPage />} />
                <Route path="check-inbox" element={<CheckInboxPage />} />
                <Route path="onboarding" element={<OnboardingPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
