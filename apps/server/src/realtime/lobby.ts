import { SCALING, TABLE_NAMES, type BotTier, type LobbyStatePayload } from "@uos-poker/shared";
import type { BotPersonality } from "@uos-poker/engine";
import { Table, DEFAULT_TIMING, type TableTiming } from "./table";

/**
 * The lobby: registry of live tables + the auto-scaling rules.
 *
 * - At least one public table always exists.
 * - Spawn a new public table when open seats across all public tables < 2.
 * - Despawn a table after 5 minutes with zero humans (never the last one).
 * - Practice tables are private, unrated, excluded from scaling, and die
 *   when their owner leaves.
 */
export class Lobby {
  private tables = new Map<string, Table>();
  private scalingTimer: ReturnType<typeof setInterval> | null = null;
  onChanged: (() => void) | null = null;
  onTableCreated: ((table: Table) => void) | null = null;
  private scaling: { spawnWhenOpenSeatsBelow: number; despawnAfterHumanlessMs: number };

  constructor(
    private timing: TableTiming = DEFAULT_TIMING,
    scaling?: Partial<{ spawnWhenOpenSeatsBelow: number; despawnAfterHumanlessMs: number }>,
  ) {
    this.scaling = {
      spawnWhenOpenSeatsBelow: scaling?.spawnWhenOpenSeatsBelow ?? SCALING.spawnWhenOpenSeatsBelow,
      despawnAfterHumanlessMs: scaling?.despawnAfterHumanlessMs ?? SCALING.despawnAfterHumanlessMs,
    };
  }

  start(scalingIntervalMs = 10_000): void {
    this.ensurePublicTable();
    this.scalingTimer = setInterval(() => this.runScaling(), scalingIntervalMs);
  }

  stop(): void {
    if (this.scalingTimer) clearInterval(this.scalingTimer);
    for (const table of this.tables.values()) table.close();
  }

  get(tableId: string): Table | undefined {
    const table = this.tables.get(tableId);
    return table && !table.isClosed ? table : undefined;
  }

  publicTables(): Table[] {
    return [...this.tables.values()].filter((t) => !t.isPractice && !t.isClosed);
  }

  allTables(): Table[] {
    return [...this.tables.values()].filter((t) => !t.isClosed);
  }

  /** The public table with the most humans that still has a free seat. */
  playNowTarget(): Table {
    const candidates = this.publicTables()
      .filter((t) => t.freeSeatCount() > 0)
      .sort((a, b) => b.humanCount() - a.humanCount());
    return candidates[0] ?? this.spawnPublicTable();
  }

  createPracticeTable(ownerUserId: string, tier: BotTier, botCount: number): Table {
    const table = this.spawn({
      name: `Practice — ${tier.charAt(0)}${tier.slice(1).toLowerCase()}`,
      isPractice: true,
      ownerUserId,
    });
    const personalities: BotPersonality[] = ["STANDARD", "ROCK", "STATION", "MANIAC"];
    for (let i = 0; i < botCount; i++) {
      table.addBot(tier, personalities[i % personalities.length]!);
    }
    return table;
  }

  /** Practice tables die when the owner walks away. */
  ownerLeft(table: Table): void {
    if (table.isPractice) table.close();
  }

  buildLobbyState(playersOnline: number): LobbyStatePayload {
    return {
      tables: this.publicTables().map((t) => ({
        tableId: t.id,
        name: t.name,
        humans: t.humanCount(),
        bots: t.botCount(),
        spectators: t.spectatorCount(),
        avgPot: t.averagePot(),
        seatsFree: t.freeSeatCount(),
        isPractice: false,
      })),
      playersOnline,
    };
  }

  ensurePublicTable(): Table {
    const existing = this.publicTables();
    if (existing.length > 0) return existing[0]!;
    return this.spawnPublicTable();
  }

  private spawnPublicTable(): Table {
    const used = new Set(this.publicTables().map((t) => t.name));
    const name =
      TABLE_NAMES.find((n) => !used.has(n)) ?? `Table ${this.publicTables().length + 1}`;
    return this.spawn({ name });
  }

  private spawn(opts: { name: string; isPractice?: boolean; ownerUserId?: string }): Table {
    const table = new Table(opts, this.timing);
    table.onChanged = () => this.onChanged?.();
    this.tables.set(table.id, table);
    this.onTableCreated?.(table);
    table.start();
    this.onChanged?.();
    return table;
  }

  runScaling(): void {
    // Spawn when open human seats run low.
    const open = this.publicTables().reduce((sum, t) => sum + t.freeSeatCount(), 0);
    if (open < this.scaling.spawnWhenOpenSeatsBelow) {
      this.spawnPublicTable();
    }
    // Despawn long-humanless tables (never the last public one).
    const now = Date.now();
    const publics = this.publicTables();
    for (const table of publics) {
      if (this.publicTables().length <= 1) break;
      if (
        table.humanlessSince !== null &&
        now - table.humanlessSince > this.scaling.despawnAfterHumanlessMs
      ) {
        table.close();
      }
    }
    // Drop closed tables from the registry once their loop ends.
    for (const [id, table] of this.tables) {
      if (table.isClosed) {
        void table.waitForClose().then(() => {
          this.tables.delete(id);
          this.onChanged?.();
        });
      }
    }
    this.onChanged?.();
  }
}
