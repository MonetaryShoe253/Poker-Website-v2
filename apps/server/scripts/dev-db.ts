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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * On Windows, `prisma generate` replaces the query-engine DLL by renaming a
 * temp file over it — which fails with EPERM if anything (a leftover dev
 * server, the Prisma VS Code extension, a real-time antivirus scan) has the
 * old file briefly locked. Usually transient, so retry a few times before
 * giving up.
 */
function runPrismaCommand(command: string, retries = 4): void {
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `pnpm --filter @uos-poker/server ${command}`]
    : ["-lc", `pnpm --filter @uos-poker/server ${command}`];

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execFileSync(shellExecutable, args, {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
        },
      });
      return;
    } catch (err) {
      if (attempt === retries) {
        if (process.platform === "win32") {
          console.error(
            `\n${command} kept failing after ${retries} attempts — this usually means something ` +
              "still has the Prisma query engine DLL open. Close any other running dev server " +
              "(tsx watch / pnpm dev) and try again; if it persists, check the Prisma VS Code " +
              "extension or antivirus real-time scanning.",
          );
        }
        throw err;
      }
      console.log(`${command} hit a locked file (attempt ${attempt}/${retries}) — retrying in 1.5s…`);
      sleepSync(1500);
    }
  }
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
