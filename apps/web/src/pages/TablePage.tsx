import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SOCKET_EVENTS as EV, type SeatPayload, type TableStatePayload } from "@uos-poker/shared";
import { getSocket } from "../lib/socket";
import { useTable } from "../lib/useTable";
import { PlayingCard } from "../components/PlayingCard";

/**
 * Minimal-but-correct table view (P2). The full STEEL/EMBER choreography
 * lands in P5; this renders exactly what the server says and nothing more.
 */

/** Seat positions around the oval, rotated so the viewer sits bottom-centre. */
const SEAT_POSITIONS = [
  { left: "50%", top: "88%" }, // bottom centre (you)
  { left: "11%", top: "70%" },
  { left: "11%", top: "26%" },
  { left: "50%", top: "8%" },
  { left: "89%", top: "26%" },
  { left: "89%", top: "70%" },
];

function Countdown({ deadline }: { deadline: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, deadline - Date.now())), 200);
    return () => clearInterval(interval);
  }, [deadline]);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <span className={`tnum text-xs ${seconds <= 5 ? "text-ember" : "text-muted"}`}>{seconds}s</span>
  );
}

function Seat({
  seat,
  state,
  rotatedIndex,
}: {
  seat: SeatPayload | null;
  state: TableStatePayload;
  rotatedIndex: number;
}) {
  const pos = SEAT_POSITIONS[rotatedIndex]!;
  if (!seat) {
    return (
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-line px-3 py-2 text-xs text-muted/50"
        style={{ left: pos.left, top: pos.top }}
      >
        empty
      </div>
    );
  }
  const isActor = state.actionSeat === seat.seat;
  const isButton = state.buttonSeat === seat.seat;
  const revealedCards = state.revealed[seat.seat];
  const isMe = state.mySeat === seat.seat;
  const inHand = !seat.folded && (state.phase === "BETTING" || state.phase === "RUNOUT");
  const won = state.winningSeats.includes(seat.seat);

  return (
    <div
      className={`absolute w-36 -translate-x-1/2 -translate-y-1/2 rounded-lg border p-2 text-center transition-shadow ${
        isActor ? "border-ember shadow-ember" : won ? "border-gold" : "border-steel"
      } ${seat.folded || seat.sittingOut ? "opacity-50" : ""} bg-bg-1`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-center justify-center gap-1 text-sm">
        {isButton && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-bg-0">
            D
          </span>
        )}
        <span className="truncate font-display">{seat.nickname}</span>
        {seat.isBot && (
          <span className="rounded bg-steel px-1 text-[10px] uppercase text-muted">
            bot·{seat.botTier?.toLowerCase()}
          </span>
        )}
      </div>
      <div className="tnum text-sm text-muted">{seat.stack.toLocaleString()}</div>
      <div className="mt-1 flex justify-center gap-1">
        {isMe && state.myCards
          ? state.myCards.map((c) => <PlayingCard key={c} card={c} size="sm" />)
          : revealedCards
            ? revealedCards.map((c) => <PlayingCard key={c} card={c} size="sm" />)
            : inHand && <PlayingCard faceDown size="sm" />}
        {inHand && !isMe && !revealedCards && <PlayingCard faceDown size="sm" />}
      </div>
      {state.shownHandNames[seat.seat] && (
        <div className="mt-1 text-[10px] text-gold">{state.shownHandNames[seat.seat]}</div>
      )}
      {seat.committed > 0 && (
        <div className="tnum mt-1 text-xs text-ember">{seat.committed.toLocaleString()}</div>
      )}
      {seat.lastAction && !seat.committed && (
        <div className="mt-1 text-[10px] uppercase text-muted">{seat.lastAction}</div>
      )}
      {seat.sittingOut && <div className="text-[10px] text-muted">sitting out</div>}
      {seat.disconnected && <div className="text-[10px] text-ember">disconnected</div>}
      {isActor && state.actionDeadline && <Countdown deadline={state.actionDeadline} />}
      {seat.allIn && !seat.folded && (
        <div className="text-[10px] font-bold uppercase text-ember">all in</div>
      )}
    </div>
  );
}

function ActionDock({ state }: { state: TableStatePayload }) {
  const legal = state.myLegal;
  const [raiseTo, setRaiseTo] = useState(0);
  const lastHand = useRef<string>("");

  useEffect(() => {
    const key = `${state.handNo}:${state.seq}`;
    if (legal && lastHand.current !== key) {
      lastHand.current = key;
      setRaiseTo(legal.raise?.minTo ?? legal.bet?.minTo ?? 0);
    }
  }, [legal, state.handNo, state.seq]);

  if (!legal) return null;
  const send = (action: string, amount?: number) => {
    getSocket().emit(EV.action, {
      tableId: state.tableId,
      handNo: state.handNo,
      seq: state.seq,
      action,
      ...(amount !== undefined ? { amount } : {}),
    });
  };
  const range = legal.raise ?? legal.bet;
  const raiseLabel = legal.raise ? "Raise to" : "Bet";

  return (
    <div className="panel-steel mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-lg p-3">
      <button
        onClick={() => send("FOLD")}
        className="rounded border border-steel px-4 py-2 font-display text-sm hover:border-ember hover:text-ember"
      >
        Fold
      </button>
      {legal.check && (
        <button
          onClick={() => send("CHECK")}
          className="rounded border border-steel px-4 py-2 font-display text-sm hover:border-ember hover:text-ember"
        >
          Check
        </button>
      )}
      {legal.call && (
        <button
          onClick={() => send("CALL")}
          className="rounded bg-steel px-4 py-2 font-display text-sm hover:bg-ember-deep"
        >
          Call {legal.call.amount.toLocaleString()}
          {legal.call.allIn ? " (all in)" : ""}
        </button>
      )}
      {range && (
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={range.minTo}
            max={range.maxTo}
            step={25}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="accent-ember"
          />
          <input
            type="number"
            className="tnum w-24 rounded border border-steel bg-bg-0 px-2 py-1 text-sm"
            value={raiseTo}
            min={range.minTo}
            max={range.maxTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <button
            onClick={() => {
              const clamped = Math.min(range.maxTo, Math.max(range.minTo, Math.round(raiseTo)));
              if (clamped === range.maxTo && !window.confirm("All in — are you sure?")) return;
              send(legal.raise ? "RAISE" : "BET", clamped);
            }}
            className="rounded bg-ember-deep px-4 py-2 font-display text-sm text-white hover:bg-ember"
          >
            {raiseLabel} {raiseTo.toLocaleString()}
          </button>
        </span>
      )}
    </div>
  );
}

export function TablePage() {
  const { state, chat, error } = useTable();
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  if (!state) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 text-center text-muted">
        <p>No table in view — head to the lobby.</p>
        <button
          onClick={() => navigate("/play")}
          className="mt-4 rounded bg-ember-deep px-4 py-2 font-display text-sm text-white"
        >
          To the lobby
        </button>
      </section>
    );
  }

  // Rotate seats so the viewer is bottom-centre.
  const mySeat = state.mySeat ?? 0;
  const rotationOf = (seat: number) => (seat - mySeat + 6) % 6;

  const sendChat = () => {
    if (!message.trim()) return;
    getSocket().emit(EV.chat, { tableId: state.tableId, message: message.trim() });
    setMessage("");
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-xl tracking-wide">
          {state.name}
          {state.isPractice && <span className="ml-2 text-sm text-muted">(practice·unrated)</span>}
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{state.spectators} watching</span>
          {state.mySeat !== null ? (
            <button
              onClick={() => {
                getSocket().emit(EV.standUp);
                navigate("/play");
              }}
              className="rounded border border-steel px-3 py-1 hover:border-ember hover:text-ember"
            >
              Stand up
            </button>
          ) : (
            <button
              onClick={() => getSocket().emit(EV.sitDown, { tableId: state.tableId, buyIn: 10000 })}
              className="rounded bg-ember-deep px-3 py-1 font-display text-white hover:bg-ember"
            >
              Take a seat
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded border border-ember bg-ember/10 px-3 py-2 text-sm text-ember">
          {error.message}
        </div>
      )}
      {state.sittingOut && (
        <div className="mt-2 flex items-center gap-3 rounded border border-line bg-bg-1 px-3 py-2 text-sm">
          <span className="text-muted">You're sitting out.</span>
          <button
            onClick={() => getSocket().emit(EV.imBack)}
            className="rounded bg-ember-deep px-3 py-1 font-display text-xs text-white hover:bg-ember"
          >
            I'm back
          </button>
        </div>
      )}

      {/* The felt */}
      <div className="relative mx-auto mt-4 h-[420px] max-w-3xl rounded-[50%] border-4 border-steel bg-felt shadow-inner">
        <div className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="flex justify-center gap-1">
            {state.board.map((card) => (
              <PlayingCard key={card} card={card} />
            ))}
            {state.board.length === 0 && state.phase === "WAITING" && (
              <span className="text-sm text-muted">Bots are warming up the felt…</span>
            )}
          </div>
          {state.totalPot > 0 && (
            <div className="tnum mt-2 text-sm text-gold">pot {state.totalPot.toLocaleString()}</div>
          )}
          {state.street && state.phase !== "WAITING" && (
            <div className="mt-1 text-xs uppercase tracking-widest text-muted">{state.street}</div>
          )}
        </div>
        {state.seats.map((seat, i) => (
          <Seat key={i} seat={seat} state={state} rotatedIndex={rotationOf(i)} />
        ))}
      </div>

      <ActionDock state={state} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="panel-steel rounded-lg p-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted">Hand log</h2>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
            {state.handLog.length === 0 && <li>No hands yet.</li>}
            {[...state.handLog].reverse().map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="panel-steel rounded-lg p-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted">Chat</h2>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
            {chat.map((c, i) => (
              <li key={i}>
                <span className="text-ember">{c.nickname}</span>{" "}
                <span className="text-text">{c.message}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              className="flex-1 rounded border border-steel bg-bg-0 px-2 py-1 text-sm outline-none focus:border-ember"
              placeholder="Say something…"
              maxLength={300}
            />
            <button
              onClick={sendChat}
              className="rounded border border-steel px-3 py-1 text-sm hover:border-ember"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
