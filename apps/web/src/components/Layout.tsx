import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Wordmark } from "./Wordmark";
import { authClient } from "../lib/auth";
import { invalidateMe, useMe } from "../lib/useMe";
import { resetSocket } from "../lib/socket";

const navItems = [
  { to: "/society", label: "Society" },
  { to: "/sessions", label: "Sessions" },
  { to: "/learn", label: "Learn" },
  { to: "/leaderboards", label: "Leaderboards" },
  { to: "/play", label: "Play" },
];

function AuthMenu() {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  if (loading) return null;
  if (!me?.user) {
    return (
      <NavLink
        to="/auth"
        className="rounded border border-steel px-3 py-1.5 font-display text-xs tracking-wide text-muted hover:border-ember hover:text-ember"
      >
        Sign in
      </NavLink>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <Link to="/profile" className="font-display tracking-wide text-text hover:text-ember">
        {me.profile?.nickname ?? me.user.name ?? "…"}
      </Link>
      <button
        className="text-muted underline hover:text-text"
        onClick={() => {
          void authClient.signOut().then(() => {
            invalidateMe();
            resetSocket();
            void refresh();
            navigate("/");
          });
        }}
      >
        Sign out
      </button>
    </span>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-text">
      <header className="fixed inset-x-0 top-0 z-50 bg-bg-0/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
          <Link to="/" aria-label="UOS Poker home" className="shrink-0">
            <Wordmark />
          </Link>
          <ul className="-mx-1 flex w-full items-center gap-0.5 overflow-x-auto text-sm sm:mx-0 sm:w-auto sm:gap-1">
            {navItems.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded px-2 py-1.5 font-display text-[13px] tracking-wide transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                      isActive ? "text-ember" : "text-muted hover:text-text"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="ml-1 shrink-0 sm:ml-2">
              <AuthMenu />
            </li>
          </ul>
        </nav>
        <div className="ember-rail" />
      </header>

      <main className="flex-1 pt-[5.5rem] sm:pt-14">
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
