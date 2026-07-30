import { useEffect, useRef, useState } from "react";
import { api, btn, btnPrimary, inputCls } from "../../lib/adminShared";

type SessionStatus = "CREATED" | "SCHEDULED" | "OPEN" | "LATE_REG_CLOSED" | "CLOSED" | "ARCHIVED";

interface PlayerResult {
  playerId: string;
  displayName: string;
  email: string;
  alreadySignedIn: boolean;
}

interface CurrentEntry {
  entryId: string;
  playerId: string;
  displayName: string;
  signInTime: string;
}

type Mode = "signin" | "signout";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function KioskView({ sessionId, sessionStatus }: { sessionId: string; sessionStatus: SessionStatus }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const kioskOpen = sessionStatus === "OPEN" || sessionStatus === "LATE_REG_CLOSED";

  if (!kioskOpen) {
    return (
      <div className="panel-steel rounded-lg p-8 text-center text-muted">
        The kiosk opens once the session is open for registration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className={`flex-1 rounded-lg py-4 font-display text-lg tracking-wide ${
            mode === "signin" ? "bg-ember-deep text-white" : "panel-steel text-muted hover:text-text"
          }`}
          onClick={() => {
            setMode("signin");
            setMessage(null);
          }}
        >
          Sign in
        </button>
        <button
          className={`flex-1 rounded-lg py-4 font-display text-lg tracking-wide ${
            mode === "signout" ? "bg-ember-deep text-white" : "panel-steel text-muted hover:text-text"
          }`}
          onClick={() => {
            setMode("signout");
            setMessage(null);
          }}
        >
          Sign out
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-center font-display text-sm ${
            message.tone === "ok" ? "bg-purple-400/15 text-purple-300" : "bg-ember/15 text-ember"
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === "signin" ? (
        <SignInPanel sessionId={sessionId} setMessage={setMessage} searchInputRef={searchInputRef} />
      ) : (
        <SignOutPanel sessionId={sessionId} setMessage={setMessage} searchInputRef={searchInputRef} />
      )}
    </div>
  );
}

function SignInPanel({
  sessionId,
  setMessage,
  searchInputRef,
}: {
  sessionId: string;
  setMessage: (m: { text: string; tone: "ok" | "error" } | null) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const [results, setResults] = useState<PlayerResult[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults(null);
      return;
    }
    void api<PlayerResult[]>(`/api/admin/sessions/${sessionId}/kiosk/search-players?q=${encodeURIComponent(debounced)}`)
      .then(setResults)
      .catch(() => setResults(null));
  }, [debounced, sessionId]);

  const signIn = (player: PlayerResult) => {
    setBusyId(player.playerId);
    void api<{ ok: true; entry: { displayName: string } }>(`/api/admin/sessions/${sessionId}/kiosk/signin`, {
      method: "POST",
      body: JSON.stringify({ playerId: player.playerId }),
    })
      .then((res) => {
        setMessage({ text: `Signed in: ${res.entry.displayName}`, tone: "ok" });
        setQuery("");
        setResults(null);
        searchInputRef.current?.focus();
      })
      .catch((e: Error) => setMessage({ text: e.message, tone: "error" }))
      .finally(() => setBusyId(null));
  };

  const register = () => {
    if (regName.trim().length === 0) {
      setMessage({ text: "Enter a name.", tone: "error" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setMessage({ text: "Enter a valid email.", tone: "error" });
      return;
    }
    setRegBusy(true);
    void api<{ ok: true; entry: { displayName: string }; reused: boolean }>(
      `/api/admin/sessions/${sessionId}/kiosk/register`,
      { method: "POST", body: JSON.stringify({ displayName: regName.trim(), email: regEmail.trim() }) },
    )
      .then((res) => {
        setMessage({
          text: res.reused ? `Welcome back, ${res.entry.displayName}!` : `Signed in: ${res.entry.displayName}`,
          tone: "ok",
        });
        setRegName("");
        setRegEmail("");
        setShowRegister(false);
        setQuery("");
        setResults(null);
      })
      .catch((e: Error) => setMessage({ text: e.message, tone: "error" }))
      .finally(() => setRegBusy(false));
  };

  return (
    <div className="panel-steel rounded-lg p-4">
      <input
        ref={searchInputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type your name…"
        className={`${inputCls} w-full py-3 text-lg`}
      />

      {results && (
        <div className="mt-3 space-y-1">
          {results.length === 0 && <p className="py-2 text-center text-muted">No matches.</p>}
          {results.map((p) => (
            <button
              key={p.playerId}
              disabled={p.alreadySignedIn || busyId === p.playerId}
              onClick={() => signIn(p)}
              className="flex w-full items-center justify-between rounded border border-steel px-4 py-3 text-left hover:border-ember disabled:opacity-40"
            >
              <span>
                <span className="font-display">{p.displayName}</span>{" "}
                <span className="text-xs text-muted">{p.email}</span>
              </span>
              {p.alreadySignedIn && <span className="text-xs uppercase tracking-widest text-muted">Signed in</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        {!showRegister ? (
          <button className={btn} onClick={() => setShowRegister(true)}>
            Can't find your name? Register
          </button>
        ) : (
          <div className="space-y-2">
            <div className="font-display text-xs uppercase tracking-widest text-muted">New player</div>
            <input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Name"
              className={`${inputCls} w-full py-3`}
            />
            <input
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="Email"
              className={`${inputCls} w-full py-3`}
            />
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={regBusy} onClick={register}>
                Register &amp; sign in
              </button>
              <button className={btn} onClick={() => setShowRegister(false)} disabled={regBusy}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignOutPanel({
  sessionId,
  setMessage,
  searchInputRef,
}: {
  sessionId: string;
  setMessage: (m: { text: string; tone: "ok" | "error" } | null) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const [results, setResults] = useState<CurrentEntry[] | null>(null);
  const [pending, setPending] = useState<CurrentEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (q: string) => {
    void api<CurrentEntry[]>(`/api/admin/sessions/${sessionId}/kiosk/entries?q=${encodeURIComponent(q)}`)
      .then(setResults)
      .catch(() => setResults(null));
  };

  useEffect(() => {
    load(debounced);
  }, [debounced, sessionId]);

  const confirmSignOut = () => {
    if (!pending) return;
    setBusy(true);
    void api<{ ok: true; entry: { displayName: string; finishingPosition: number; entrantCount: number } }>(
      `/api/admin/sessions/${sessionId}/kiosk/signout`,
      { method: "POST", body: JSON.stringify({ entryId: pending.entryId }) },
    )
      .then((res) => {
        setMessage({
          text: `${res.entry.displayName} finished #${res.entry.finishingPosition} of ${res.entry.entrantCount}`,
          tone: "ok",
        });
        setPending(null);
        setQuery("");
        load("");
        searchInputRef.current?.focus();
      })
      .catch((e: Error) => setMessage({ text: e.message, tone: "error" }))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel-steel rounded-lg p-4">
      {pending ? (
        <div className="rounded border border-ember/40 bg-ember/10 p-4 text-center">
          <p className="font-display text-lg">
            Sign out <span className="text-ember">{pending.displayName}</span>?
          </p>
          <p className="mt-1 text-xs text-muted">This can't be undone from here — an admin can reverse it later.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button className={btnPrimary} disabled={busy} onClick={confirmSignOut}>
              Confirm sign-out
            </button>
            <button className={btn} disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={searchInputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search still-playing…"
            className={`${inputCls} w-full py-3 text-lg`}
          />
          <div className="mt-3 space-y-1">
            {results === null && <p className="py-2 text-center text-muted">Loading…</p>}
            {results?.length === 0 && <p className="py-2 text-center text-muted">Nobody still playing matches.</p>}
            {results?.map((e) => (
              <button
                key={e.entryId}
                onClick={() => setPending(e)}
                className="flex w-full items-center justify-between rounded border border-steel px-4 py-3 text-left hover:border-ember"
              >
                <span className="font-display">{e.displayName}</span>
                <span className="text-xs text-muted">
                  Signed in{" "}
                  {new Date(e.signInTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
