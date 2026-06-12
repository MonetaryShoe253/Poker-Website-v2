import { Link, NavLink, Outlet } from "react-router";
import { Wordmark } from "./Wordmark";

const navItems = [
  { to: "/society", label: "Society" },
  { to: "/sessions", label: "Sessions" },
  { to: "/learn", label: "Learn" },
  { to: "/leaderboards", label: "Leaderboards" },
  { to: "/play", label: "Play" },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-text">
      <header className="fixed inset-x-0 top-0 z-50 bg-bg-0/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="UOS Poker home">
            <Wordmark />
          </Link>
          <ul className="flex items-center gap-1 text-sm">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded px-3 py-2 font-display tracking-wide transition-colors ${
                      isActive ? "text-ember" : "text-muted hover:text-text"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ember-rail" />
      </header>

      <main className="flex-1 pt-14">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-bg-1">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted">
          <p>Play-money only — no real-money gambling on this site.</p>
          <p>
            Worried about gambling?{" "}
            <a
              href="https://www.begambleaware.org"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text"
            >
              BeGambleAware.org
            </a>
          </p>
          <p>
            <a
              href="https://www.instagram.com/pokersoc_sheffield/"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text"
            >
              Instagram
            </a>{" "}
            ·{" "}
            <a
              href="https://su.sheffield.ac.uk/activities/view/poker"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text"
            >
              Join via the SU
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
