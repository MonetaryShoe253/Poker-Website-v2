/**
 * Dev/test Postgres. The machine's system Postgres is 9.5 (unusable for
 * Prisma), so we run real PG 17 binaries via embedded-postgres on :5433
 * with a project-local data dir. Long-running: start it once, leave it up.
 *
 *   pnpm --filter @uos-poker/server db:dev
 */
import EmbeddedPostgres from "embedded-postgres";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const shellExecutable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh";
const shellArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "pnpm --filter @uos-poker/server db:generate"]
  : ["-lc", "pnpm --filter @uos-poker/server db:generate"];

function runPrismaCommand(command: string): void {
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `pnpm --filter @uos-poker/server ${command}`]
    : ["-lc", `pnpm --filter @uos-poker/server ${command}`];

  execFileSync(shellExecutable, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
    },
  });
}

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const dataDir = path.resolve(repoRoot, ".pgdata");
const firstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
const dbUrl = "postgresql://postgres:postgres@localhost:5433/uospoker?schema=public";

function clearStalePostgresLock(): void {
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (!fs.existsSync(pidFile)) return;

  const pidText = fs.readFileSync(pidFile, "utf8").split(/\r?\n/)[0]?.trim();
  const pid = Number(pidText);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {
      // Ignore; the process may already be gone.
    }
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
      } catch {
        // Ignore; the process may already be gone.
      }
    }
  }

  fs.rmSync(pidFile, { force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
});

if (firstRun) {
  console.log("Initialising dev Postgres cluster (first run)…");
  await pg.initialise();
}

clearStalePostgresLock();
await pg.start();
if (firstRun) {
  await pg.createDatabase("uospoker");
}

const prismaEnv = {
  ...process.env,
  DATABASE_URL: dbUrl,
};

console.log("Applying Prisma migrations…");
runPrismaCommand("db:generate");
runPrismaCommand("db:deploy");

console.log("Dev Postgres ready on postgresql://postgres:postgres@localhost:5433/uospoker");
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
