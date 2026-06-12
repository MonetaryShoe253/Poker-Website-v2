/**
 * Renders the branded OG card (1200×630, wordmark on steel) to public/og.png
 * using Playwright's bundled Chromium. Run: node scripts/generate-og.mjs
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const html = `<!doctype html>
<html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background: linear-gradient(160deg, #14171B 0%, #0A0B0D 70%);
    display: flex; align-items: center; justify-content: center;
    font-family: Arial, Helvetica, sans-serif; overflow: hidden;
  }
  .card { text-align: center; position: relative; }
  .rail {
    position: absolute; left: 50%; transform: translateX(-50%); top: -52px;
    width: 540px; height: 2px;
    background: linear-gradient(90deg, transparent, #FF2D40 18%, #FF2D40 82%, transparent);
    box-shadow: 0 0 18px 2px rgba(255,45,64,.5);
  }
  .spade { font-size: 120px; color: #2A2F36; text-shadow: 0 1px 0 rgba(255,255,255,.06); position: relative; }
  .spade::after {
    content: "♠"; position: absolute; inset: 0; color: transparent;
    -webkit-text-stroke: 2px rgba(255,45,64,.85); transform: scale(.62) translateY(-6px);
  }
  h1 { margin-top: 12px; font-size: 88px; letter-spacing: 22px; color: #D7DCE3; font-weight: 700; }
  h1 b { color: #FF2D40; font-weight: 700; }
  p { margin-top: 18px; font-size: 28px; letter-spacing: 6px; color: #8B93A1; text-transform: uppercase; }
  .rail2 { margin: 40px auto 0; width: 540px; height: 2px;
    background: linear-gradient(90deg, transparent, #FF2D40 18%, #FF2D40 82%, transparent);
    box-shadow: 0 0 18px 2px rgba(255,45,64,.5);
  }
</style></head>
<body>
  <div class="card">
    <div class="rail"></div>
    <div class="spade">♠</div>
    <h1>UOS <b>POKER</b></h1>
    <p>University of Sheffield Poker Society</p>
    <div class="rail2"></div>
  </div>
</body></html>`;

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../public/og.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log(`OG card written to ${out}`);
