import { useState } from "react";
import { useNavigate } from "react-router";
import { SOCKET_EVENTS as EV, type BotTier } from "@uos-poker/shared";
import { getNickname, getSocket, setNickname } from "../lib/socket";
import { useLobby } from "../lib/useTable";

export function PlayPage() {
  const [nickname, setNick] = useState(getNickname() ?? "");
  const [savedNick, setSavedNick] = useState(getNickname());
  const [tier, setTier] = useState<BotTier>("CASUAL");
  const lobby = useLobby();
  const navigate = useNavigate();

  const saveNickname = () => {
    const trimmed = nickname.trim();
    if (/^[A-Za-z0-9_-]{3,16}$/.test(trimmed)) {
      setNickname(trimmed);
      setSavedNick(trimmed);
    }
  };

  const playNow = () => {
    getSocket().emit(EV.playNow);
    navigate("/table");
  };

  const practice = () => {
    getSocket().emit(EV.practice, { tier, botCount: 3 });
    navigate("/table");
  };

  const join = (tableId: string) => {
    getSocket().emit(EV.joinTable, { tableId });
    navigate("/table");
  };

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">THE LOBBY</h1>

      {!savedNick ? (
        <div className="panel-steel mt-6 rounded-lg p-6">
          <h2 className="font-display text-lg">Pick a nickname to play</h2>
          <p className="mt-1 text-sm text-muted">
            3–16 characters: letters, numbers, _ or -. (Accounts arrive soon — this is the dev
            door.)
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={nickname}
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNickname()}
              className="rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember"
              placeholder="Nickname"
            />
            <button
              onClick={saveNickname}
              className="rounded bg-ember-deep px-4 py-2 font-display text-sm text-white hover:bg-ember"
            >
              Take a seat
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              onClick={playNow}
              className="rounded bg-ember-deep px-6 py-3 font-display text-lg tracking-wide text-white shadow-ember hover:bg-ember"
            >
              Play now
            </button>
            <div className="panel-steel flex items-center gap-2 rounded px-3 py-2">
              <span className="text-sm text-muted">Practice vs</span>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as BotTier)}
                className="rounded border border-steel bg-bg-0 px-2 py-1 text-sm"
              >
                <option value="FISH">Fish</option>
                <option value="CASUAL">Casual</option>
                <option value="SOLID">Solid</option>
                <option value="SHARK">Shark</option>
              </select>
              <button
                onClick={practice}
                className="rounded border border-steel px-3 py-1 font-display text-sm hover:border-ember hover:text-ember"
              >
                Deal me in
              </button>
            </div>
            <span className="text-sm text-muted">
              Playing as <span className="text-text">{savedNick}</span>{" "}
              <button className="underline" onClick={() => setSavedNick(null)}>
                change
              </button>
            </span>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-xl tracking-wide">Live tables</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(lobby?.tables ?? []).map((table) => (
                <div key={table.tableId} className="panel-steel rounded-lg p-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-lg">{table.name}</h3>
                    <span className="tnum text-xs text-muted">avg pot {table.avgPot}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {table.humans} human{table.humans === 1 ? "" : "s"} · {table.bots} bot
                    {table.bots === 1 ? "" : "s"} · {table.seatsFree} seat
                    {table.seatsFree === 1 ? "" : "s"} free · {table.spectators} watching
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => join(table.tableId)}
                      className="rounded border border-steel px-3 py-1 text-sm hover:border-ember hover:text-ember"
                    >
                      Spectate
                    </button>
                    {table.seatsFree > 0 && (
                      <button
                        onClick={() => {
                          getSocket().emit(EV.sitDown, { tableId: table.tableId, buyIn: 10000 });
                          navigate("/table");
                        }}
                        className="rounded bg-ember-deep px-3 py-1 font-display text-sm text-white hover:bg-ember"
                      >
                        Take a seat
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {lobby === null && <p className="text-muted">Connecting to the card room…</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
