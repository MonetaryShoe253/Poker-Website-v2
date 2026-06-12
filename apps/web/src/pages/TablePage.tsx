import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  SOCKET_EVENTS as EV,
  type SeatPayload,
  type TableEventPayload,
  type TableStatePayload,
} from "@uos-poker/shared";
import { getSocket } from "../lib/socket";
import { useTable } from "../lib/useTable";
import { useMe } from "../lib/useMe";
import { isMuted, setMuted, sounds, unlockAudio } from "../lib/sounds";
import { PlayingCard } from "../components/PlayingCard";
import { CheatSheetOverlay } from "../components/CheatSheet";
import { usePageMeta } from "../lib/usePageMeta";

/**
 * The table — §16's choreography of attention. At any moment exactly one
 * thing carries the ember glow: your turn → the winning hand → new cards.
 * Everything else stays in quiet steel.
 */

const SEAT_POSITIONS = [
  { left: "50%", top: "84%" },
  { left: "17%", top: "68%" },
  { left: "17%", top: "30%" },
  { left: "50%", top: "13%" },
  { left: "83%", top: "30%" },
  { left: "83%", top: "68%" },
];

function CountdownRing({
  deadline,
  total,
  mine,
  soundsOn,
}: {
  deadline: number;
  total: number;
  mine: boolean;
  soundsOn: boolean;
}) {
  const [remaining, setRemaining] = useState(Math.max(0, deadline - Date.now()));
  const lastTick = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, deadline - Date.now());
      setRemaining(r);
      const seconds = Math.ceil(r / 1000);
      if (mine && soundsOn && seconds <= 5 && seconds > 0 && seconds !== lastTick.current) {
        lastTick.current = seconds;
        sounds.timerTick();
      }
    }, 150);
    return () => clearInterval(interval);
  }, [deadline, mine, soundsOn]);

  const fraction = Math.max(0, Math.min(1, remaining / total));
  const seconds = Math.ceil(remaining / 1000);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const colour = fraction > 0.4 ? "#D8B05A" : "#FF2D40";
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${seconds} seconds left`}>
      <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
        <circle cx="11" cy="11" r={radius} fill="none" stroke="#343B44" strokeWidth="2.5" />
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          strokeLinecap="round"
        />
      </svg>
      <span className={`tnum text-xs ${seconds <= 5 ? "text-ember" : "text-muted"}`}>{seconds}s</span>
    </span>
  );
}

function SeatBox({
  seat,
  state,
  fourColour,
  soundsOn,
  compact = false,
  style,
}: {
  seat: SeatPayload;
  state: TableStatePayload;
  fourColour: boolean;
  soundsOn: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const isActor = state.actionSeat === seat.seat && state.phase === "BETTING";
  const isButton = state.buttonSeat === seat.seat;
  const isMe = state.mySeat === seat.seat;
  const revealedCards = state.revealed[seat.seat];
  const inHand = !seat.folded && state.phase !== "WAITING" && state.handNo > 0 && !seat.sittingOut;
  const showdown = state.winningSeats.length > 0;
  const won = state.winningSeats.includes(seat.seat);
  const handName = state.shownHandNames[seat.seat];

  // The glow budget: during betting only the actor glows; at showdown only
  // winners do. Everything else is quiet steel.
  const frameClass = isActor
    ? "border-ember ember-pulse"
    : won && showdown
      ? "border-gold"
      : "border-steel";

  const renderCards = () => {
    const cardsToShow = isMe && state.myCards ? state.myCards : revealedCards;
    if (cardsToShow) {
      return cardsToShow.map((c) => (
        <PlayingCard
          key={c}
          card={c}
          size="sm"
          fourColour={fourColour}
          glow={showdown && state.winningCards.includes(c)}
          dimmed={showdown && !state.winningCards.includes(c)}
        />
      ));
    }
    if (inHand) {
      return (
        <>
          <PlayingCard faceDown size="sm" />
          <PlayingCard faceDown size="sm" />
        </>
      );
    }
    return null;
  };

  return (
    <div
      className={`${compact ? "w-[104px]" : "absolute w-36 -translate-x-1/2 -translate-y-1/2"} rounded-lg border bg-bg-1 p-2 text-center transition-all duration-300 ${frameClass} ${
        seat.folded || seat.sittingOut ? "opacity-45" : ""
      } ${showdown && !won && !seat.folded ? "opacity-60" : ""}`}
      style={style}
    >
      <div className="flex items-center justify-center gap-1 text-sm">
        {isButton && (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-bg-0">
            D
          </span>
        )}
        <span className={`truncate font-display ${won && showdown ? "text-gold" : ""}`}>
          {seat.nickname}
        </span>
      </div>
      {seat.isBot && (
        <div className="mt-0.5">
          <span className="rounded bg-steel px-1 text-[9px] uppercase tracking-wider text-muted">
            bot · {seat.botTier?.toLowerCase()}
          </span>
        </div>
      )}
      <div className="tnum text-sm text-muted">{seat.stack.toLocaleString()}</div>
      <div className="mt-1 flex min-h-10 items-center justify-center gap-1">{renderCards()}</div>
      {handName && <div className="mt-1 text-[10px] leading-tight text-gold">{handName}</div>}
      <AnimatePresence>
        {seat.committed > 0 && (
          <motion.div
            className="tnum mt-1 text-xs text-ember"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35 }}
          >
            ● {seat.committed.toLocaleString()}
          </motion.div>
        )}
      </AnimatePresence>
      {seat.lastAction && seat.committed === 0 && !showdown && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
          {seat.lastAction}
        </div>
      )}
      {seat.allIn && !seat.folded && (
        <div className="text-[10px] font-bold uppercase tracking-wider text-ember">all in</div>
      )}
      {seat.sittingOut && <div className="text-[10px] text-muted">sitting out</div>}
      {seat.disconnected && <div className="text-[10px] text-ember">reconnecting…</div>}
      {isActor && state.actionDeadline && (
        <div className="mt-1">
          <CountdownRing
            deadline={state.actionDeadline}
            total={state.timeBankEngaged ? 30_000 : 20_000}
            mine={isMe}
            soundsOn={soundsOn}
          />
          {state.timeBankEngaged && (
            <div className="text-[9px] uppercase tracking-wider text-gold">time bank</div>
          )}
        </div>
      )}
    </div>
  );
}

function Board({
  state,
  fourColour,
}: {
  state: TableStatePayload;
  fourColour: boolean;
}) {
  const showdown = state.winningSeats.length > 0;
  const winnerLine = (() => {
    if (!showdown) return null;
    const seat = state.winningSeats[0]!;
    const name = state.seats[seat]?.nickname ?? "";
    const handName = state.shownHandNames[seat];
    return handName ? `${name} wins — ${handName}` : `${name} wins the pot`;
  })();

  return (
    <div className="text-center">
      <div className="flex min-h-14 items-center justify-center gap-1.5">
        {state.board.map((card, i) => (
          <PlayingCard
            key={card}
            card={card}
            fourColour={fourColour}
            flipIn={i >= state.board.length - (state.board.length === 3 ? 3 : 1)}
            glow={showdown && state.winningCards.includes(card)}
            dimmed={showdown && !state.winningCards.includes(card)}
          />
        ))}
        {state.board.length === 0 && state.phase === "WAITING" && (
          <span className="text-sm text-muted">Bots are warming up the felt…</span>
        )}
      </div>
      {state.totalPot > 0 && (
        <motion.div
          className="tnum mt-2 inline-flex items-center gap-2 rounded-full border border-line bg-bg-1/80 px-3 py-1 text-sm text-gold"
          layout
        >
          <span aria-hidden="true" className="flex">
            <span className="h-3 w-3 rounded-full border border-gold/60 bg-bg-2" />
            <span className="-ml-1.5 h-3 w-3 rounded-full border border-gold/60 bg-bg-2" />
            <span className="-ml-1.5 h-3 w-3 rounded-full border border-gold/60 bg-bg-2" />
          </span>
          pot {state.totalPot.toLocaleString()}
        </motion.div>
      )}
      {state.street && state.phase !== "WAITING" && !showdown && (
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted">{state.street}</div>
      )}
      <AnimatePresence>
        {winnerLine && (
          <motion.p
            className="mt-2 font-display text-base text-gold"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {winnerLine}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionDock({ state }: { state: TableStatePayload }) {
  const legal = state.myLegal;
  const [raiseTo, setRaiseTo] = useState(0);
  const lastKey = useRef("");

  useEffect(() => {
    const key = `${state.handNo}:${state.seq}`;
    if (legal && lastKey.current !== key) {
      lastKey.current = key;
      setRaiseTo(legal.raise?.minTo ?? legal.bet?.minTo ?? 0);
    }
  }, [legal, state.handNo, state.seq]);

  if (!legal) return null;
  const send = (action: string, amount?: number) => {
    unlockAudio();
    getSocket().emit(EV.action, {
      tableId: state.tableId,
      handNo: state.handNo,
      seq: state.seq,
      action,
      ...(amount !== undefined ? { amount } : {}),
    });
  };
  const range = legal.raise ?? legal.bet;
  const pot = Math.max(state.totalPot, 100);
  const presets = range
    ? ([
        ["½ pot", Math.round(pot / 2)],
        ["⅔ pot", Math.round((pot * 2) / 3)],
        ["pot", pot],
        ["all in", range.maxTo],
      ] as const)
    : [];

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="panel-steel mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-lg p-3"
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => send("FOLD")}
          className="min-w-20 rounded border border-steel px-4 py-2.5 font-display text-sm hover:border-ember hover:text-ember"
        >
          Fold
        </button>
        {legal.check && (
          <button
            onClick={() => send("CHECK")}
            className="min-w-20 rounded border border-steel px-4 py-2.5 font-display text-sm hover:border-ember hover:text-ember"
          >
            Check
          </button>
        )}
        {legal.call && (
          <button
            onClick={() => send("CALL")}
            className="min-w-24 rounded bg-steel px-4 py-2.5 font-display text-sm hover:bg-ember-deep"
          >
            Call {legal.call.amount.toLocaleString()}
            {legal.call.allIn ? " · all in" : ""}
          </button>
        )}
        {range && (
          <button
            onClick={() => {
              const clamped = Math.min(range.maxTo, Math.max(range.minTo, Math.round(raiseTo)));
              if (clamped === range.maxTo && !window.confirm("All in — are you sure?")) return;
              send(legal.raise ? "RAISE" : "BET", clamped);
            }}
            className="min-w-28 rounded bg-ember-deep px-4 py-2.5 font-display text-sm text-white hover:bg-ember"
          >
            {legal.raise ? "Raise to" : "Bet"} {raiseTo.toLocaleString()}
          </button>
        )}
      </div>
      {range && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            type="range"
            min={range.minTo}
            max={range.maxTo}
            step={25}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="w-40 accent-ember sm:w-56"
            aria-label="Bet size"
          />
          <input
            type="number"
            className="tnum w-24 rounded border border-steel bg-bg-0 px-2 py-1 text-sm"
            value={raiseTo}
            min={range.minTo}
            max={range.maxTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            aria-label="Bet amount"
          />
          {presets.map(([label, value]) => (
            <button
              key={label}
              onClick={() => setRaiseTo(Math.min(range.maxTo, Math.max(range.minTo, value)))}
              className="rounded border border-steel px-2 py-1 text-xs text-muted hover:border-ember hover:text-ember"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function TablePage() {
  usePageMeta("At the table", "Live No-Limit Hold'em at UOS Poker.");
  const { state, chat, error } = useTable();
  const { me } = useMe();
  const [message, setMessage] = useState("");
  const [cheatSheet, setCheatSheet] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [connected, setConnected] = useState(true);
  const navigate = useNavigate();
  const prevActor = useRef<number | null>(null);

  const settings = (me?.profile?.settings ?? {}) as { fourColourDeck?: boolean; sounds?: boolean };
  const fourColour = settings.fourColourDeck ?? false;
  const soundsOn = !muted && (settings.sounds ?? true);

  // Unlock audio on first interaction anywhere on the page.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Connection banner.
  useEffect(() => {
    const socket = getSocket();
    const onDisconnect = () => setConnected(false);
    const onConnect = () => setConnected(true);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
    };
  }, []);

  // Event-driven sounds.
  useEffect(() => {
    if (!soundsOn) return;
    const socket = getSocket();
    const onEvent = (payload: TableEventPayload) => {
      switch (payload.event.kind) {
        case "STREET":
          sounds.cardSlide();
          break;
        case "ACTION":
          if (payload.event.action === "BET" || payload.event.action === "RAISE") {
            sounds.chips(payload.event.committed);
          } else if (payload.event.action === "CALL") {
            sounds.chips(200);
          }
          break;
        case "REVEAL":
          sounds.cardFlip();
          break;
        case "WIN":
          sounds.potWin();
          break;
      }
    };
    socket.on(EV.tableEvent, onEvent);
    return () => {
      socket.off(EV.tableEvent, onEvent);
    };
  }, [soundsOn]);

  // Your-turn chime.
  useEffect(() => {
    if (!state) return;
    if (
      soundsOn &&
      state.mySeat !== null &&
      state.actionSeat === state.mySeat &&
      prevActor.current !== state.mySeat
    ) {
      sounds.yourTurn();
    }
    prevActor.current = state.actionSeat;
  }, [state, soundsOn]);

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

  const mySeat = state.mySeat ?? 0;
  const rotationOf = (seat: number) => (seat - mySeat + 6) % 6;
  const opponents = state.seats.filter(
    (s): s is SeatPayload => s !== null && s.seat !== state.mySeat,
  );
  const meSeat = state.mySeat !== null ? state.seats[state.mySeat] : null;

  const sendChat = () => {
    if (!message.trim()) return;
    getSocket().emit(EV.chat, { tableId: state.tableId, message: message.trim() });
    setMessage("");
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg tracking-wide sm:text-xl">
          {state.name}
          {state.isPractice && (
            <span className="ml-2 text-xs text-muted sm:text-sm">practice · unrated</span>
          )}
        </h1>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="text-muted">{state.spectators} watching</span>
          <button
            onClick={() => setCheatSheet(true)}
            className="rounded border border-steel px-2.5 py-1 text-muted hover:border-ember hover:text-ember"
          >
            Rankings
          </button>
          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
              unlockAudio();
            }}
            aria-pressed={muted}
            className="rounded border border-steel px-2.5 py-1 text-muted hover:border-ember hover:text-ember"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          {state.mySeat !== null ? (
            <button
              onClick={() => {
                getSocket().emit(EV.standUp);
                navigate("/play");
              }}
              className="rounded border border-steel px-2.5 py-1 hover:border-ember hover:text-ember"
            >
              Stand up
            </button>
          ) : (
            <button
              onClick={() => getSocket().emit(EV.sitDown, { tableId: state.tableId, buyIn: 10000 })}
              className="rounded bg-ember-deep px-2.5 py-1 font-display text-white hover:bg-ember"
            >
              Take a seat
            </button>
          )}
        </div>
      </div>

      {!connected && (
        <div className="mt-2 rounded border border-ember bg-ember/10 px-3 py-2 text-sm text-ember">
          Connection lost — reconnecting…
        </div>
      )}
      {error && (
        <div className="mt-2 rounded border border-ember bg-ember/10 px-3 py-2 text-sm text-ember">
          {error.message}
        </div>
      )}
      {state.sittingOut && (
        <div className="mt-2 flex items-center gap-3 rounded border border-line bg-bg-1 px-3 py-2 text-sm">
          <span className="text-muted">You're sitting out — blinds are skipping you.</span>
          <button
            onClick={() => getSocket().emit(EV.imBack)}
            className="rounded bg-ember-deep px-3 py-1 font-display text-xs text-white hover:bg-ember"
          >
            I'm back
          </button>
        </div>
      )}

      {/* ------------------------------------------------ desktop: the oval */}
      <div className="relative mx-auto mt-4 hidden h-[440px] max-w-3xl rounded-[50%] border-4 border-steel bg-felt felt-weave shadow-inner sm:block">
        <div className="pointer-events-none absolute inset-3 rounded-[50%] border border-ember/25" />
        <div className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2">
          <Board state={state} fourColour={fourColour} />
        </div>
        {state.seats.map(
          (seat, i) =>
            seat && (
              <SeatBox
                key={i}
                seat={seat}
                state={state}
                fourColour={fourColour}
                soundsOn={soundsOn}
                style={{
                  left: SEAT_POSITIONS[rotationOf(i)]!.left,
                  top: SEAT_POSITIONS[rotationOf(i)]!.top,
                }}
              />
            ),
        )}
      </div>

      {/* --------------------------------------------- mobile: composed portrait */}
      <div className="mt-3 sm:hidden">
        <div className="flex flex-wrap justify-center gap-2">
          {opponents.map((seat) => (
            <SeatBox
              key={seat.seat}
              seat={seat}
              state={state}
              fourColour={fourColour}
              soundsOn={soundsOn}
              compact
            />
          ))}
        </div>
        <div className="felt-weave mt-3 rounded-xl border-2 border-steel bg-felt px-3 py-6">
          <Board state={state} fourColour={fourColour} />
        </div>
        {meSeat && (
          <div className="mt-3 flex justify-center">
            <SeatBox
              seat={meSeat}
              state={state}
              fourColour={fourColour}
              soundsOn={soundsOn}
              compact
            />
          </div>
        )}
      </div>

      {/* Action dock — sticky and thumb-reachable on mobile */}
      <div className="sticky bottom-2 z-40 mt-4">
        <ActionDock state={state} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <details className="panel-steel rounded-lg p-3" open>
          <summary className="cursor-pointer font-display text-sm uppercase tracking-widest text-muted">
            Hand log
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
            {state.handLog.length === 0 && <li>No hands yet.</li>}
            {[...state.handLog].reverse().map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
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
              className="min-w-0 flex-1 rounded border border-steel bg-bg-0 px-2 py-1 text-sm outline-none focus:border-ember"
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

      {cheatSheet && <CheatSheetOverlay onClose={() => setCheatSheet(false)} />}
    </section>
  );
}
