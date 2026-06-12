import { BOT_TIERS, computeEloDeltas, type EloParticipant } from "@uos-poker/shared";
import { prisma } from "../db";
import type { HandSettlement } from "../realtime/table";

/**
 * Persists a completed hand: HandRecord always (when real humans played),
 * plus atomic Elo updates + EloHistory for rated hands. Bots are anchors;
 * dev-door users are treated as anchors at 1000 and never persisted.
 */
export async function persistSettlement(settlement: HandSettlement): Promise<void> {
  const realHumans = settlement.players.filter(
    (p) => p.userId !== null && !p.userId.startsWith("dev:"),
  );
  if (realHumans.length === 0) return; // bot-only or dev-only: nothing to keep

  await prisma.$transaction(async (tx) => {
    let eloDeltas: Record<string, number> | null = null;

    if (settlement.rated) {
      const profiles = await tx.profile.findMany({
        where: { userId: { in: realHumans.map((p) => p.userId!) } },
      });
      const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

      const participants: EloParticipant[] = settlement.players.map((p) => {
        if (p.userId && profileByUser.has(p.userId)) {
          const profile = profileByUser.get(p.userId)!;
          return {
            id: p.userId,
            rating: profile.elo,
            net: p.net,
            anchored: false,
            ratedHands: profile.ratedHands,
          };
        }
        return {
          id: p.botId ?? p.userId ?? `seat-${p.seat}`,
          rating: p.botTier ? BOT_TIERS[p.botTier].elo : 1000,
          net: p.net,
          anchored: true,
          ratedHands: 0,
        };
      });

      const deltas = computeEloDeltas(participants);
      eloDeltas = {};
      for (const profile of profiles) {
        const delta = deltas.get(profile.userId) ?? 0;
        eloDeltas[profile.userId] = delta;
        const newRating = profile.elo + delta;
        await tx.profile.update({
          where: { userId: profile.userId },
          data: { elo: newRating, ratedHands: profile.ratedHands + 1 },
        });
        await tx.eloHistory.create({
          data: {
            userId: profile.userId,
            delta,
            ratingAfter: newRating,
            handCount: profile.ratedHands + 1,
          },
        });
      }
    }

    await tx.handRecord.create({
      data: {
        tableId: settlement.tableId,
        tableName: settlement.tableName,
        handNo: settlement.handNo,
        players: settlement.players.map((p) => ({
          seat: p.seat,
          userId: p.userId,
          botId: p.botId,
          nickname: p.nickname,
          startingStack: p.startingStack,
          net: p.net,
        })),
        winners: settlement.winners,
        potSize: settlement.potSize,
        board: settlement.board,
        summary: settlement.summary,
        rated: settlement.rated,
        ...(eloDeltas ? { eloDeltas } : {}),
      },
    });
  });
}

/** Prune hand records older than 7 days (full logs aren't kept long). */
export async function pruneOldHandRecords(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  await prisma.handRecord.deleteMany({
    where: { createdAt: { lt: cutoff }, rated: false },
  });
  // Rated records keep their summary rows (boards/history need them) but
  // drop bulky action logs.
  await prisma.handRecord.updateMany({
    where: { createdAt: { lt: cutoff }, actionLog: { not: { equals: null } } },
    data: { actionLog: null as never },
  });
}
