/* Measure VPIP/PFR per tier vs targets — used to calibrate TIER_PARAMS. */
import { BOT_TIERS, type BotTier } from "@uos-poker/shared";
import { playBotHand } from "../src/bots/runner";
import { createSeededRng } from "../src/rng";

const HANDS = Number(process.argv[2] ?? 2000);

for (const tier of ["FISH", "CASUAL", "SOLID", "SHARK"] as BotTier[]) {
  const rng = createSeededRng(0xca11b8 + tier.length);
  let vpip = 0;
  let pfr = 0;
  let opportunities = 0;
  for (let h = 0; h < HANDS; h++) {
    const stats = playBotHand({
      seats: [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, tier, stack: 10_000 })),
      buttonSeat: h % 6,
      blinds: { small: 50, big: 100 },
      rng,
      rollouts: 30,
    });
    for (const [, v] of stats.vpipBySeat) {
      opportunities++;
      if (v) vpip++;
    }
    for (const [, p] of stats.pfrBySeat) if (p) pfr++;
  }
  const target = BOT_TIERS[tier];
  console.log(
    `${tier.padEnd(6)} VPIP ${((vpip / opportunities) * 100).toFixed(1).padStart(5)} (target ${(
      target.vpip * 100
    ).toFixed(0)})  PFR ${((pfr / opportunities) * 100).toFixed(1).padStart(5)} (target ${(
      target.pfr * 100
    ).toFixed(0)})`,
  );
}
