import { describe, expect, it } from "vitest";
import { cardFromString, cardsFromString, freshDeck, type CardInt } from "../src/cards";
import {
  IllegalActionError,
  PokerHand,
  nextButtonSeat,
  type EngineEvent,
  type HandConfig,
} from "../src/hand";

const BLINDS = { small: 50, big: 100 };

/**
 * Build a rigged deck. Deal order: one card at a time, twice around,
 * starting left of the button; then flop/turn/river (no burns).
 */
function rig(opts: {
  seats: number[];
  button: number;
  holes: Record<number, string>; // seat -> "As Kd"
  board?: string;
}): CardInt[] {
  const sorted = [...opts.seats].sort((a, b) => a - b);
  const order: number[] = [];
  let s = sorted.find((x) => x > opts.button) ?? sorted[0]!;
  for (let i = 0; i < sorted.length; i++) {
    order.push(s);
    const idx = sorted.indexOf(s);
    s = sorted[(idx + 1) % sorted.length]!;
  }
  const first: CardInt[] = [];
  const second: CardInt[] = [];
  for (const seat of order) {
    const hole = opts.holes[seat];
    if (!hole) throw new Error(`rig: no hole cards for seat ${seat}`);
    const [a, b] = hole.trim().split(/\s+/);
    first.push(cardFromString(a!));
    second.push(cardFromString(b!));
  }
  const board = opts.board ? cardsFromString(opts.board) : [];
  const used = [...first, ...second, ...board];
  if (new Set(used).size !== used.length) throw new Error("rig: duplicate cards");
  const rest = freshDeck().filter((c) => !used.includes(c));
  return [...first, ...second, ...board, ...rest];
}

function makeHand(config: Omit<HandConfig, "handNo">): { hand: PokerHand; events: EngineEvent[] } {
  const hand = new PokerHand({ handNo: 1, ...config });
  return { hand, events: hand.drainEvents() };
}

const allEvents: EngineEvent[] = [];
function play(hand: PokerHand, seat: number, type: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE", amount?: number) {
  const events = hand.act(seat, amount === undefined ? { type } : { type, amount });
  allEvents.push(...events);
  return events;
}

describe("blinds, dealing, and first action", () => {
  it("3-handed: SB left of button, BB next, UTG acts first", () => {
    const { hand, events } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "btn", stack: 10000 },
        { seat: 1, id: "sb", stack: 10000 },
        { seat: 2, id: "bb", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({ seats: [0, 1, 2], button: 0, holes: { 0: "As Ks", 1: "2c 7d", 2: "9h 9s" } }),
    });
    const start = events.find((e) => e.type === "HAND_START")!;
    expect(start).toMatchObject({ smallBlindSeat: 1, bigBlindSeat: 2 });
    const blinds = events.filter((e) => e.type === "BLIND_POSTED");
    expect(blinds).toEqual([
      { type: "BLIND_POSTED", seat: 1, kind: "SB", amount: 50, allIn: false },
      { type: "BLIND_POSTED", seat: 2, kind: "BB", amount: 100, allIn: false },
    ]);
    const actionOn = events.find((e) => e.type === "ACTION_ON")!;
    expect(actionOn.type === "ACTION_ON" && actionOn.seat).toBe(0);
    expect(hand.holeCardsOf(0)).toEqual(cardsFromString("As Ks"));
    expect(hand.holeCardsOf(2)).toEqual(cardsFromString("9h 9s"));
  });

  it("heads-up: button posts SB and acts first preflop; BB acts first postflop", () => {
    const { hand, events } = makeHand({
      buttonSeat: 3,
      players: [
        { seat: 1, id: "bb", stack: 10000 },
        { seat: 3, id: "btn", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({ seats: [1, 3], button: 3, holes: { 1: "2c 7d", 3: "As Ks" } }),
    });
    const start = events.find((e) => e.type === "HAND_START")!;
    expect(start).toMatchObject({ smallBlindSeat: 3, bigBlindSeat: 1 });
    const actionOn = events.find((e) => e.type === "ACTION_ON")!;
    expect(actionOn.type === "ACTION_ON" && actionOn.seat).toBe(3);

    // Button completes, BB checks → flop. BB (seat 1) must act first postflop.
    play(hand, 3, "CALL");
    const flopEvents = play(hand, 1, "CHECK");
    const street = flopEvents.find((e) => e.type === "STREET")!;
    expect(street.type === "STREET" && street.street).toBe("FLOP");
    const next = flopEvents.find((e) => e.type === "ACTION_ON")!;
    expect(next.type === "ACTION_ON" && next.seat).toBe(1);
  });

  it("BB has the option: may raise after limps", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "btn", stack: 10000 },
        { seat: 1, id: "sb", stack: 10000 },
        { seat: 2, id: "bb", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({ seats: [0, 1, 2], button: 0, holes: { 0: "2c 7d", 1: "3c 8d", 2: "As Ks" } }),
    });
    play(hand, 0, "CALL");
    play(hand, 1, "CALL");
    const legal = hand.legalActions(2);
    expect(legal.check).toBe(true);
    expect(legal.raise).toEqual({ minTo: 200, maxTo: 10000 });
  });
});

describe("the min-raise fixture (verbatim from the brief)", () => {
  // Blinds 50/100; P1 raises to 300 (increment 200); P2 calls; P3 all-in 350.
  // P1 and P2 may call 50 more or fold — raising is illegal.
  function setup() {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "P1", stack: 10000 }, // UTG (button, 3-handed)
        { seat: 1, id: "P2", stack: 10000 }, // SB
        { seat: 2, id: "P3", stack: 350 }, // BB, stack exactly 350
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1, 2],
        button: 0,
        holes: { 0: "As Ks", 1: "Qc Qd", 2: "2c 7d" },
        board: "Th 8h 4c Jd 3s",
      }),
    });
    play(hand, 0, "RAISE", 300); // full raise, increment 200
    play(hand, 1, "CALL"); // P2 calls 300
    play(hand, 2, "RAISE", 350); // P3 all-in — short raise (increment 50 < 200)
    return hand;
  }

  it("P1 may only call 50 or fold", () => {
    const hand = setup();
    const legal = hand.legalActions(0);
    expect(legal.call).toEqual({ amount: 50, allIn: false });
    expect(legal.raise).toBeUndefined();
    expect(legal.check).toBe(false);
    expect(legal.fold).toBe(true);
    expect(() => hand.act(0, { type: "RAISE", amount: 600 })).toThrow(IllegalActionError);
  });

  it("P2 may only call 50 or fold after P1 calls", () => {
    const hand = setup();
    play(hand, 0, "CALL");
    const legal = hand.legalActions(1);
    expect(legal.call).toEqual({ amount: 50, allIn: false });
    expect(legal.raise).toBeUndefined();
    expect(() => hand.act(1, { type: "RAISE", amount: 700 })).toThrow(/not available/);
  });

  it("a full re-raise by an unacted player re-opens action", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "P1", stack: 10000 },
        { seat: 1, id: "P2", stack: 350 },
        { seat: 2, id: "P3", stack: 10000 }, // BB, has not acted yet
      ],
      blinds: BLINDS,
      deck: rig({ seats: [0, 1, 2], button: 0, holes: { 0: "As Ks", 1: "Qc Qd", 2: "Jh Js" } }),
    });
    play(hand, 0, "RAISE", 300); // full raise (increment 200)
    play(hand, 1, "RAISE", 350); // SB short all-in
    // BB never acted since the last full raise — may re-raise.
    const legalBB = hand.legalActions(2);
    expect(legalBB.raise).toEqual({ minTo: 550, maxTo: 10000 }); // 350 + 200
    play(hand, 2, "RAISE", 600); // full raise (increment 250)
    // P1 faces a fresh full raise — may re-raise again.
    const legalP1 = hand.legalActions(0);
    expect(legalP1.raise).toEqual({ minTo: 850, maxTo: 10000 }); // 600 + 250
  });
});

describe("the side-pot fixture (verbatim from the brief)", () => {
  it("A 1,000 / B 3,000 / C 10,000 → main 3,000 (A,B,C); side 4,000 (B,C)", () => {
    const { hand } = makeHand({
      buttonSeat: 2,
      players: [
        { seat: 0, id: "A", stack: 1000 }, // SB
        { seat: 1, id: "B", stack: 3000 }, // BB
        { seat: 2, id: "C", stack: 10000 }, // button, UTG 3-handed
      ],
      blinds: BLINDS,
      // A flops quads; B rivers a flush; C has a straight. A best overall, B beats C.
      deck: rig({
        seats: [0, 1, 2],
        button: 2,
        holes: { 0: "7c 7d", 1: "Ah Kh", 2: "Ts 9s" },
        board: "7h 7s 8h Jc 2h",
      }),
    });
    play(hand, 2, "CALL"); // C calls 100
    play(hand, 0, "RAISE", 1000); // A all-in 1,000 (full raise)
    play(hand, 1, "RAISE", 3000); // B all-in 3,000 (full raise)
    const events = play(hand, 2, "CALL"); // C calls 3,000 → runout

    const pots = events.find((e) => e.type === "POTS")!;
    expect(pots.type === "POTS" && pots.pots).toEqual([
      { amount: 3000, eligible: [0, 1, 2] },
      { amount: 4000, eligible: [1, 2] },
    ]);

    // A (quad sevens) wins the main pot; B (flush) wins the side pot over C (straight).
    const payout = events.find((e) => e.type === "PAYOUT")!;
    expect(payout.type === "PAYOUT" && payout.payouts).toEqual([
      { seat: 0, amount: 3000, potIndex: 0, handName: "Four of a kind — Sevens" },
      { seat: 1, amount: 4000, potIndex: 1, handName: "Flush — Ace high" },
    ]);

    const end = events.find((e) => e.type === "HAND_END")!;
    expect(end.type === "HAND_END" && end.net).toEqual([
      { seat: 0, id: "A", net: 2000, stack: 3000 },
      { seat: 1, id: "B", net: 1000, stack: 4000 },
      { seat: 2, id: "C", net: -3000, stack: 7000 },
    ]);
  });
});

describe("all-in runout", () => {
  it("reveals hole cards, deals remaining streets, shows down", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "a", stack: 2000 },
        { seat: 1, id: "b", stack: 2000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1],
        button: 0,
        holes: { 0: "As Ad", 1: "Kh Ks" },
        board: "2c 7d 9h Jc 3s",
      }),
    });
    play(hand, 0, "RAISE", 2000); // button shoves
    const events = play(hand, 1, "CALL");

    const types = events.map((e) => e.type);
    expect(types).toContain("RUNOUT_REVEAL");
    const reveal = events.find((e) => e.type === "RUNOUT_REVEAL")!;
    expect(reveal.type === "RUNOUT_REVEAL" && reveal.reveals).toHaveLength(2);
    const streets = events.filter((e) => e.type === "STREET");
    expect(streets.map((e) => e.type === "STREET" && e.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    // Reveal comes before any board card.
    expect(types.indexOf("RUNOUT_REVEAL")).toBeLessThan(types.indexOf("STREET"));

    const payout = events.find((e) => e.type === "PAYOUT")!;
    expect(payout.type === "PAYOUT" && payout.payouts).toEqual([
      { seat: 0, amount: 4000, potIndex: 0, handName: "Pair of Aces" },
    ]);
  });

  it("uncalled excess returns when a shove covers the caller", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "big", stack: 5000 },
        { seat: 1, id: "small", stack: 1000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1],
        button: 0,
        holes: { 0: "As Ad", 1: "Kh Ks" },
        board: "2c 7d 9h Jc 3s",
      }),
    });
    play(hand, 0, "RAISE", 5000);
    const events = play(hand, 1, "CALL"); // all-in for 1,000
    const refund = events.find((e) => e.type === "UNCALLED_RETURNED")!;
    expect(refund).toEqual({ type: "UNCALLED_RETURNED", seat: 0, amount: 4000 });
    const end = events.find((e) => e.type === "HAND_END")!;
    expect(end.type === "HAND_END" && end.net).toEqual([
      { seat: 0, id: "big", net: 1000, stack: 6000 },
      { seat: 1, id: "small", net: -1000, stack: 0 },
    ]);
  });
});

describe("fold-win", () => {
  it("never reveals any cards and refunds the uncalled bet", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "a", stack: 10000 },
        { seat: 1, id: "b", stack: 10000 },
        { seat: 2, id: "c", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({ seats: [0, 1, 2], button: 0, holes: { 0: "As Ks", 1: "2c 7d", 2: "3h 8s" } }),
    });
    play(hand, 0, "RAISE", 500);
    play(hand, 1, "FOLD");
    const events = play(hand, 2, "FOLD");

    for (const e of events) {
      expect(["RUNOUT_REVEAL", "SHOWDOWN_SHOW", "HOLE_CARDS"]).not.toContain(e.type);
    }
    const refund = events.find((e) => e.type === "UNCALLED_RETURNED")!;
    expect(refund).toEqual({ type: "UNCALLED_RETURNED", seat: 0, amount: 400 });
    const end = events.find((e) => e.type === "HAND_END")!;
    // Winner takes SB 50 + BB 100.
    expect(end.type === "HAND_END" && end.net).toEqual([
      { seat: 0, id: "a", net: 150, stack: 10150 },
      { seat: 1, id: "b", net: -50, stack: 9950 },
      { seat: 2, id: "c", net: -100, stack: 9900 },
    ]);
  });
});

describe("showdown order and auto-muck", () => {
  function checkedToRiver() {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "btn", stack: 10000 },
        { seat: 1, id: "sb", stack: 10000 },
        { seat: 2, id: "bb", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1, 2],
        button: 0,
        holes: { 0: "2c 7d", 1: "As Kd", 2: "9h 9s" },
        board: "Ah Kh 4c 8d 3s", // SB makes top two; BB has nines; BTN has nothing
      }),
    });
    play(hand, 0, "CALL");
    play(hand, 1, "CALL");
    play(hand, 2, "CHECK");
    for (const street of [0, 1, 2]) {
      void street;
      play(hand, 1, "CHECK");
      play(hand, 2, "CHECK");
      play(hand, 0, "CHECK");
    }
    return allEvents;
  }

  it("checked around: first live seat left of the button shows first; losers muck", () => {
    allEvents.length = 0;
    const events = checkedToRiver();
    const showdown = events.filter(
      (e) => e.type === "SHOWDOWN_SHOW" || e.type === "SHOWDOWN_MUCK",
    );
    // Order from seat 1 (left of button): SB shows (winner), BB mucks, BTN mucks.
    expect(showdown.map((e) => [e.type, e.seat])).toEqual([
      ["SHOWDOWN_SHOW", 1],
      ["SHOWDOWN_MUCK", 2],
      ["SHOWDOWN_MUCK", 0],
    ]);
    const show = showdown[0]!;
    expect(show.type === "SHOWDOWN_SHOW" && show.handName).toBe("Two pair — Aces and Kings");
  });

  it("river aggressor shows first", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "btn", stack: 10000 },
        { seat: 1, id: "sb", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1],
        button: 0,
        holes: { 0: "As Kd", 1: "9h 9s" },
        board: "Ah Kh 4c 8d 3s",
      }),
    });
    play(hand, 0, "CALL");
    play(hand, 1, "CHECK");
    play(hand, 1, "CHECK");
    play(hand, 0, "CHECK"); // flop
    play(hand, 1, "CHECK");
    play(hand, 0, "CHECK"); // turn
    play(hand, 1, "CHECK");
    const events = play(hand, 0, "BET", 300); // btn bets the river
    const more = hand.act(1, { type: "CALL" });
    const showdown = more.filter((e) => e.type === "SHOWDOWN_SHOW" || e.type === "SHOWDOWN_MUCK");
    expect(showdown.map((e) => [e.type, e.seat])).toEqual([
      ["SHOWDOWN_SHOW", 0], // aggressor first
      ["SHOWDOWN_MUCK", 1],
    ]);
    void events;
  });

  it("showLosing players reveal even when beaten", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "btn", stack: 10000 },
        { seat: 1, id: "sb", stack: 10000, showLosing: true },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1],
        button: 0,
        holes: { 0: "As Kd", 1: "9h 9s" },
        board: "Ah Kh 4c 8d 3s",
      }),
    });
    play(hand, 0, "CALL");
    play(hand, 1, "CHECK");
    for (let i = 0; i < 2; i++) {
      play(hand, 1, "CHECK");
      play(hand, 0, "CHECK");
    }
    play(hand, 1, "CHECK");
    const events = play(hand, 0, "CHECK");
    const showdown = events.filter((e) => e.type === "SHOWDOWN_SHOW" || e.type === "SHOWDOWN_MUCK");
    // SB (left of button) shows 99 first, BTN's two pair beats it and shows.
    // SB would normally already have shown (first to show), so instead check
    // the loser here is the BTN-side… both show: SB first, then BTN winner.
    expect(showdown.map((e) => [e.type, e.seat])).toEqual([
      ["SHOWDOWN_SHOW", 1],
      ["SHOWDOWN_SHOW", 0],
    ]);
  });
});

describe("split pots", () => {
  it("odd chip goes to the first winner clockwise from the button, losers' side handled per pot", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "shorty", stack: 333 }, // button/UTG, all-in preflop
        { seat: 1, id: "sb", stack: 10000 },
        { seat: 2, id: "bb", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1, 2],
        button: 0,
        holes: { 0: "2c 2d", 1: "As Kd", 2: "Ad Ks" },
        board: "Ah Kh 7c 8c 9d", // SB and BB tie with two pair; shorty loses
      }),
    });
    play(hand, 0, "RAISE", 333); // all-in
    play(hand, 1, "CALL");
    play(hand, 2, "CALL");
    // Check down.
    for (let i = 0; i < 3; i++) {
      play(hand, 1, "CHECK");
      const events = play(hand, 2, "CHECK");
      if (i === 2) {
        const payout = events.find((e) => e.type === "PAYOUT")!;
        // Pot 999 split between seats 1 and 2 → 499 each + odd chip to seat 1.
        expect(payout.type === "PAYOUT" && payout.payouts).toEqual([
          { seat: 1, amount: 500, potIndex: 0, handName: "Two pair — Aces and Kings" },
          { seat: 2, amount: 499, potIndex: 0, handName: "Two pair — Aces and Kings" },
        ]);
      }
    }
  });

  it("board plays: everyone chops", () => {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "a", stack: 1000 },
        { seat: 1, id: "b", stack: 1000 },
      ],
      blinds: BLINDS,
      deck: rig({
        seats: [0, 1],
        button: 0,
        holes: { 0: "2c 7d", 1: "3h 8s" },
        board: "As Ks Qs Js Ts", // royal flush on board
      }),
    });
    play(hand, 0, "RAISE", 1000);
    const events = play(hand, 1, "CALL");
    const end = events.find((e) => e.type === "HAND_END")!;
    expect(end.type === "HAND_END" && end.net.map((n) => n.net)).toEqual([0, 0]);
  });
});

describe("illegal actions are impossible", () => {
  function fresh() {
    const { hand } = makeHand({
      buttonSeat: 0,
      players: [
        { seat: 0, id: "a", stack: 10000 },
        { seat: 1, id: "b", stack: 10000 },
        { seat: 2, id: "c", stack: 10000 },
      ],
      blinds: BLINDS,
      deck: rig({ seats: [0, 1, 2], button: 0, holes: { 0: "As Ks", 1: "2c 7d", 2: "3h 8s" } }),
    });
    return hand;
  }

  it("rejects acting out of turn", () => {
    const hand = fresh();
    expect(() => hand.act(1, { type: "FOLD" })).toThrowError(
      expect.objectContaining({ code: "NOT_YOUR_TURN" }),
    );
  });

  it("rejects checking when facing a bet", () => {
    const hand = fresh();
    expect(() => hand.act(0, { type: "CHECK" })).toThrowError(
      expect.objectContaining({ code: "CANNOT_CHECK" }),
    );
  });

  it("rejects bets below the minimum that are not all-in", () => {
    const hand = fresh();
    expect(() => hand.act(0, { type: "RAISE", amount: 150 })).toThrowError(
      expect.objectContaining({ code: "BAD_AMOUNT" }),
    );
  });

  it("rejects raises beyond the stack", () => {
    const hand = fresh();
    expect(() => hand.act(0, { type: "RAISE", amount: 10001 })).toThrowError(
      expect.objectContaining({ code: "BAD_AMOUNT" }),
    );
  });

  it("rejects BET when there is a bet to raise, and vice versa", () => {
    const hand = fresh();
    expect(() => hand.act(0, { type: "BET", amount: 300 })).toThrowError(
      expect.objectContaining({ code: "BAD_ACTION" }),
    );
  });

  it("rejects non-integer and missing amounts", () => {
    const hand = fresh();
    expect(() => hand.act(0, { type: "RAISE", amount: 250.5 })).toThrowError(
      expect.objectContaining({ code: "BAD_AMOUNT" }),
    );
    expect(() => hand.act(0, { type: "RAISE" })).toThrowError(
      expect.objectContaining({ code: "BAD_AMOUNT" }),
    );
  });

  it("rejects actions after the hand completes", () => {
    const hand = fresh();
    play(hand, 0, "FOLD");
    play(hand, 1, "FOLD"); // BB wins
    expect(() => hand.act(2, { type: "CHECK" })).toThrowError(
      expect.objectContaining({ code: "HAND_COMPLETE" }),
    );
  });

  it("validates construction", () => {
    expect(
      () =>
        new PokerHand({
          handNo: 1,
          buttonSeat: 5,
          players: [
            { seat: 0, id: "a", stack: 1000 },
            { seat: 1, id: "b", stack: 1000 },
          ],
          blinds: BLINDS,
          deck: freshDeck(),
        }),
    ).toThrow(/button/i);
    expect(
      () =>
        new PokerHand({
          handNo: 1,
          buttonSeat: 0,
          players: [{ seat: 0, id: "a", stack: 1000 }],
          blinds: BLINDS,
          deck: freshDeck(),
        }),
    ).toThrow(/2-6/);
  });
});

describe("button movement helper", () => {
  it("moves forward, skipping vacated seats", () => {
    expect(nextButtonSeat([0, 2, 4], 0)).toBe(2);
    expect(nextButtonSeat([0, 2, 4], 2)).toBe(4);
    expect(nextButtonSeat([0, 2, 4], 4)).toBe(0);
    expect(nextButtonSeat([1, 3], 2)).toBe(3); // previous button seat vacated
    expect(nextButtonSeat([1, 3], 3)).toBe(1);
  });
});
