import {
  PokerHand,
  IllegalActionError,
  cardToString,
  createCryptoRng,
  decideBotAction,
  monteCarloEquity,
  nextButtonSeat,
  type BotPersonality,
  type CardInt,
  type EngineEvent,
  type HandAction,
  type LegalActions,
  type Street,
} from "@uos-poker/engine";
import {
  BANKROLL,
  BLINDS,
  TABLE,
  TIMERS,
  type BotTier,
  type LegalActionsPayload,
  type SeatPayload,
  type TableErrorPayload,
  type TableEventPayload,
  type TablePhase,
  type TableStatePayload,
} from "@uos-poker/shared";
import { adjustBankroll } from "./users";
import { pickBotName } from "./botNames";

/**
 * One live table. Owns the engine hand, all timers, bots, and the
 * personalised view every socket receives.
 *
 * SECURITY: `secretHoleCards` never leaves this class except (a) a viewer's
 * own cards in their snapshot, (b) cards the engine legitimately revealed
 * (runout/showdown), which live in `view.revealed`.
 */

export interface TableTiming {
  actionMs: number;
  timeBankMs: number;
  disconnectGraceMs: number;
  seatHoldMs: number;
  sitOutKickMs: number;
  botDelayMinMs: number;
  botDelayMaxMs: number;
  runoutBeatMs: number;
  showdownBeatMs: number;
  payoutBeatMs: number;
  interHandMs: number;
  waitingPollMs: number;
}

export const DEFAULT_TIMING: TableTiming = {
  actionMs: TIMERS.actionMs,
  timeBankMs: TIMERS.timeBankMs,
  disconnectGraceMs: TIMERS.disconnectGraceMs,
  seatHoldMs: TIMERS.seatHoldMs,
  sitOutKickMs: TIMERS.sitOutKickMs,
  botDelayMinMs: TIMERS.botDelayMinMs,
  botDelayMaxMs: TIMERS.botDelayMaxMs,
  runoutBeatMs: TIMERS.runoutBeatMs,
  showdownBeatMs: 600,
  payoutBeatMs: 900,
  interHandMs: 2_500,
  waitingPollMs: 1_000,
};

interface HumanSeat {
  kind: "human";
  userId: string;
  nickname: string;
  avatarId: string;
  stack: number;
  sittingOut: boolean;
  sitOutSince: number | null;
  disconnectedAt: number | null;
  consecutiveTimeouts: number;
  timeBankUsedThisOrbit: boolean;
  showLosing: boolean;
  pendingLeave: boolean;
}

interface BotSeatState {
  kind: "bot";
  botId: string;
  nickname: string;
  tier: BotTier;
  personality: BotPersonality;
  stack: number;
  pendingLeave: boolean;
}

export type Seated = HumanSeat | BotSeatState;

export interface Viewer {
  socketId: string;
  userId: string | null;
  emitState: (state: TableStatePayload) => void;
  emitEvent: (event: TableEventPayload) => void;
  emitNotice?: (notice: { message: string; kind: "info" | "warning" }) => void;
}

interface ViewState {
  phase: TablePhase;
  street: Street | null;
  board: string[];
  pots: Array<{ amount: number; eligibleSeats: number[] }>;
  totalPot: number;
  committed: number[]; // by seat
  stacks: number[]; // by seat (during a hand; engine-sourced)
  folded: boolean[];
  allIn: boolean[];
  inHand: boolean[];
  lastAction: (string | null)[];
  revealed: Record<number, string[]>;
  shownHandNames: Record<number, string>;
  winningSeats: number[];
  winningCards: string[];
  bestFiveBySeat: Record<number, string[]>;
  buttonSeat: number | null;
}

const freshView = (): ViewState => ({
  phase: "WAITING",
  street: null,
  board: [],
  pots: [],
  totalPot: 0,
  committed: [0, 0, 0, 0, 0, 0],
  stacks: [0, 0, 0, 0, 0, 0],
  folded: [false, false, false, false, false, false],
  allIn: [false, false, false, false, false, false],
  inHand: [false, false, false, false, false, false],
  lastAction: [null, null, null, null, null, null],
  revealed: {},
  shownHandNames: {},
  winningSeats: [],
  winningCards: [],
  bestFiveBySeat: {},
  buttonSeat: null,
});

export interface HandSettlement {
  tableId: string;
  tableName: string;
  handNo: number;
  rated: boolean;
  players: Array<{
    seat: number;
    userId: string | null;
    botId: string | null;
    botTier: BotTier | null;
    nickname: string;
    startingStack: number;
    net: number;
  }>;
  winners: Array<{ nickname: string; amount: number; handName?: string }>;
  potSize: number;
  board: string;
  summary: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let tableCounter = 0;

export class Table {
  readonly id: string;
  readonly name: string;
  readonly isPractice: boolean;
  readonly ownerUserId: string | null;

  private seats: (Seated | null)[] = [null, null, null, null, null, null];
  private viewers = new Map<string, Viewer>();
  private view: ViewState = freshView();
  private secretHoleCards = new Map<number, [CardInt, CardInt]>();

  private hand: PokerHand | null = null;
  private handNo = 0;
  private seq = 0;
  private buttonSeat: number | null = null;
  private actionSeat: number | null = null;
  private actionDeadline: number | null = null;
  private timeBankEngaged = false;
  private currentLegal: LegalActions | null = null;
  private pendingAction: ((action: { action: HandAction; fromUserId: string }) => void) | null =
    null;

  private raisesThisStreet = 0;
  private preflopAggressor: number | null = null;
  private equityCache = new Map<string, number>();
  private rng = createCryptoRng();

  private handLog: string[] = [];
  private handWinners: Array<{ seat: number; amount: number; handName?: string }> = [];
  private recentPots: number[] = [];
  humanlessSince: number | null = Date.now();
  private closed = false;
  private loopPromise: Promise<void> | null = null;

  /** Called after each hand with the settlement (P4 wires Elo + persistence). */
  onHandSettled: ((settlement: HandSettlement) => void | Promise<void>) | null = null;
  onChanged: (() => void) | null = null;

  constructor(
    opts: {
      name: string;
      isPractice?: boolean;
      ownerUserId?: string;
    },
    private timing: TableTiming = DEFAULT_TIMING,
  ) {
    this.id = `t${++tableCounter}-${Date.now().toString(36)}`;
    this.name = opts.name;
    this.isPractice = opts.isPractice ?? false;
    this.ownerUserId = opts.ownerUserId ?? null;
  }

  // --- Lifecycle -------------------------------------------------------------

  start(): void {
    if (this.loopPromise) return;
    this.loopPromise = this.runLoop().catch((err) => {
      console.error(`Table ${this.id} loop crashed:`, err);
    });
  }

  /** Graceful close: current hand finishes, then everyone is stood up. */
  close(): void {
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async waitForClose(): Promise<void> {
    await this.loopPromise;
  }

  private async runLoop(): Promise<void> {
    while (!this.closed) {
      this.housekeep();
      this.manageBots();
      const eligible = this.eligibleSeatNumbers();
      if (eligible.length < TABLE.minPlayersToDeal) {
        if (this.view.phase !== "WAITING") {
          this.view = freshView();
          this.applySeatStacksToView();
          this.broadcastState();
        }
        await sleep(this.timing.waitingPollMs);
        continue;
      }
      try {
        await this.playHand(eligible);
      } catch (err) {
        console.error(`Table ${this.id} hand ${this.handNo} failed:`, err);
        this.voidHand();
      }
      await sleep(this.timing.interHandMs);
    }
    // Stand everyone up; humans get stacks back to bankroll.
    for (let seat = 0; seat < 6; seat++) {
      if (this.seats[seat]) this.removeFromSeat(seat);
    }
    this.broadcastState();
  }

  // --- Seating ---------------------------------------------------------------

  humanCount(): number {
    return this.seats.filter((s) => s?.kind === "human").length;
  }

  botCount(): number {
    return this.seats.filter((s) => s?.kind === "bot").length;
  }

  freeSeatCount(): number {
    return this.seats.filter((s) => s === null).length;
  }

  spectatorCount(): number {
    let count = 0;
    for (const viewer of this.viewers.values()) {
      if (viewer.userId === null || this.seatOfUser(viewer.userId) === null) count++;
    }
    return count;
  }

  averagePot(): number {
    if (this.recentPots.length === 0) return 0;
    return Math.round(this.recentPots.reduce((a, b) => a + b, 0) / this.recentPots.length);
  }

  seatOfUser(userId: string): number | null {
    for (let seat = 0; seat < 6; seat++) {
      const s = this.seats[seat];
      if (s?.kind === "human" && s.userId === userId) return seat;
    }
    return null;
  }

  sitDown(opts: {
    userId: string;
    nickname: string;
    avatarId: string;
    buyIn: number;
    seat?: number;
    showLosing?: boolean;
  }): { ok: true; seat: number } | { ok: false; code: string; message: string } {
    if (this.closed) return { ok: false, code: "TABLE_NOT_FOUND", message: "Table is closing." };
    if (this.seatOfUser(opts.userId) !== null) {
      return { ok: false, code: "ALREADY_SEATED", message: "You're already at this table." };
    }
    if (this.isPractice && this.ownerUserId !== opts.userId) {
      return { ok: false, code: "NO_SEAT", message: "This is a private practice table." };
    }
    if (opts.buyIn < BANKROLL.tableBuyInMin || opts.buyIn > BANKROLL.tableBuyInMax) {
      return {
        ok: false,
        code: "BAD_AMOUNT",
        message: `Buy-in must be ${BANKROLL.tableBuyInMin}–${BANKROLL.tableBuyInMax} chips.`,
      };
    }
    let seat = opts.seat;
    if (seat !== undefined && this.seats[seat] !== null) {
      return { ok: false, code: "SEAT_TAKEN", message: "That seat is taken." };
    }
    if (seat === undefined) {
      seat = this.seats.findIndex((s) => s === null);
      if (seat === -1) return { ok: false, code: "TABLE_FULL", message: "No free seats." };
    }
    try {
      adjustBankroll(opts.userId, -opts.buyIn);
    } catch {
      return {
        ok: false,
        code: "INSUFFICIENT_BANKROLL",
        message: "Not enough chips in your bankroll for that buy-in.",
      };
    }
    this.seats[seat] = {
      kind: "human",
      userId: opts.userId,
      nickname: opts.nickname,
      avatarId: opts.avatarId,
      stack: opts.buyIn,
      sittingOut: false,
      sitOutSince: null,
      disconnectedAt: null,
      consecutiveTimeouts: 0,
      timeBankUsedThisOrbit: false,
      showLosing: opts.showLosing ?? false,
      pendingLeave: false,
    };
    this.humanlessSince = null;
    this.applySeatStacksToView();
    this.emitTableEvent({ kind: "PLAYER_SAT", seat, nickname: opts.nickname });
    this.broadcastState();
    this.onChanged?.();
    return { ok: true, seat };
  }

  /** Stand up. Mid-hand this folds the player; chips return at hand end. */
  standUp(userId: string): void {
    const seat = this.seatOfUser(userId);
    if (seat === null) return;
    const player = this.seats[seat] as HumanSeat;
    if (this.isSeatInLiveHand(seat)) {
      player.pendingLeave = true;
      this.foldIfActing(seat);
    } else {
      this.removeFromSeat(seat);
      this.broadcastState();
      this.onChanged?.();
    }
  }

  addBot(tier: BotTier, personality: BotPersonality): boolean {
    const seat = this.seats.findIndex((s) => s === null);
    if (seat === -1) return false;
    const inUse = new Set(
      this.seats.filter((s): s is Seated => s !== null).map((s) => s.nickname),
    );
    const nickname = pickBotName(personality, inUse, () => this.rng.nextInt(1000) / 1000);
    this.seats[seat] = {
      kind: "bot",
      botId: `bot:${tier.toLowerCase()}:${this.id}:${seat}:${this.handNo}`,
      nickname,
      tier,
      personality,
      stack: BANKROLL.tableBuyInDefault,
      pendingLeave: false,
    };
    this.applySeatStacksToView();
    this.emitTableEvent({ kind: "PLAYER_SAT", seat, nickname });
    this.onChanged?.();
    return true;
  }

  private removeFromSeat(seat: number): void {
    const player = this.seats[seat];
    if (!player) return;
    if (player.kind === "human" && player.stack > 0) {
      adjustBankroll(player.userId, player.stack);
    }
    this.seats[seat] = null;
    this.view.inHand[seat] = false;
    this.emitTableEvent({ kind: "PLAYER_STOOD", seat, nickname: player.nickname });
    if (this.humanCount() === 0 && this.humanlessSince === null) {
      this.humanlessSince = Date.now();
    }
    this.onChanged?.();
  }

  // --- Connection state --------------------------------------------------------

  addViewer(viewer: Viewer): void {
    this.viewers.set(viewer.socketId, viewer);
    if (viewer.userId) {
      const seat = this.seatOfUser(viewer.userId);
      if (seat !== null) {
        const player = this.seats[seat] as HumanSeat;
        player.disconnectedAt = null;
      }
    }
    viewer.emitState(this.buildState(viewer.userId));
    this.onChanged?.();
  }

  removeViewer(socketId: string): void {
    const viewer = this.viewers.get(socketId);
    this.viewers.delete(socketId);
    if (viewer?.userId) {
      // Disconnected (no other socket for this user still watching)?
      const stillHere = [...this.viewers.values()].some((v) => v.userId === viewer.userId);
      const seat = viewer.userId ? this.seatOfUser(viewer.userId) : null;
      if (!stillHere && seat !== null) {
        const player = this.seats[seat] as HumanSeat;
        player.disconnectedAt = Date.now();
        // Reconnect grace on top of the remaining clock.
        if (this.actionSeat === seat && this.actionDeadline !== null) {
          this.actionDeadline += this.timing.disconnectGraceMs;
        }
        this.broadcastState();
      }
    }
    this.onChanged?.();
  }

  imBack(userId: string): void {
    const seat = this.seatOfUser(userId);
    if (seat === null) return;
    const player = this.seats[seat] as HumanSeat;
    player.sittingOut = false;
    player.sitOutSince = null;
    player.consecutiveTimeouts = 0;
    this.broadcastState();
  }

  // --- Action intake -----------------------------------------------------------

  submitAction(
    userId: string,
    msg: { handNo: number; seq: number; action: string; amount?: number },
  ): { ok: true } | { ok: false; code: string; message: string } {
    const seat = this.seatOfUser(userId);
    if (seat === null) return { ok: false, code: "NO_SEAT", message: "You're not seated here." };
    if (msg.handNo !== this.handNo || msg.seq !== this.seq) {
      return { ok: false, code: "STALE_ACTION", message: "That action was for an earlier state." };
    }
    if (this.actionSeat !== seat || !this.pendingAction) {
      return { ok: false, code: "NOT_YOUR_TURN", message: "It's not your turn." };
    }
    const action: HandAction =
      msg.action === "BET" || msg.action === "RAISE"
        ? { type: msg.action, amount: msg.amount }
        : { type: msg.action as "FOLD" | "CHECK" | "CALL" };
    this.pendingAction({ action, fromUserId: userId });
    return { ok: true };
  }

  private foldIfActing(seat: number): void {
    if (this.actionSeat === seat && this.pendingAction) {
      const player = this.seats[seat];
      if (player?.kind === "human") {
        this.pendingAction({ action: { type: "FOLD" }, fromUserId: player.userId });
      }
    }
  }

  // --- The hand loop -------------------------------------------------------------

  private eligibleSeatNumbers(): number[] {
    const out: number[] = [];
    for (let seat = 0; seat < 6; seat++) {
      const s = this.seats[seat];
      if (!s || s.pendingLeave) continue;
      if (s.kind === "human" && (s.sittingOut || s.stack < BLINDS.big)) continue;
      if (s.stack <= 0) continue;
      out.push(seat);
    }
    return out;
  }

  private isSeatInLiveHand(seat: number): boolean {
    return this.hand !== null && !this.hand.isComplete && this.view.inHand[seat] === true;
  }

  private async playHand(eligible: number[]): Promise<void> {
    this.handNo++;
    this.equityCache.clear();
    this.raisesThisStreet = 0;
    this.preflopAggressor = null;
    this.secretHoleCards.clear();

    this.buttonSeat = nextButtonSeat(eligible, this.buttonSeat ?? -1);
    // Time bank refreshes when the button reaches your seat (once per orbit).
    const buttonPlayer = this.seats[this.buttonSeat];
    if (buttonPlayer?.kind === "human") buttonPlayer.timeBankUsedThisOrbit = false;

    const participants = eligible.map((seat) => {
      const s = this.seats[seat]!;
      return {
        seat,
        id: s.kind === "human" ? s.userId : s.botId,
        stack: s.stack,
        showLosing: s.kind === "human" ? s.showLosing : false,
      };
    });
    const startingStacks = new Map(participants.map((p) => [p.seat, p.stack]));

    const hand = new PokerHand({
      handNo: this.handNo,
      buttonSeat: this.buttonSeat,
      players: participants,
      blinds: { small: BLINDS.small, big: BLINDS.big },
      rng: this.rng,
    });
    this.hand = hand;
    await this.relayEvents(hand.drainEvents());

    while (!hand.isComplete) {
      const seat = hand.currentActionSeat;
      const player = this.seats[seat];
      if (!player) throw new Error(`Action on empty seat ${seat}`);
      const legal = hand.legalActions(seat);
      this.currentLegal = legal;

      while (true) {
        const chosen = await this.awaitAction(seat, player, legal);
        try {
          const events = hand.act(seat, chosen);
          this.actionSeat = null;
          this.actionDeadline = null;
          this.timeBankEngaged = false;
          this.currentLegal = null;
          await this.relayEvents(events);
          break;
        } catch (err) {
          if (err instanceof IllegalActionError && player.kind === "human") {
            this.sendErrorToUser(player.userId, err.code, err.message);
            continue; // same deadline, wait again
          }
          throw err;
        }
      }
    }

    this.settleHand(startingStacks);
  }

  /** Resolve the next action for the seat: bot policy or human input/timeout. */
  private async awaitAction(seat: number, player: Seated, legal: LegalActions): Promise<HandAction> {
    if (player.kind === "bot") {
      const delay =
        this.timing.botDelayMinMs +
        this.rng.nextInt(Math.max(1, this.timing.botDelayMaxMs - this.timing.botDelayMinMs));
      this.actionSeat = seat;
      this.actionDeadline = Date.now() + delay;
      this.broadcastState();
      await sleep(delay);
      return this.botDecision(seat, player, legal);
    }

    // Human turn. Keep the existing deadline on retry after an illegal
    // action — otherwise spamming bad actions would reset the clock.
    if (this.actionSeat !== seat || this.actionDeadline === null) {
      this.actionSeat = seat;
      this.actionDeadline =
        Date.now() +
        this.timing.actionMs +
        (player.disconnectedAt !== null ? this.timing.disconnectGraceMs : 0);
      this.timeBankEngaged = false;
    }
    this.broadcastState();

    while (true) {
      const result = await this.waitForHumanAction();
      if (result) {
        player.consecutiveTimeouts = 0;
        return result.action;
      }
      // Clock expired. Time bank auto-engages if unused this orbit.
      if (!player.timeBankUsedThisOrbit && !this.timeBankEngaged) {
        player.timeBankUsedThisOrbit = true;
        this.timeBankEngaged = true;
        this.actionDeadline = Date.now() + this.timing.timeBankMs;
        this.broadcastState();
        continue;
      }
      // Hard timeout: check if free, else fold. Two in a row sits you out.
      player.consecutiveTimeouts++;
      if (player.consecutiveTimeouts >= TIMERS.timeoutsBeforeSitOut) {
        player.sittingOut = true;
        player.sitOutSince = Date.now();
      }
      return legal.check ? { type: "CHECK" } : { type: "FOLD" };
    }
  }

  /** Waits for the actor's socket action or the (mutable) deadline. */
  private waitForHumanAction(): Promise<{ action: HandAction; fromUserId: string } | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: { action: HandAction; fromUserId: string } | null) => {
        if (settled) return;
        settled = true;
        this.pendingAction = null;
        clearTimeout(timer);
        resolve(value);
      };
      this.pendingAction = (incoming) => finish(incoming);
      const tick = () => {
        const deadline = this.actionDeadline ?? 0;
        const remaining = deadline - Date.now();
        if (remaining <= 0) return finish(null);
        timer = setTimeout(tick, Math.min(remaining, 250));
      };
      let timer = setTimeout(tick, 0);
    });
  }

  private botDecision(seat: number, bot: BotSeatState, legal: LegalActions): HandAction {
    const hand = this.hand!;
    const street = hand.currentStreet;
    const publicState = hand.playerPublicState();
    const me = publicState.find((p) => p.seat === seat)!;
    const live = publicState.filter((p) => !p.folded);

    // Position 0..1 by postflop action order.
    const seatsInHand = publicState.map((p) => p.seat).sort((a, b) => a - b);
    const order: number[] = [];
    let s = seatsInHand.find((x) => x > (this.buttonSeat ?? -1)) ?? seatsInHand[0]!;
    for (let i = 0; i < seatsInHand.length; i++) {
      order.push(s);
      const idx = seatsInHand.indexOf(s);
      s = seatsInHand[(idx + 1) % seatsInHand.length]!;
    }
    const position = seatsInHand.length === 1 ? 1 : order.indexOf(seat) / (seatsInHand.length - 1);

    let equity: number | undefined;
    if (street !== "PREFLOP") {
      const key = `${seat}:${street}:${live.length}`;
      equity = this.equityCache.get(key);
      if (equity === undefined) {
        equity = monteCarloEquity({
          hole: this.secretHoleCards.get(seat)!,
          board: hand.communityCards,
          opponents: Math.max(1, live.length - 1),
          rollouts: 300,
          rng: this.rng,
        });
        this.equityCache.set(key, equity);
      }
    }

    return decideBotAction(bot.tier, bot.personality, {
      legal,
      holeCards: this.secretHoleCards.get(seat)!,
      board: hand.communityCards,
      street,
      potSize: hand.totalPotSize,
      liveOpponents: live.length - 1,
      position,
      wasPreflopAggressor: this.preflopAggressor === seat,
      raisesThisStreet: this.raisesThisStreet,
      bigBlind: BLINDS.big,
      stack: me.stack,
      committedStreet: me.committedStreet,
      currentBet: hand.streetCurrentBet,
      rng: this.rng,
      ...(equity !== undefined ? { equity } : {}),
    });
  }

  // --- Event relay (event-sourced public view; per-viewer sanitisation) --------

  private async relayEvents(events: EngineEvent[]): Promise<void> {
    for (const event of events) {
      switch (event.type) {
        case "HAND_START": {
          this.view = freshView();
          this.handWinners = [];
          this.view.phase = "BETTING";
          this.view.street = "PREFLOP";
          this.view.buttonSeat = event.buttonSeat;
          this.applySeatStacksToView();
          for (const p of event.players) {
            this.view.inHand[p.seat] = true;
            this.view.stacks[p.seat] = p.stack;
          }
          this.emitTableEvent({ kind: "HAND_START", buttonSeat: event.buttonSeat });
          break;
        }
        case "BLIND_POSTED": {
          this.view.stacks[event.seat]! -= event.amount;
          this.view.committed[event.seat] = event.amount;
          this.view.totalPot += event.amount;
          if (event.allIn) this.view.allIn[event.seat] = true;
          this.emitTableEvent({ kind: "BLIND", seat: event.seat, amount: event.amount });
          break;
        }
        case "HOLE_CARDS": {
          // SECRET: stored server-side; reaches only the owner via snapshots.
          this.secretHoleCards.set(event.seat, event.cards);
          break;
        }
        case "ACTION_ON": {
          this.seq++;
          break;
        }
        case "ACTION": {
          const delta = event.committed - (this.view.committed[event.seat] ?? 0);
          this.view.stacks[event.seat]! -= delta;
          this.view.committed[event.seat] = event.committed;
          this.view.totalPot += delta;
          if (event.allIn) this.view.allIn[event.seat] = true;
          if (event.action === "FOLD") this.view.folded[event.seat] = true;
          this.view.lastAction[event.seat] = event.action.toLowerCase();
          if (event.action === "BET" || event.action === "RAISE") {
            this.raisesThisStreet++;
            if (this.hand?.currentStreet === "PREFLOP" || this.view.street === "PREFLOP") {
              this.preflopAggressor = event.seat;
            }
          }
          this.emitTableEvent({
            kind: "ACTION",
            seat: event.seat,
            action: event.action,
            committed: event.committed,
            allIn: event.allIn,
          });
          this.broadcastState();
          break;
        }
        case "UNCALLED_RETURNED": {
          this.view.stacks[event.seat]! += event.amount;
          this.view.committed[event.seat]! -= event.amount;
          this.view.totalPot -= event.amount;
          break;
        }
        case "POTS": {
          this.view.pots = event.pots.map((p) => ({
            amount: p.amount,
            eligibleSeats: p.eligible,
          }));
          this.view.totalPot = event.totalPot;
          this.view.committed = [0, 0, 0, 0, 0, 0];
          this.emitTableEvent({ kind: "POTS", totalPot: event.totalPot });
          this.broadcastState();
          break;
        }
        case "STREET": {
          this.view.street = event.street;
          this.view.board = event.board.map(cardToString);
          this.view.lastAction = [null, null, null, null, null, null];
          this.raisesThisStreet = 0;
          this.emitTableEvent({
            kind: "STREET",
            street: event.street,
            cards: event.cards.map(cardToString),
          });
          this.broadcastState();
          if (this.view.phase === "RUNOUT") await sleep(this.timing.runoutBeatMs);
          break;
        }
        case "RUNOUT_REVEAL": {
          this.view.phase = "RUNOUT";
          for (const reveal of event.reveals) {
            this.view.revealed[reveal.seat] = reveal.cards.map(cardToString);
            this.emitTableEvent({
              kind: "REVEAL",
              seat: reveal.seat,
              cards: reveal.cards.map(cardToString),
            });
          }
          this.broadcastState();
          await sleep(this.timing.runoutBeatMs);
          break;
        }
        case "SHOWDOWN_SHOW": {
          this.view.revealed[event.seat] = event.cards.map(cardToString);
          this.view.shownHandNames[event.seat] = event.handName;
          this.view.bestFiveBySeat[event.seat] = event.bestFive.map(cardToString);
          this.emitTableEvent({
            kind: "REVEAL",
            seat: event.seat,
            cards: event.cards.map(cardToString),
            handName: event.handName,
          });
          this.broadcastState();
          await sleep(this.timing.showdownBeatMs);
          break;
        }
        case "SHOWDOWN_MUCK": {
          this.view.folded[event.seat] = true;
          this.emitTableEvent({ kind: "MUCK", seat: event.seat });
          break;
        }
        case "PAYOUT": {
          for (const payout of event.payouts) {
            this.view.stacks[payout.seat]! += payout.amount;
            if (!this.view.winningSeats.includes(payout.seat)) {
              this.view.winningSeats.push(payout.seat);
            }
            this.handWinners.push({
              seat: payout.seat,
              amount: payout.amount,
              ...(payout.handName !== undefined ? { handName: payout.handName } : {}),
            });
            const bestFive = this.view.bestFiveBySeat[payout.seat];
            if (bestFive) {
              for (const card of bestFive) {
                if (!this.view.winningCards.includes(card)) this.view.winningCards.push(card);
              }
            }
            const player = this.seats[payout.seat];
            this.emitTableEvent({
              kind: "WIN",
              seat: payout.seat,
              amount: payout.amount,
              ...(payout.handName !== undefined ? { handName: payout.handName } : {}),
            });
            if (player) {
              this.handLog.push(
                payout.handName
                  ? `#${this.handNo} — ${player.nickname} wins ${payout.amount.toLocaleString()} with ${payout.handName.toLowerCase()}`
                  : `#${this.handNo} — ${player.nickname} wins ${payout.amount.toLocaleString()}`,
              );
            }
          }
          if (this.handLog.length > 25) this.handLog = this.handLog.slice(-25);
          this.broadcastState();
          await sleep(this.timing.payoutBeatMs);
          break;
        }
        case "HAND_END": {
          this.view.phase = "COMPLETE";
          this.recentPots.push(this.view.totalPot);
          if (this.recentPots.length > 20) this.recentPots.shift();
          this.emitTableEvent({ kind: "HAND_END" });
          break;
        }
      }
    }
  }

  // --- Settlement ----------------------------------------------------------------

  private settleHand(startingStacks: Map<number, number>): void {
    const hand = this.hand;
    if (!hand) return;
    const finalStates = hand.playerPublicState();

    const settlementPlayers: HandSettlement["players"] = [];
    for (const p of finalStates) {
      const seatPlayer = this.seats[p.seat];
      if (!seatPlayer) continue;
      seatPlayer.stack = p.stack;
      settlementPlayers.push({
        seat: p.seat,
        userId: seatPlayer.kind === "human" ? seatPlayer.userId : null,
        botId: seatPlayer.kind === "bot" ? seatPlayer.botId : null,
        botTier: seatPlayer.kind === "bot" ? seatPlayer.tier : null,
        nickname: seatPlayer.nickname,
        startingStack: startingStacks.get(p.seat) ?? 0,
        net: p.stack - (startingStacks.get(p.seat) ?? 0),
      });
    }

    const humanInHand = settlementPlayers.some((p) => p.userId !== null);
    const settlement: HandSettlement = {
      tableId: this.id,
      tableName: this.name,
      handNo: this.handNo,
      rated: !this.isPractice && humanInHand,
      players: settlementPlayers,
      winners: this.handWinners.map((w) => ({
        nickname: this.seats[w.seat]?.nickname ?? "?",
        amount: w.amount,
        ...(w.handName !== undefined ? { handName: w.handName } : {}),
      })),
      potSize: this.view.totalPot,
      board: this.view.board.join(" "),
      summary: this.handLog[this.handLog.length - 1] ?? "",
    };

    this.hand = null;
    this.applySeatStacksToView();

    // Players who stood up (or were held past their grace) leave now.
    for (let seat = 0; seat < 6; seat++) {
      const s = this.seats[seat];
      if (s?.pendingLeave) this.removeFromSeat(seat);
    }

    void this.onHandSettled?.(settlement);
    this.broadcastState();
    this.onChanged?.();
  }

  /** Deploy/crash mid-hand: stacks return to their pre-hand values. */
  private voidHand(): void {
    this.hand = null;
    this.view = freshView();
    this.applySeatStacksToView();
    this.actionSeat = null;
    this.actionDeadline = null;
    this.pendingAction = null;
    this.notifyAll({
      message: "That hand was voided — chips returned to your stack. Dealing a fresh one.",
      kind: "warning",
    });
    this.broadcastState();
  }

  private notifyAll(notice: { message: string; kind: "info" | "warning" }): void {
    for (const viewer of this.viewers.values()) viewer.emitNotice?.(notice);
  }

  // --- Housekeeping ----------------------------------------------------------------

  private housekeep(): void {
    const now = Date.now();
    for (let seat = 0; seat < 6; seat++) {
      const player = this.seats[seat];
      if (!player || player.kind !== "human") continue;
      // Disconnected too long → seat freed, stack to bankroll.
      if (player.disconnectedAt !== null && now - player.disconnectedAt > this.timing.seatHoldMs) {
        if (this.isSeatInLiveHand(seat)) player.pendingLeave = true;
        else this.removeFromSeat(seat);
        continue;
      }
      // Sat out too long → returned to lobby.
      if (
        player.sittingOut &&
        player.sitOutSince !== null &&
        now - player.sitOutSince > this.timing.sitOutKickMs
      ) {
        if (this.isSeatInLiveHand(seat)) player.pendingLeave = true;
        else this.removeFromSeat(seat);
      }
    }
  }

  private manageBots(): void {
    if (this.isPractice || this.closed) return;
    const humans = this.humanCount();
    if (humans >= 1) {
      // Top up to keep the table alive.
      while (this.humanCount() + this.botCount() < 3 && this.freeSeatCount() > 0) {
        this.addBot(this.pickTier(), this.pickPersonality());
      }
      // Bots give way: keep a seat free for incoming humans when possible.
      if (this.freeSeatCount() === 0 && this.botCount() > Math.max(0, 3 - humans)) {
        const botSeat = this.seats.findIndex((s) => s?.kind === "bot");
        if (botSeat !== -1) this.removeFromSeat(botSeat);
      }
    }
    // Bottomless bot bankrolls: top up between hands.
    for (const s of this.seats) {
      if (s?.kind === "bot" && s.stack < BANKROLL.tableBuyInMin) {
        s.stack = BANKROLL.tableBuyInDefault;
      }
    }
  }

  private pickTier(): BotTier {
    // Mostly Casual/Solid, occasional Fish/Shark.
    const roll = this.rng.nextInt(100);
    if (roll < 35) return "CASUAL";
    if (roll < 70) return "SOLID";
    if (roll < 85) return "FISH";
    return "SHARK";
  }

  private pickPersonality(): BotPersonality {
    const roll = this.rng.nextInt(100);
    if (roll < 50) return "STANDARD";
    if (roll < 70) return "ROCK";
    if (roll < 90) return "STATION";
    return "MANIAC";
  }

  // --- State building & broadcast -----------------------------------------------

  private applySeatStacksToView(): void {
    for (let seat = 0; seat < 6; seat++) {
      const s = this.seats[seat];
      if (s && !this.isSeatInLiveHand(seat)) this.view.stacks[seat] = s.stack;
    }
  }

  buildState(viewerUserId: string | null): TableStatePayload {
    const mySeat = viewerUserId !== null ? this.seatOfUser(viewerUserId) : null;
    const myHole =
      mySeat !== null && this.view.inHand[mySeat]
        ? (this.secretHoleCards.get(mySeat)?.map(cardToString) ?? null)
        : null;
    const me = mySeat !== null ? (this.seats[mySeat] as HumanSeat) : null;

    const seats: (SeatPayload | null)[] = this.seats.map((s, seat) => {
      if (!s) return null;
      const payload: SeatPayload = {
        seat,
        nickname: s.nickname,
        avatarId: s.kind === "human" ? s.avatarId : "bot",
        isBot: s.kind === "bot",
        stack: this.view.inHand[seat] ? this.view.stacks[seat]! : s.stack,
        committed: this.view.committed[seat]!,
        folded: this.view.folded[seat]!,
        allIn: this.view.allIn[seat]!,
        sittingOut: s.kind === "human" ? s.sittingOut : false,
        disconnected: s.kind === "human" ? s.disconnectedAt !== null : false,
      };
      if (s.kind === "bot") payload.botTier = s.tier;
      const last = this.view.lastAction[seat];
      if (last) payload.lastAction = last;
      return payload;
    });

    return {
      tableId: this.id,
      name: this.name,
      isPractice: this.isPractice,
      phase: this.view.phase,
      handNo: this.handNo,
      seq: this.seq,
      street: this.view.street,
      board: this.view.board,
      pots: this.view.pots,
      totalPot: this.view.totalPot,
      seats,
      buttonSeat: this.view.buttonSeat,
      actionSeat: this.actionSeat,
      actionDeadline: this.actionDeadline,
      timeBankEngaged: this.timeBankEngaged,
      revealed: this.view.revealed,
      shownHandNames: this.view.shownHandNames,
      winningSeats: this.view.winningSeats,
      winningCards: this.view.winningCards,
      spectators: this.spectatorCount(),
      mySeat,
      myCards: myHole,
      myLegal:
        mySeat !== null && this.actionSeat === mySeat && this.currentLegal
          ? toLegalPayload(this.currentLegal)
          : null,
      sittingOut: me?.sittingOut ?? false,
      handLog: [...this.handLog],
    };
  }

  private broadcastState(): void {
    for (const viewer of this.viewers.values()) {
      viewer.emitState(this.buildState(viewer.userId));
    }
  }

  private emitTableEvent(event: TableEventPayload["event"]): void {
    const payload: TableEventPayload = { tableId: this.id, handNo: this.handNo, event };
    for (const viewer of this.viewers.values()) {
      viewer.emitEvent(payload);
    }
  }

  private sendErrorToUser(
    userId: string,
    code: TableErrorPayload["code"],
    message: string,
  ): void {
    this.errorSink?.(userId, code, message);
  }

  /** Wired by the sockets layer to deliver typed errors to a user's sockets. */
  errorSink:
    | ((userId: string, code: TableErrorPayload["code"], message: string) => void)
    | null = null;
}

function toLegalPayload(legal: LegalActions): LegalActionsPayload {
  const payload: LegalActionsPayload = { fold: legal.fold, check: legal.check };
  if (legal.call) payload.call = legal.call;
  if (legal.bet) payload.bet = legal.bet;
  if (legal.raise) payload.raise = legal.raise;
  return payload;
}
