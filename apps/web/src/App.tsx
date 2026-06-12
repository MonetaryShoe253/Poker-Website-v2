import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { PlayPage } from "./pages/PlayPage";
import { TablePage } from "./pages/TablePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="society" element={<PlaceholderPage title="The Society" />} />
        <Route path="sessions" element={<PlaceholderPage title="Sessions" />} />
        <Route path="learn" element={<PlaceholderPage title="Learn poker" />} />
        <Route path="leaderboards" element={<PlaceholderPage title="Leaderboards" />} />
        <Route path="play" element={<PlayPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="*" element={<PlaceholderPage title="Dead hand" notFound />} />
      </Route>
    </Routes>
  );
}
