import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CASH_NET_SOFT_LIMIT } from "@uos-poker/shared";
import { useMe } from "../lib/useMe";

interface OpenSession {
  id: string;
  type: "TOURNAMENT" | "CASH";
  date: string;
}

const inputClass =
  "w-full rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember";

export function SubmitResultPage() {
  const { me, loading } = useMe();
  const [sessions, setSessions] = useState<OpenSession[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [position, setPosition] = useState("");
  const [entrants, setEntrants] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/sessions/open")
      .then((r) => r.json())
      .then((list: OpenSession[]) => {
        setSessions(list);
        if (list.length > 0) setSessionId(list[0]!.id);
      });
  }, []);

  const session = sessions?.find((s) => s.id === sessionId);

  const submit = async () => {
    if (!session) return;
    setError(null);
    setBusy(true);
    try {
      let body: Record<string, unknown>;
      let path: string;
      if (session.type === "TOURNAMENT") {
        path = "/api/submissions/tournament";
        body = {
          sessionId,
          code: code.trim(),
          finishingPosition: Number(position),
          entrantCount: Number(entrants),
        };
      } else {
        path = "/api/submissions/cash";
        const net = Number(cashOut) - Number(buyIn);
        if (
          Math.abs(net) > CASH_NET_SOFT_LIMIT &&
          !window.confirm(
            `That's a net of ${net >= 0 ? "+" : ""}${net.toLocaleString()} — looks big. Sure?`,
          )
        ) {
          return;
        }
        body = {
          sessionId,
          code: code.trim(),
          buyInChips: Number(buyIn),
          cashOutChips: Number(cashOut),
        };
      }
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That didn't go through — try again.");
        return;
      }
      setSuccess(
        session.type === "TOURNAMENT"
          ? "On the board. Points are live — go look."
          : "On the board. Net's been counted — go look.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  if (!me?.user || !me.profile?.nickname) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">SUBMIT RESULT</h1>
        <p className="mt-4 text-muted">You need a verified account with a nickname to submit.</p>
        <Link
          to="/auth"
          className="mt-4 inline-block rounded bg-ember-deep px-4 py-2 font-display text-sm text-white hover:bg-ember"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (success) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-[0.12em] text-gold">
          RESULT IN
        </h1>
        <p className="mt-4 text-muted">{success}</p>
        <Link
          to="/leaderboards"
          className="mt-6 inline-block rounded bg-ember-deep px-4 py-2 font-display text-sm text-white hover:bg-ember"
        >
          See the leaderboards
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">SUBMIT RESULT</h1>
      <p className="mt-2 text-sm text-muted">
        Enter tonight's code (announced in the room) and your result. One submission per session.
      </p>

      {sessions !== null && sessions.length === 0 ? (
        <div className="panel-steel mt-6 rounded-lg p-6 text-center text-muted">
          <p>No session is open for submissions right now.</p>
          <p className="mt-2 text-sm">
            Windows open 17:00–23:59 on session nights (Tuesdays &amp; Thursdays).
          </p>
        </div>
      ) : (
        <div className="panel-steel mt-6 space-y-3 rounded-lg p-6">
          {sessions && sessions.length > 1 && (
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className={inputClass}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.type === "TOURNAMENT" ? "Tournament" : "Cash game"} —{" "}
                  {new Date(s.date).toLocaleDateString("en-GB")}
                </option>
              ))}
            </select>
          )}
          {session && (
            <p className="font-display text-sm tracking-wide text-text">
              {session.type === "TOURNAMENT" ? "Tuesday tournament" : "Thursday cash game"}
            </p>
          )}
          <input
            className={`${inputClass} font-mono uppercase tracking-[0.3em]`}
            placeholder="SESSION CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          {session?.type === "TOURNAMENT" ? (
            <div className="flex gap-3">
              <input
                className={inputClass}
                type="number"
                min={1}
                placeholder="Your finish (e.g. 3)"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
              <input
                className={inputClass}
                type="number"
                min={2}
                placeholder="Total entrants"
                value={entrants}
                onChange={(e) => setEntrants(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex gap-3">
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="Buy-in (chips)"
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
              />
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="Cash-out (chips)"
                value={cashOut}
                onChange={(e) => setCashOut(e.target.value)}
              />
            </div>
          )}
          {session?.type === "CASH" && buyIn !== "" && cashOut !== "" && (
            <p className="tnum text-sm text-muted">
              Net:{" "}
              <span className={Number(cashOut) - Number(buyIn) >= 0 ? "text-green-400" : "text-ember"}>
                {Number(cashOut) - Number(buyIn) >= 0 ? "+" : ""}
                {(Number(cashOut) - Number(buyIn)).toLocaleString()}
              </span>
            </p>
          )}
          {error && <p className="text-sm text-ember">{error}</p>}
          <button
            className="w-full rounded bg-ember-deep px-4 py-2.5 font-display tracking-wide text-white hover:bg-ember disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy || !session || code.trim().length < 6}
          >
            Submit result
          </button>
        </div>
      )}
    </section>
  );
}
