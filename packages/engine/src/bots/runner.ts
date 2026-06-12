import type { BotTier } from "@uos-poker/shared";
import { PokerHand, type EngineEvent, type Street } from "../hand";
import type { Rng } from "../rng";
import { computeEquity, decideBotAction, type BotPersonality } from "./policy";

/**
 * Pure synchronous bot-vs-bot hand runner. Used by the statistical
 * validation suite and simulations; the server has its own paced runtime.
 */

export interface BotSeat {
  seat: number;
  tier: BotTier;
  personality?: BotPersonality;
  stack: number;
}

export interface BotHandStats {
  events: EngineEvent[];
  netBySeat: Map<number, number>;
  /** Voluntarily put money in preflop (blind posts and BB checks excluded). */
  vpipBySeat: Map<number, boolean>;
  /** Raised preflop. */
  pfrBySeat: Map<number, boolean>;
  /** Postflop bets+raises / calls, for aggression comparisons. */
  aggActsBySeat: Map<number, { aggressive: number; passive: number }>;
}

export function playBotHand(opts: {
  seats: BotSeat[];
  buttonSeat: number;
  blinds: { small: number; big: number };
  rng: Rng;
  rollouts?: number;
}): BotHandStats {
  const { seats, buttonSeat, blinds, rng } = opts;
  const rollouts = opts.rollouts ?? 250;
  const hand = new PokerHand({
    handNo: 1,
    buttonSeat,
    players: seats.map((s) => ({ seat: s.seat, id: `bot-${s.seat}`, stack: s.stack })),
    blinds,
    rng,
  });

  const bySeat = new Map(seats.map((s) => [s.seat, s]));
  const events: EngineEvent[] = [...hand.drainEvents()];
  const vpipBySeat = new Map<number, boolean>(seats.map((s) => [s.seat, false]));
  const pfrBySeat = new Map<number, boolean>(seats.map((s) => [s.seat, false]));
  const aggActsBySeat = new Map(seats.map((s) => [s.seat, { aggressive: 0, passive: 0 }]));

  let raisesThisStreet = 0;
  let lastStreet: Street = "PREFLOP";
  let preflopAggressor: number | null = null;
  const equityCache = new Map<string, number>();

  // Postflop action order → position 0..1 (button = 1).
  const seatNumbers = seats.map((s) => s.seat).sort((a, b) => a - b);
  const order: number[] = [];
  {
    const start = seatNumbers.find((s) => s > buttonSeat) ?? seatNumbers[0]!;
    let s = start;
    for (let i = 0; i < seatNumbers.length; i++) {
      order.push(s);
      const idx = seatNumbers.indexOf(s);
      s = seatNumbers[(idx + 1) % seatNumbers.length]!;
    }
  }
  const positionOf = (seat: number) =>
    seatNumbers.length === 1 ? 1 : order.indexOf(seat) / (seatNumbers.length - 1);

  let guard = 0;
  while (!hand.isComplete) {
    if (++guard > 300) throw new Error("bot hand did not terminate");
    if (hand.currentStreet !== lastStreet) {
      lastStreet = hand.currentStreet;
      raisesThisStreet = 0;
    }
    const seat = hand.currentActionSeat;
    const config = bySeat.get(seat)!;
    const legal = hand.legalActions(seat);
    const publicState = hand.playerPublicState();
    const me = publicState.find((p) => p.seat === seat)!;
    const live = publicState.filter((p) => !p.folded);

    const street = hand.currentStreet;
    const equityKey = `${seat}:${street}:${live.length}`;
    const ctx = {
      legal,
      holeCards: hand.holeCardsOf(seat)!,
      board: hand.communityCards,
      street,
      potSize: hand.totalPotSize,
      liveOpponents: live.length - 1,
      position: positionOf(seat),
      wasPreflopAggressor: preflopAggressor === seat,
      raisesThisStreet,
      bigBlind: blinds.big,
      stack: me.stack,
      committedStreet: me.committedStreet,
      currentBet: hand.streetCurrentBet,
      rng,
      rollouts,
      equity: undefined as number | undefined,
    };
    if (street !== "PREFLOP") {
      let equity = equityCache.get(equityKey);
      if (equity === undefined) {
        equity = computeEquity(ctx);
        equityCache.set(equityKey, equity);
      }
      ctx.equity = equity;
    }

    const action = decideBotAction(config.tier, config.personality ?? "STANDARD", ctx);
    const newEvents = hand.act(seat, action);
    events.push(...newEvents);

    // Bookkeeping.
    if (street === "PREFLOP") {
      if (action.type === "CALL" || action.type === "RAISE" || action.type === "BET") {
        vpipBySeat.set(seat, true);
      }
      if (action.type === "RAISE" || action.type === "BET") {
        pfrBySeat.set(seat, true);
        preflopAggressor = seat;
        raisesThisStreet++;
      }
    } else {
      const agg = aggActsBySeat.get(seat)!;
      if (action.type === "BET" || action.type === "RAISE") {
        agg.aggressive++;
        raisesThisStreet++;
      } else if (action.type === "CALL") {
        agg.passive++;
      }
    }
  }

  const end = events.find((e) => e.type === "HAND_END");
  if (!end || end.type !== "HAND_END") throw new Error("missing HAND_END");
  const netBySeat = new Map(end.net.map((n) => [n.seat, n.net]));

  return { events, netBySeat, vpipBySeat, pfrBySeat, aggActsBySeat };
}
