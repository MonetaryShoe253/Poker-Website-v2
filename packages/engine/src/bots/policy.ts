import type { BotTier } from "@uos-poker/shared";
import type { CardInt } from "../cards";
import type { HandAction, LegalActions, Street } from "../hand";
import type { Rng } from "../rng";
import { detectDraws, monteCarloEquity } from "./equity";
import { preflopPercentile } from "./preflop";

/**
 * Rule-based, equity-driven bot policies. Pure and synchronous: decisions
 * compute in well under 50ms; the server adds the humanised 1–4s delay.
 * Randomised throughout so lines are never deterministic.
 */

export type BotPersonality = "STANDARD" | "ROCK" | "MANIAC" | "STATION";

interface TierParams {
  vpip: number;
  pfr: number;
  threeBet: number;
  /** Multiplier on VPIP when facing a raise (lower = tighter). */
  vsRaiseTighten: number;
  cbet: number;
  /** River bluff frequency when checked to. */
  bluff: number;
  /** Multiplier on required pot-odds equity to call (lower = looser). */
  requiredEquityMult: number;
  /** General postflop aggression multiplier. */
  aggression: number;
  /** 0..1 — how much position widens/narrows ranges. */
  positional: number;
  sizeMin: number;
  sizeMax: number;
  /** Fish rule: calls any pair or draw regardless of price. */
  callAnyPairOrDraw: boolean;
}

/**
 * NB: vpip/pfr here are *raw policy inputs*, calibrated so the *measured*
 * table stats land on the BOT_TIERS targets (BB free checks and raised-pot
 * tightening dilute raw frequencies). Recalibrate with
 * scripts/calibrate-bots.ts after any policy change.
 */
export const TIER_PARAMS: Record<BotTier, TierParams> = {
  FISH: {
    vpip: 0.62,
    pfr: 0.055,
    threeBet: 0.01,
    vsRaiseTighten: 0.9,
    cbet: 0.35,
    bluff: 0.02,
    requiredEquityMult: 0.45,
    aggression: 0.35,
    positional: 0,
    sizeMin: 0.4,
    sizeMax: 0.9,
    callAnyPairOrDraw: true,
  },
  CASUAL: {
    vpip: 0.41,
    pfr: 0.15,
    threeBet: 0.03,
    vsRaiseTighten: 0.65,
    cbet: 0.5,
    bluff: 0.08,
    requiredEquityMult: 0.85,
    aggression: 0.7,
    positional: 0.3,
    sizeMin: 0.5,
    sizeMax: 0.75,
    callAnyPairOrDraw: false,
  },
  SOLID: {
    vpip: 0.3,
    pfr: 0.285,
    threeBet: 0.05,
    vsRaiseTighten: 0.5,
    cbet: 0.6,
    bluff: 0.12,
    requiredEquityMult: 1.0,
    aggression: 1.0,
    positional: 0.7,
    sizeMin: 0.5,
    sizeMax: 0.85,
    callAnyPairOrDraw: false,
  },
  SHARK: {
    vpip: 0.28,
    pfr: 0.295,
    threeBet: 0.07,
    vsRaiseTighten: 0.5,
    cbet: 0.65,
    bluff: 0.2,
    requiredEquityMult: 1.05,
    aggression: 1.15,
    positional: 0.8,
    sizeMin: 0.33,
    sizeMax: 1.25,
    callAnyPairOrDraw: false,
  },
};

interface PersonalityParams {
  vpipMult: number;
  pfrMult: number;
  aggrMult: number;
  bluffMult: number;
  callMult: number;
}

export const PERSONALITY_PARAMS: Record<BotPersonality, PersonalityParams> = {
  STANDARD: { vpipMult: 1, pfrMult: 1, aggrMult: 1, bluffMult: 1, callMult: 1 },
  ROCK: { vpipMult: 0.72, pfrMult: 0.85, aggrMult: 0.8, bluffMult: 0.5, callMult: 0.85 },
  MANIAC: { vpipMult: 1.3, pfrMult: 1.6, aggrMult: 1.5, bluffMult: 2.2, callMult: 1.1 },
  STATION: { vpipMult: 1.25, pfrMult: 0.6, aggrMult: 0.55, bluffMult: 0.6, callMult: 1.45 },
};

export interface BotDecisionContext {
  legal: LegalActions;
  holeCards: readonly CardInt[];
  board: readonly CardInt[];
  street: Street;
  /** Total chips in the pot including this street's commitments. */
  potSize: number;
  liveOpponents: number;
  /** 0 = first to act postflop … 1 = button. */
  position: number;
  wasPreflopAggressor: boolean;
  /** Raises this street (preflop: beyond the blind). */
  raisesThisStreet: number;
  bigBlind: number;
  stack: number;
  committedStreet: number;
  currentBet: number;
  rng: Rng;
  /** Precomputed equity for this street (callers should cache per street). */
  equity?: number;
  rollouts?: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Uniform float in [0,1). */
const roll = (rng: Rng): number => rng.nextInt(1 << 30) / (1 << 30);

function roundChips(amount: number, lo: number, hi: number): number {
  const rounded = Math.round(amount / 25) * 25;
  return clamp(rounded, lo, hi);
}

export function computeEquity(ctx: BotDecisionContext): number {
  if (ctx.equity !== undefined) return ctx.equity;
  return monteCarloEquity({
    hole: ctx.holeCards,
    board: ctx.board,
    opponents: Math.max(1, ctx.liveOpponents),
    rollouts: ctx.rollouts ?? 250,
    rng: ctx.rng,
  });
}

export function decideBotAction(
  tier: BotTier,
  personality: BotPersonality,
  ctx: BotDecisionContext,
): HandAction {
  const action =
    ctx.street === "PREFLOP"
      ? decidePreflop(TIER_PARAMS[tier], PERSONALITY_PARAMS[personality], ctx)
      : decidePostflop(TIER_PARAMS[tier], PERSONALITY_PARAMS[personality], ctx);
  return sanitise(action, ctx.legal);
}

/** Last line of defence: any decision must be exactly legal. */
function sanitise(action: HandAction, legal: LegalActions): HandAction {
  switch (action.type) {
    case "BET":
      if (legal.bet && action.amount !== undefined) {
        return { type: "BET", amount: clamp(action.amount, legal.bet.minTo, legal.bet.maxTo) };
      }
      break;
    case "RAISE":
      if (legal.raise && action.amount !== undefined) {
        return {
          type: "RAISE",
          amount: clamp(action.amount, legal.raise.minTo, legal.raise.maxTo),
        };
      }
      break;
    case "CALL":
      if (legal.call) return action;
      break;
    case "CHECK":
      if (legal.check) return action;
      break;
    case "FOLD":
      return action;
  }
  // Fallback chain: the cheapest way to continue.
  if (legal.check) return { type: "CHECK" };
  if (legal.call) return { type: "CALL" };
  return { type: "FOLD" };
}

function decidePreflop(
  tier: TierParams,
  persona: PersonalityParams,
  ctx: BotDecisionContext,
): HandAction {
  const { legal, rng, bigBlind } = ctx;
  const pct = preflopPercentile(ctx.holeCards) * (0.96 + roll(rng) * 0.08);
  const posMult = 1 + tier.positional * (ctx.position - 0.5);
  const vpipEff = clamp(tier.vpip * persona.vpipMult * posMult, 0.02, 0.98);
  const pfrEff = clamp(tier.pfr * persona.pfrMult * posMult, 0.005, 0.95);

  const openRaiseTo = () =>
    roundChips(
      bigBlind * (2.5 + roll(rng) * 1.0) + Math.max(0, ctx.potSize - bigBlind * 1.5) * 0.5,
      legal.raise?.minTo ?? bigBlind * 2,
      legal.raise?.maxTo ?? Number.MAX_SAFE_INTEGER,
    );

  if (ctx.raisesThisStreet === 0) {
    // Unraised pot (limps and blinds only).
    if (legal.raise && pct > 1 - pfrEff) {
      return { type: "RAISE", amount: openRaiseTo() };
    }
    if (legal.check) return { type: "CHECK" }; // BB option, no charge
    if (legal.call && pct > 1 - vpipEff) return { type: "CALL" };
    return { type: "FOLD" };
  }

  if (ctx.raisesThisStreet === 1) {
    const threeBetEff = clamp(tier.threeBet * persona.aggrMult * posMult, 0.002, 0.5);
    if (legal.raise && pct > 1 - threeBetEff) {
      const to = roundChips(
        ctx.currentBet * (2.8 + roll(rng) * 0.8),
        legal.raise.minTo,
        legal.raise.maxTo,
      );
      return { type: "RAISE", amount: to };
    }
    if (legal.call && pct > 1 - vpipEff * tier.vsRaiseTighten) return { type: "CALL" };
    if (legal.check) return { type: "CHECK" };
    return { type: "FOLD" };
  }

  // Facing a 3-bet or more: premium hands only.
  if (legal.raise && pct > 0.99) {
    return {
      type: "RAISE",
      amount: roundChips(ctx.currentBet * 2.6, legal.raise.minTo, legal.raise.maxTo),
    };
  }
  if (legal.call && pct > 1 - vpipEff * 0.25) return { type: "CALL" };
  if (legal.check) return { type: "CHECK" };
  return { type: "FOLD" };
}

function decidePostflop(
  tier: TierParams,
  persona: PersonalityParams,
  ctx: BotDecisionContext,
): HandAction {
  const { legal, rng } = ctx;
  const equity = computeEquity(ctx);
  const baseline = 1 / (Math.max(1, ctx.liveOpponents) + 1);
  const aggr = tier.aggression * persona.aggrMult;
  const draws = ctx.street === "RIVER" ? null : detectDraws(ctx.holeCards, ctx.board);
  const pairOrDraw =
    ctx.street !== "RIVER"
      ? (draws?.pairOrBetter ?? false) || (draws?.flushDraw ?? false) || (draws?.openEnded ?? false) || (draws?.gutshot ?? false)
      : detectDraws(ctx.holeCards, ctx.board).pairOrBetter;

  const betSize = (lo: number, hi: number) => {
    const frac = tier.sizeMin + roll(rng) * (tier.sizeMax - tier.sizeMin);
    return roundChips(ctx.potSize * frac, lo, hi);
  };

  if (legal.call) {
    // Facing a bet.
    const toCall = legal.call.amount;
    const potOdds = toCall / (ctx.potSize + toCall);
    const required = potOdds * (tier.requiredEquityMult / persona.callMult);

    // Value raise with a strong hand.
    if (legal.raise && equity > baseline + 0.27 && roll(rng) < 0.45 * aggr) {
      const to = roundChips(
        ctx.currentBet + (ctx.potSize + toCall) * (tier.sizeMin + roll(rng) * (tier.sizeMax - tier.sizeMin)),
        legal.raise.minTo,
        legal.raise.maxTo,
      );
      return { type: "RAISE", amount: to };
    }
    // Semi-bluff raise with strong draws.
    if (
      legal.raise &&
      ctx.street !== "RIVER" &&
      draws?.strongDraw &&
      roll(rng) < 0.12 * aggr
    ) {
      return {
        type: "RAISE",
        amount: roundChips(ctx.currentBet * 2.7, legal.raise.minTo, legal.raise.maxTo),
      };
    }
    // The fish rule: any pair or draw calls regardless of price.
    if (tier.callAnyPairOrDraw && pairOrDraw) return { type: "CALL" };
    if (equity >= required * (0.92 + roll(rng) * 0.16)) return { type: "CALL" };
    // Rare bluff-raise on a missed river (sharks mostly).
    if (
      legal.raise &&
      ctx.street === "RIVER" &&
      equity < 0.25 &&
      roll(rng) < 0.18 * tier.bluff * persona.bluffMult
    ) {
      return {
        type: "RAISE",
        amount: roundChips(ctx.currentBet * 3, legal.raise.minTo, legal.raise.maxTo),
      };
    }
    return { type: "FOLD" };
  }

  // Checked to us (or first to act).
  if (legal.bet) {
    // Continuation bet.
    if (
      ctx.wasPreflopAggressor &&
      ctx.street === "FLOP" &&
      roll(rng) < tier.cbet * persona.aggrMult
    ) {
      return { type: "BET", amount: betSize(legal.bet.minTo, legal.bet.maxTo) };
    }
    // Value bet.
    if (equity > baseline + 0.13 && roll(rng) < 0.75 * aggr) {
      return { type: "BET", amount: betSize(legal.bet.minTo, legal.bet.maxTo) };
    }
    // Semi-bluff strong draws.
    if (ctx.street !== "RIVER" && draws?.strongDraw && roll(rng) < 0.45 * aggr) {
      return { type: "BET", amount: betSize(legal.bet.minTo, legal.bet.maxTo) };
    }
    // River bluff when checked to with a busted hand.
    if (
      ctx.street === "RIVER" &&
      equity < 0.3 &&
      roll(rng) < tier.bluff * persona.bluffMult
    ) {
      return { type: "BET", amount: betSize(legal.bet.minTo, legal.bet.maxTo) };
    }
  }
  return { type: "CHECK" };
}
