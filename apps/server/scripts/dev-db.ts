/**
 * Dev/test Postgres. The machine's system Postgres is 9.5 (unusable for
 * Prisma), so we run real PG 17 binaries via embedded-postgres on :5433
 * with a project-local data dir. Long-running: start it once, leave it up.
 *
 *   pnpm --filter @uos-poker/server db:dev
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.resolve(import.meta.dirname, "../../../.pgdata");
const firstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

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
await pg.start();
if (firstRun) {
  await pg.createDatabase("uospoker");
}
console.log("Dev Postgres ready on postgresql://postgres:postgres@localhost:5433/uospoker");
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
