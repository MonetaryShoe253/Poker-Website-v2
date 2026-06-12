import { cardToString, freshDeck, type CardInt } from "./cards";
import { describeHand, evaluate, type HandValue } from "./evaluator";
import { computePots, type Pot } from "./pots";
import { shuffleInPlace, type Rng } from "./rng";

/**
 * One hand of No-Limit Texas Hold'em, 2–6 players.
 *
 * Pure and synchronous: no timers, no I/O. The server orchestrates time and
 * relays events (sanitised per recipient — HOLE_CARDS only ever to its owner).
 * Deterministic given an injected RNG or deck.
 *
 * Rules implemented per spec:
 * - Forward-moving button; heads-up button posts SB, acts first preflop,
 *   last postflop (falls out of standard blind/first-actor rules).
 * - Min-raise: opening bet ≥ 1 BB; a raise ≥ largest prior full bet/raise
 *   increment this street. A short all-in does NOT reopen action for players
 *   who already acted since the last full raise — they may only call or fold.
 * - Side pots layered by all-in amounts, each tracking eligible players.
 * - Uncalled excess refunds to the bettor at the end of each betting round.
 * - Showdown order: river aggressor first, else first active seat left of
 *   the button; losing hands auto-muck (per-player showLosing overrides).
 * - Fold-to-win reveals no cards, ever.
 * - All-in runout reveals contestants' cards, then deals out the board.
 * - Split pots divide evenly; odd chips go to the first winner clockwise
 *   from the button, per pot.
 * - Chip conservation asserted at every transition.
 */

export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
export type HandPhase = "BETTING" | "RUNOUT" | "COMPLETE";

export type ActionType = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE";

export interface HandAction {
  type: ActionType;
  /** For BET/RAISE: the total committed this street after the action ("to"). */
  amount?: number;
}

export interface LegalActions {
  seat: number;
  fold: boolean;
  check: boolean;
  /** Chips to add to call (clamped to stack). Absent if nothing to call. */
  call?: { amount: number; allIn: boolean };
  /** Opening bet "to" range. Absent if there's already a bet this street. */
  bet?: { minTo: number; maxTo: number };
  /** Raise "to" range. Absent if raising is illegal (incl. short all-in rule). */
  raise?: { minTo: number; maxTo: number };
}

export interface HandPlayerInit {
  seat: number;
  id: string;
  stack: number;
  /** Show losing hands at showdown instead of mucking (user setting). */
  showLosing?: boolean;
}

export interface HandConfig {
  handNo: number;
  buttonSeat: number;
  players: HandPlayerInit[];
  blinds: { small: number; big: number };
  rng?: Rng;
  /** Injectable pre-ordered deck for tests; dealt from index 0. */
  deck?: CardInt[];
}

export interface PlayerPublicState {
  seat: number;
  id: string;
  stack: number;
  committedStreet: number;
  folded: boolean;
  allIn: boolean;
}

export type EngineEvent =
  | {
      type: "HAND_START";
      handNo: number;
      buttonSeat: number;
      smallBlindSeat: number;
      bigBlindSeat: number;
      players: Array<{ seat: number; id: string; stack: number }>;
    }
  | { type: "BLIND_POSTED"; seat: number; kind: "SB" | "BB"; amount: number; allIn: boolean }
  | { type: "HOLE_CARDS"; seat: number; cards: [CardInt, CardInt] }
  | { type: "STREET"; street: Exclude<Street, "PREFLOP">; cards: CardInt[]; board: CardInt[] }
  | { type: "ACTION_ON"; seat: number; legal: LegalActions }
  | {
      type: "ACTION";
      seat: number;
      action: ActionType;
      /** Total committed this street after the action. */
      committed: number;
      allIn: boolean;
    }
  | { type: "UNCALLED_RETURNED"; seat: number; amount: number }
  | { type: "POTS"; pots: Pot[]; totalPot: number }
  | { type: "RUNOUT_REVEAL"; reveals: Array<{ seat: number; cards: [CardInt, CardInt] }> }
  | {
      type: "SHOWDOWN_SHOW";
      seat: number;
      cards: [CardInt, CardInt];
      handName: string;
      bestFive: CardInt[];
    }
  | { type: "SHOWDOWN_MUCK"; seat: number }
  | {
      type: "PAYOUT";
      payouts: Array<{ seat: number; amount: number; potIndex: number; handName?: string }>;
    }
  | {
      type: "HAND_END";
      net: Array<{ seat: number; id: string; net: number; stack: number }>;
    };

export class IllegalActionError extends Error {
  constructor(
    public readonly code:
      | "NOT_YOUR_TURN"
      | "HAND_COMPLETE"
      | "BAD_ACTION"
      | "BAD_AMOUNT"
      | "CANNOT_CHECK"
      | "CANNOT_RAISE",
    message: string,
  ) {
    super(message);
    this.name = "IllegalActionError";
  }
}

interface PlayerState {
  seat: number;
  id: string;
  startingStack: number;
  stack: number;
  holeCards: [CardInt, CardInt];
  folded: boolean;
  allIn: boolean;
  committedStreet: number;
  committedTotal: number;
  showLosing: boolean;
}

const STREET_ORDER: Street[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];

export class PokerHand {
  readonly handNo: number;
  readonly buttonSeat: number;
  readonly blinds: { small: number; big: number };
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;

  private players = new Map<number, PlayerState>();
  private seatOrder: number[]; // ascending seat numbers
  private deck: CardInt[];
  private deckIndex = 0;
  private board: CardInt[] = [];

  private phase: HandPhase = "BETTING";
  private street: Street = "PREFLOP";
  private currentBet = 0;
  private minRaiseIncrement: number;
  private actionSeat = -1;
  private toAct = new Set<number>();
  private actedSinceFullRaise = new Set<number>();
  /** Last aggressor on the river (for showdown order). */
  private riverAggressor: number | null = null;
  private pots: Pot[] = [];
  private events: EngineEvent[] = [];
  private readonly totalChips: number;

  constructor(config: HandConfig) {
    const { players, buttonSeat, blinds, handNo } = config;
    if (players.length < 2 || players.length > 6) {
      throw new Error(`PokerHand: need 2-6 players, got ${players.length}`);
    }
    const seats = players.map((p) => p.seat);
    if (new Set(seats).size !== seats.length) throw new Error("PokerHand: duplicate seats");
    if (!seats.includes(buttonSeat)) throw new Error("PokerHand: button not seated");
    for (const p of players) {
      if (!Number.isInteger(p.stack) || p.stack <= 0) {
        throw new Error(`PokerHand: seat ${p.seat} has invalid stack ${p.stack}`);
      }
    }

    this.handNo = handNo;
    this.buttonSeat = buttonSeat;
    this.blinds = blinds;
    this.minRaiseIncrement = blinds.big;
    this.seatOrder = [...seats].sort((a, b) => a - b);
    this.totalChips = players.reduce((sum, p) => sum + p.stack, 0);

    this.deck = config.deck ? [...config.deck] : shuffleInPlace(freshDeck(), config.rng ?? requireRng());
    if (new Set(this.deck).size !== 52 || this.deck.length !== 52) {
      throw new Error("PokerHand: deck must be a full 52-card permutation");
    }

    // Blind seats. Heads-up: button is SB.
    const headsUp = players.length === 2;
    this.smallBlindSeat = headsUp ? buttonSeat : this.nextSeatFrom(buttonSeat);
    this.bigBlindSeat = this.nextSeatFrom(this.smallBlindSeat);

    for (const p of players) {
      this.players.set(p.seat, {
        seat: p.seat,
        id: p.id,
        startingStack: p.stack,
        stack: p.stack,
        holeCards: [-1, -1],
        folded: false,
        allIn: false,
        committedStreet: 0,
        committedTotal: 0,
        showLosing: p.showLosing ?? false,
      });
    }

    this.emit({
      type: "HAND_START",
      handNo,
      buttonSeat,
      smallBlindSeat: this.smallBlindSeat,
      bigBlindSeat: this.bigBlindSeat,
      players: players.map((p) => ({ seat: p.seat, id: p.id, stack: p.stack })),
    });

    this.postBlind(this.smallBlindSeat, "SB", blinds.small);
    this.postBlind(this.bigBlindSeat, "BB", blinds.big);
    this.currentBet = blinds.big;

    // Deal one card at a time, twice around, starting left of the button.
    const dealOrder: number[] = [];
    let s = this.nextSeatFrom(buttonSeat);
    for (let i = 0; i < this.players.size; i++) {
      dealOrder.push(s);
      s = this.nextSeatFrom(s);
    }
    const firstCard = new Map<number, CardInt>();
    for (const seat of dealOrder) firstCard.set(seat, this.draw());
    for (const seat of dealOrder) {
      const player = this.players.get(seat)!;
      player.holeCards = [firstCard.get(seat)!, this.draw()];
      this.emit({ type: "HOLE_CARDS", seat, cards: player.holeCards });
    }

    // Open the preflop betting round.
    this.toAct = new Set(this.actorsAbleToAct());
    if (this.bettingPossible()) {
      this.actionSeat = this.firstToAct("PREFLOP");
      this.emitActionOn();
    } else {
      // Blinds put someone all-in and nobody can act — straight to runout.
      this.finishBettingRound();
    }
    this.assertConservation();
  }

  // --- Public API -----------------------------------------------------------

  /** Drain and return events emitted since the last call. */
  drainEvents(): EngineEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get currentPhase(): HandPhase {
    return this.phase;
  }

  get currentStreet(): Street {
    return this.street;
  }

  get currentActionSeat(): number {
    return this.phase === "BETTING" ? this.actionSeat : -1;
  }

  get communityCards(): CardInt[] {
    return [...this.board];
  }

  get currentPots(): Pot[] {
    return this.computeLivePots();
  }

  /** All chips committed to the hand so far (pots + this street's bets). */
  get totalPotSize(): number {
    let sum = 0;
    for (const p of this.players.values()) sum += p.committedTotal;
    return sum;
  }

  /** Highest commitment this street (the price to play). */
  get streetCurrentBet(): number {
    return this.currentBet;
  }

  get isComplete(): boolean {
    return this.phase === "COMPLETE";
  }

  playerPublicState(): PlayerPublicState[] {
    return this.seatOrder.map((seat) => {
      const p = this.players.get(seat)!;
      return {
        seat: p.seat,
        id: p.id,
        stack: p.stack,
        committedStreet: p.committedStreet,
        folded: p.folded,
        allIn: p.allIn,
      };
    });
  }

  holeCardsOf(seat: number): [CardInt, CardInt] | null {
    const p = this.players.get(seat);
    return p ? [...p.holeCards] : null;
  }

  /** Exact legal action set for the seat currently to act. */
  legalActions(seat: number): LegalActions {
    if (this.phase !== "BETTING" || seat !== this.actionSeat) {
      throw new IllegalActionError("NOT_YOUR_TURN", `Seat ${seat} is not up`);
    }
    const p = this.players.get(seat)!;
    const owed = this.currentBet - p.committedStreet;
    const legal: LegalActions = {
      seat,
      fold: true,
      check: owed === 0,
    };

    if (owed > 0) {
      legal.call = { amount: Math.min(owed, p.stack), allIn: p.stack <= owed };
    }

    const maxTo = p.committedStreet + p.stack; // all-in "to"
    if (this.currentBet === 0) {
      if (p.stack > 0) {
        legal.bet = { minTo: Math.min(this.blinds.big, maxTo), maxTo };
      }
    } else if (!this.actedSinceFullRaise.has(seat)) {
      const fullMinTo = this.currentBet + this.minRaiseIncrement;
      if (maxTo > this.currentBet) {
        // A raise is possible: full if stack covers it, else all-in short raise.
        legal.raise = { minTo: Math.min(fullMinTo, maxTo), maxTo };
      }
    }
    return legal;
  }

  /** Apply an action for `seat`. Throws IllegalActionError on anything illegal. */
  act(seat: number, action: HandAction): EngineEvent[] {
    if (this.phase === "COMPLETE") {
      throw new IllegalActionError("HAND_COMPLETE", "Hand is over");
    }
    const legal = this.legalActions(seat); // throws NOT_YOUR_TURN
    const p = this.players.get(seat)!;

    switch (action.type) {
      case "FOLD": {
        p.folded = true;
        this.toAct.delete(seat);
        this.emit({
          type: "ACTION",
          seat,
          action: "FOLD",
          committed: p.committedStreet,
          allIn: false,
        });
        break;
      }
      case "CHECK": {
        if (!legal.check) {
          throw new IllegalActionError("CANNOT_CHECK", "There is a bet to call");
        }
        this.toAct.delete(seat);
        this.actedSinceFullRaise.add(seat);
        this.emit({
          type: "ACTION",
          seat,
          action: "CHECK",
          committed: p.committedStreet,
          allIn: false,
        });
        break;
      }
      case "CALL": {
        if (!legal.call) {
          throw new IllegalActionError("BAD_ACTION", "Nothing to call — check instead");
        }
        this.commitChips(p, legal.call.amount);
        this.toAct.delete(seat);
        this.actedSinceFullRaise.add(seat);
        this.emit({
          type: "ACTION",
          seat,
          action: "CALL",
          committed: p.committedStreet,
          allIn: p.allIn,
        });
        break;
      }
      case "BET":
      case "RAISE": {
        const isBet = this.currentBet === 0;
        if (isBet !== (action.type === "BET")) {
          throw new IllegalActionError(
            "BAD_ACTION",
            isBet ? "No bet to raise — bet instead" : "There is a bet — raise instead",
          );
        }
        const range = isBet ? legal.bet : legal.raise;
        if (!range) {
          throw new IllegalActionError("CANNOT_RAISE", "Raising is not available to you");
        }
        const to = action.amount;
        if (to === undefined || !Number.isInteger(to)) {
          throw new IllegalActionError("BAD_AMOUNT", "Bet/raise needs an integer amount");
        }
        const allInTo = p.committedStreet + p.stack;
        // The only legal amount below the full minimum is exactly all-in.
        if (to !== allInTo && (to < range.minTo || to > range.maxTo)) {
          throw new IllegalActionError(
            "BAD_AMOUNT",
            `Amount must be ${range.minTo}–${range.maxTo} (or all-in ${allInTo})`,
          );
        }
        if (to === allInTo && to <= this.currentBet) {
          throw new IllegalActionError("BAD_AMOUNT", "All-in below the bet is a call");
        }
        const increment = to - this.currentBet;
        const fullRaise = increment >= this.minRaiseIncrement;
        this.commitChips(p, to - p.committedStreet);
        this.currentBet = to;

        if (fullRaise) {
          this.minRaiseIncrement = increment;
          this.actedSinceFullRaise = new Set([seat]);
        } else {
          // Short all-in: does not reopen action for players who already acted.
          this.actedSinceFullRaise.add(seat);
        }
        // Everyone else still able to act must respond to the new price.
        this.toAct = new Set(this.actorsAbleToAct().filter((s) => s !== seat));
        if (this.street === "RIVER") this.riverAggressor = seat;
        this.emit({
          type: "ACTION",
          seat,
          action: action.type,
          committed: p.committedStreet,
          allIn: p.allIn,
        });
        break;
      }
      default:
        throw new IllegalActionError("BAD_ACTION", `Unknown action`);
    }

    this.afterAction();
    this.assertConservation();
    return this.drainEvents();
  }

  // --- Internals -------------------------------------------------------------

  private emit(event: EngineEvent): void {
    this.events.push(event);
  }

  private requirePlayer(seat: number): PlayerState {
    const p = this.players.get(seat);
    if (!p) throw new Error(`No player at seat ${seat}`);
    return p;
  }

  private draw(): CardInt {
    const c = this.deck[this.deckIndex++];
    if (c === undefined) throw new Error("Deck exhausted");
    return c;
  }

  private nextSeatFrom(seat: number): number {
    const idx = this.seatOrder.indexOf(seat);
    if (idx === -1) {
      // Seat not in order (possible for button helper) — find next higher.
      const next = this.seatOrder.find((s) => s > seat);
      return next ?? this.seatOrder[0]!;
    }
    return this.seatOrder[(idx + 1) % this.seatOrder.length]!;
  }

  /** Non-folded players. */
  private livePlayers(): PlayerState[] {
    return this.seatOrder.map((s) => this.players.get(s)!).filter((p) => !p.folded);
  }

  /** Seats that can still take actions (live, not all-in). */
  private actorsAbleToAct(): number[] {
    return this.livePlayers()
      .filter((p) => !p.allIn)
      .map((p) => p.seat);
  }

  /** Betting requires ≥2 live players and ≥1 actor facing a decision. */
  private bettingPossible(): boolean {
    if (this.livePlayers().length < 2) return false;
    const actors = this.actorsAbleToAct();
    if (actors.length === 0) return false;
    if (actors.length === 1) {
      // A lone actor only acts if they owe chips (e.g. facing an all-in).
      const p = this.players.get(actors[0]!)!;
      return this.currentBet > p.committedStreet;
    }
    return true;
  }

  private firstToAct(street: Street): number {
    const start =
      street === "PREFLOP" ? this.nextSeatFrom(this.bigBlindSeat) : this.nextSeatFrom(this.buttonSeat);
    let s = start;
    for (let i = 0; i < this.seatOrder.length; i++) {
      if (this.toAct.has(s)) return s;
      s = this.nextSeatFrom(s);
    }
    throw new Error("firstToAct: nobody to act");
  }

  private advanceActionSeat(): void {
    let s = this.nextSeatFrom(this.actionSeat);
    for (let i = 0; i < this.seatOrder.length; i++) {
      if (this.toAct.has(s)) {
        this.actionSeat = s;
        return;
      }
      s = this.nextSeatFrom(s);
    }
    throw new Error("advanceActionSeat: nobody to act");
  }

  private emitActionOn(): void {
    this.emit({ type: "ACTION_ON", seat: this.actionSeat, legal: this.legalActions(this.actionSeat) });
  }

  private postBlind(seat: number, kind: "SB" | "BB", amount: number): void {
    const p = this.requirePlayer(seat);
    this.commitChips(p, Math.min(amount, p.stack));
    this.emit({ type: "BLIND_POSTED", seat, kind, amount: p.committedStreet, allIn: p.allIn });
  }

  private commitChips(p: PlayerState, amount: number): void {
    if (amount < 0 || amount > p.stack) {
      throw new Error(`commitChips: invalid amount ${amount} for stack ${p.stack}`);
    }
    p.stack -= amount;
    p.committedStreet += amount;
    p.committedTotal += amount;
    if (p.stack === 0) p.allIn = true;
  }

  private afterAction(): void {
    if (this.livePlayers().length === 1) {
      this.finishByFold();
      return;
    }
    // The round also ends when no meaningful action remains: a lone player
    // with chips owing nothing has no live opponent who could respond to a
    // bet, so they never get a (pointless) turn.
    if (this.toAct.size === 0 || !this.bettingPossible()) {
      this.finishBettingRound();
      return;
    }
    this.advanceActionSeat();
    this.emitActionOn();
  }

  /** End-of-round housekeeping: refund uncalled excess, build pots, move on. */
  private finishBettingRound(): void {
    this.refundUncalled();
    this.pots = this.computeLivePots();
    this.emit({
      type: "POTS",
      pots: this.pots,
      totalPot: this.pots.reduce((sum, pot) => sum + pot.amount, 0),
    });

    if (this.street === "RIVER") {
      this.showdown();
      return;
    }

    // Reset street state.
    for (const p of this.players.values()) p.committedStreet = 0;
    this.currentBet = 0;
    this.minRaiseIncrement = this.blinds.big;
    this.actedSinceFullRaise = new Set();

    const actors = this.actorsAbleToAct();
    if (this.livePlayers().length >= 2 && actors.length <= 1) {
      // No more betting possible — reveal and run the board out.
      this.runOut();
      return;
    }

    this.dealNextStreet();
    this.toAct = new Set(actors);
    this.actionSeat = this.firstToAct(this.street);
    this.emitActionOn();
  }

  private dealNextStreet(): void {
    const idx = STREET_ORDER.indexOf(this.street);
    const next = STREET_ORDER[idx + 1];
    if (!next || next === "PREFLOP") throw new Error("dealNextStreet: no next street");
    this.street = next;
    const count = next === "FLOP" ? 3 : 1;
    const cards: CardInt[] = [];
    for (let i = 0; i < count; i++) cards.push(this.draw());
    this.board.push(...cards);
    this.emit({ type: "STREET", street: next, cards, board: [...this.board] });
  }

  private runOut(): void {
    this.phase = "RUNOUT";
    this.emit({
      type: "RUNOUT_REVEAL",
      reveals: this.livePlayers().map((p) => ({ seat: p.seat, cards: p.holeCards })),
    });
    while (this.street !== "RIVER") {
      this.dealNextStreet();
    }
    this.showdown({ alreadyRevealed: true });
  }

  /** Return any uncalled excess of the street's highest bet to its owner. */
  private refundUncalled(): void {
    const byCommitted = [...this.players.values()].sort(
      (a, b) => b.committedStreet - a.committedStreet,
    );
    const top = byCommitted[0]!;
    const second = byCommitted[1]?.committedStreet ?? 0;
    const excess = top.committedStreet - second;
    if (excess > 0) {
      top.stack += excess;
      top.committedStreet -= excess;
      top.committedTotal -= excess;
      if (top.stack > 0) top.allIn = false;
      this.emit({ type: "UNCALLED_RETURNED", seat: top.seat, amount: excess });
    }
  }

  private computeLivePots(): Pot[] {
    return computePots(
      [...this.players.values()].map((p) => ({
        seat: p.seat,
        committed: p.committedTotal,
        folded: p.folded,
      })),
    );
  }

  private finishByFold(): void {
    this.refundUncalled();
    const winner = this.livePlayers()[0]!;
    // The last player with live cards takes everything on the table — including
    // dead side-pot money above their own all-in level (possible when every
    // side-pot contester open-folds). Pot eligibility only matters at showdown.
    let total = 0;
    for (const p of this.players.values()) total += p.committedTotal;
    winner.stack += total;
    // No cards are ever revealed on a fold-win.
    this.emit({
      type: "PAYOUT",
      payouts: [{ seat: winner.seat, amount: total, potIndex: 0 }],
    });
    this.completeHand();
  }

  private showdown(opts: { alreadyRevealed?: boolean } = {}): void {
    const live = this.livePlayers();
    const values = new Map<number, HandValue>();
    for (const p of live) {
      values.set(p.seat, evaluate([...p.holeCards, ...this.board]));
    }

    // Showdown order: river aggressor first if there was river aggression,
    // else first live seat clockwise from the button.
    const startSeat =
      this.riverAggressor !== null && !this.players.get(this.riverAggressor)!.folded
        ? this.riverAggressor
        : (() => {
            let s = this.nextSeatFrom(this.buttonSeat);
            while (this.players.get(s)!.folded) s = this.nextSeatFrom(s);
            return s;
          })();
    const order: number[] = [];
    {
      let s = startSeat;
      for (let i = 0; i < this.seatOrder.length; i++) {
        if (!this.players.get(s)!.folded) order.push(s);
        s = this.nextSeatFrom(s);
      }
    }

    // Reveal or muck in order. A hand shows if it currently wins or ties some
    // pot it is eligible for among hands shown so far, or if the owner opts
    // to show losing hands. After an all-in runout everyone is already open.
    const shown = new Set<number>();
    const bestShownPerPot = new Map<number, number>(); // potIndex -> best value
    for (const seat of order) {
      const value = values.get(seat)!.value;
      let mustShow = opts.alreadyRevealed === true || this.players.get(seat)!.showLosing;
      for (let i = 0; i < this.pots.length && !mustShow; i++) {
        if (!this.pots[i]!.eligible.includes(seat)) continue;
        const best = bestShownPerPot.get(i);
        if (best === undefined || value >= best) mustShow = true;
      }
      if (mustShow) {
        shown.add(seat);
        for (let i = 0; i < this.pots.length; i++) {
          if (!this.pots[i]!.eligible.includes(seat)) continue;
          const best = bestShownPerPot.get(i);
          if (best === undefined || value > best) bestShownPerPot.set(i, value);
        }
        const handValue = values.get(seat)!;
        this.emit({
          type: "SHOWDOWN_SHOW",
          seat,
          cards: this.players.get(seat)!.holeCards,
          handName: describeHand(handValue),
          bestFive: handValue.bestFive,
        });
      } else {
        this.emit({ type: "SHOWDOWN_MUCK", seat });
      }
    }

    // Pay each pot: best *shown* hand among eligible (mucked hands can't win).
    const payouts: Array<{ seat: number; amount: number; potIndex: number; handName?: string }> =
      [];
    this.pots.forEach((pot, potIndex) => {
      const contenders = pot.eligible.filter((s) => shown.has(s));
      if (contenders.length === 0) {
        throw new Error(`showdown: pot ${potIndex} has no shown contenders`);
      }
      const bestValue = Math.max(...contenders.map((s) => values.get(s)!.value));
      const winners = contenders.filter((s) => values.get(s)!.value === bestValue);

      // Odd chips: first winner clockwise from the button, per pot.
      const clockwise: number[] = [];
      let s = this.nextSeatFrom(this.buttonSeat);
      for (let i = 0; i < this.seatOrder.length; i++) {
        if (winners.includes(s)) clockwise.push(s);
        s = this.nextSeatFrom(s);
      }
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      for (const winnerSeat of clockwise) {
        const amount = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd--;
        this.players.get(winnerSeat)!.stack += amount;
        payouts.push({
          seat: winnerSeat,
          amount,
          potIndex,
          handName: describeHand(values.get(winnerSeat)!),
        });
      }
    });
    this.emit({ type: "PAYOUT", payouts });
    this.completeHand();
  }

  private completeHand(): void {
    this.phase = "COMPLETE";
    this.actionSeat = -1;
    const finalSum = [...this.players.values()].reduce((sum, p) => sum + p.stack, 0);
    if (finalSum !== this.totalChips) {
      throw new Error(
        `Chip conservation violated at hand end: ${finalSum} != ${this.totalChips}`,
      );
    }
    this.emit({
      type: "HAND_END",
      net: this.seatOrder.map((seat) => {
        const p = this.players.get(seat)!;
        return { seat, id: p.id, net: p.stack - p.startingStack, stack: p.stack };
      }),
    });
  }

  /** Stacks + chips committed to the table must always equal the buy-ins. */
  private assertConservation(): void {
    if (this.phase === "COMPLETE") return;
    let sum = 0;
    for (const p of this.players.values()) sum += p.stack + p.committedTotal;
    if (sum !== this.totalChips) {
      throw new Error(`Chip conservation violated: ${sum} != ${this.totalChips}`);
    }
  }
}

function requireRng(): never {
  throw new Error("PokerHand: provide an rng (createCryptoRng() in production) or a deck");
}

/** Table-manager helper: next button seat, skipping vacated seats. */
export function nextButtonSeat(occupiedSeats: number[], previousButton: number): number {
  if (occupiedSeats.length === 0) throw new Error("nextButtonSeat: no seats");
  const sorted = [...occupiedSeats].sort((a, b) => a - b);
  const next = sorted.find((s) => s > previousButton);
  return next ?? sorted[0]!;
}

/** Debug/log helper. */
export function formatBoard(board: CardInt[]): string {
  return board.map(cardToString).join(" ");
}
