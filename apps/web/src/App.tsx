import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { SocietyPage } from "./pages/SocietyPage";
import { SessionsPage } from "./pages/SessionsPage";
import { LearnPage } from "./pages/LearnPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlayPage } from "./pages/PlayPage";
import { TablePage } from "./pages/TablePage";
import { AuthPage } from "./pages/AuthPage";
import { CheckInboxPage } from "./pages/CheckInboxPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { LeaderboardsPage } from "./pages/LeaderboardsPage";
import { SubmitResultPage } from "./pages/SubmitResultPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="society" element={<SocietyPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="leaderboards" element={<LeaderboardsPage />} />
        <Route path="play" element={<PlayPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="submit" element={<SubmitResultPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="check-inbox" element={<CheckInboxPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
