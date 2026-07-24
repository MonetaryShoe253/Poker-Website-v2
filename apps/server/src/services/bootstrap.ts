import { prisma } from "../db";

export async function ensureTournamentBootstrap(): Promise<void> {
  const defaults = [
    { key: "A", value: "2.5" },
    { key: "B", value: "0.22" },
    { key: "ITM_PERCENT", value: "0.2" },
    { key: "ITM_FLOOR", value: "6" },
    { key: "SIGNOUT_FLOOR", value: "3" },
    { key: "STREAK_BASE", value: "2" },
  ];

  for (const config of defaults) {
    await prisma.formulaConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: { key: config.key, value: config.value },
    });
  }
}
