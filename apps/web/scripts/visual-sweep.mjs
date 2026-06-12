/**
 * P5 visual checklist helper: screenshots every page at desktop (1280×900)
 * and mobile (360×780). Assumes dev servers are running (vite :5173, api :3001).
 * Output: .screenshots/
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../.screenshots");
fs.mkdirSync(outDir, { recursive: true });

const pages = [
  ["home", "/"],
  ["society", "/society"],
  ["sessions", "/sessions"],
  ["learn", "/learn"],
  ["leaderboards", "/leaderboards"],
  ["play", "/play"],
  ["auth", "/auth"],
  ["submit", "/submit"],
  ["notfound", "/this-hand-is-dead"],
];

const browser = await chromium.launch();
for (const [w, h, label] of [
  [1280, 900, "desktop"],
  [360, 780, "mobile"],
]) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  for (const [name, url] of pages) {
    await page.goto(`http://localhost:5173${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, `${name}-${label}.png`), fullPage: false });
  }
  // Table view as a spectator (after a hand has run).
  await page.goto("http://localhost:5173/play", { waitUntil: "networkidle" });
  await context.close();
}
await browser.close();
console.log(`Screenshots in ${outDir}`);
