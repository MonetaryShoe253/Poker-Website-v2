/* Replay the seeded simulation until the first failure and dump that hand. */
import { PokerHand, type EngineEvent, type LegalActions } from "../src/hand";
import { createSeededRng, type Rng } from "../src/rng";

function chaosAction(legal: LegalActions, rng: Rng): { type: string; amount?: number } {
  const options: Array<() => { type: string; amount?: number }> = [];
  if (legal.fold) options.push(() => ({ type: "FOLD" }));
  if (legal.check) options.push(() => ({ type: "CHECK" }), () => ({ type: "CHECK" }));
  if (legal.call) options.push(() => ({ type: "CALL" }), () => ({ type: "CALL" }));
  if (legal.bet) {
    const { minTo, maxTo } = legal.bet;
    options.push(() => ({ type: "BET", amount: minTo + rng.nextInt(maxTo - minTo + 1) }));
    options.push(() => ({ type: "BET", amount: minTo }));
    options.push(() => ({ type: "BET", amount: maxTo }));
  }
  if (legal.raise) {
    const { minTo, maxTo } = legal.raise;
    options.push(() => ({ type: "RAISE", amount: minTo + rng.nextInt(maxTo - minTo + 1) }));
    options.push(() => ({ type: "RAISE", amount: maxTo }));
  }
  return options[rng.nextInt(options.length)]!();
}

const rng = createSeededRng(0xdecade);
for (let handNo = 1; handNo <= 10_000; handNo++) {
  const playerCount = 2 + rng.nextInt(5);
  const seats: number[] = [];
  while (seats.length < playerCount) {
    const s = rng.nextInt(6);
    if (!seats.includes(s)) seats.push(s);
  }
  seats.sort((a, b) => a - b);
  const players = seats.map((seat) => ({
    seat,
    id: `p${seat}`,
    stack: 20 + rng.nextInt(20_000),
    showLosing: rng.nextInt(10) === 0,
  }));
  const buttonSeat = seats[rng.nextInt(seats.length)]!;

  const log: Array<{ seat: number; action: unknown } | { event: EngineEvent }> = [];
  try {
    const hand = new PokerHand({ handNo, buttonSeat, players, blinds: { small: 50, big: 100 }, rng });
    for (const event of hand.drainEvents()) log.push({ event });
    let actions = 0;
    while (!hand.isComplete) {
      const seat = hand.currentActionSeat;
      const action = chaosAction(hand.legalActions(seat), rng);
      log.push({ seat, action });
      for (const event of hand.act(seat, action as never)) log.push({ event });
      if (++actions > 200) throw new Error("non-terminating");
    }
  } catch (err) {
    console.log(`Hand ${handNo} FAILED: ${(err as Error).message}`);
    console.log("players:", JSON.stringify(players), "button:", buttonSeat);
    for (const entry of log) {
      if ("event" in entry) {
        const e = entry.event;
        if (e.type !== "HOLE_CARDS" && e.type !== "ACTION_ON") console.log("  evt", JSON.stringify(e));
      } else {
        console.log("ACT seat", entry.seat, JSON.stringify(entry.action));
      }
    }
    process.exit(1);
  }
}
console.log("no failures");
