/** Screenshot a live table (desktop + mobile) including a showdown moment. */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../.screenshots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const [w, h, label] of [
  [1280, 900, "desktop"],
  [360, 780, "mobile"],
]) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  await context.addInitScript(() => localStorage.setItem("uos-poker:nickname", "ShotBot"));
  const page = await context.newPage();
  await page.goto("http://localhost:5173/play", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Play now" }).click();
  await page.waitForURL(/table/);
  // Wait for cards on the felt, then catch a winner moment if possible.
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outDir, `table-mid-${label}.png`) });
  try {
    await page.getByText(/wins/).first().waitFor({ timeout: 25000 });
    await page.screenshot({ path: path.join(outDir, `table-showdown-${label}.png`) });
  } catch {
    console.log(`no showdown caught (${label})`);
  }
  await context.close();
}
await browser.close();
console.log("table shots done");
