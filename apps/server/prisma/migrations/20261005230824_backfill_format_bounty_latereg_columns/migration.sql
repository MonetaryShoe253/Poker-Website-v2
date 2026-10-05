-- Hotfix: a prior production deploy appears to have applied an earlier
-- version of the init migration before these columns were added to it
-- (the init migration was edited in place several times this branch,
-- which only works for databases that have never actually run it — not
-- the case here). Prisma's generated client expects these columns to
-- exist on every default (unselected) query, so their absence causes a
-- raw "column does not exist" error on effectively any Series/Session/
-- SessionEntry read, surfacing as a 500.
--
-- Written defensively (IF NOT EXISTS / exception-swallowed enum create)
-- so it's safe to apply regardless of exactly which of these already
-- exist in production — anything missing gets added, anything already
-- present is left untouched. No further migrations should edit the old
-- init migration in place; from here on, schema changes get their own
-- new migration file like this one.

-- CreateEnum (idempotent — Postgres has no native CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
    CREATE TYPE "TournamentFormat" AS ENUM ('REGULAR', 'BOUNTY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: series
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "lateRegWindowMinutes" INTEGER;

-- AlterTable: session
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "lateRegWindowMinutes" INTEGER;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "format" "TournamentFormat" NOT NULL DEFAULT 'REGULAR';

-- AlterTable: session_entry
ALTER TABLE "session_entry" ADD COLUMN IF NOT EXISTS "bountiesCollected" INTEGER;
ALTER TABLE "session_entry" ADD COLUMN IF NOT EXISTS "bountyPoints" DOUBLE PRECISION;
