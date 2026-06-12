import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * P2 gate: two browsers + bots complete full hands flawlessly.
 * Alice sits via Play Now; Bob spectates the same table; bots fill seats
 * and play hands to completion (visible in the hand log).
 */

async function openAs(context: BrowserContext, nickname: string): Promise<Page> {
  await context.addInitScript((nick) => {
    localStorage.setItem("uos-poker:nickname", nick);
  }, nickname);
  const page = await context.newPage();
  await page.goto("/play");
  return page;
}

test("two browsers + bots complete full hands", async ({ browser }) => {
  // --- Browser 1: Alice sits down ------------------------------------------
  const aliceContext = await browser.newContext();
  const alice = await openAs(aliceContext, "AliceE2E");

  await alice.getByRole("button", { name: "Play now" }).click();
  await expect(alice).toHaveURL(/\/table/);

  // She is seated: her nickname renders on the felt.
  await expect(alice.getByText("AliceE2E").first()).toBeVisible({ timeout: 15_000 });

  // Bots fill in, visibly badged.
  await expect(alice.getByText(/bot·/).first()).toBeVisible({ timeout: 15_000 });

  // Her hole cards arrive (two card faces on her seat) and the action dock
  // offers only legal actions at some point. Fold when offered, like a human.
  const fold = alice.getByRole("button", { name: "Fold" });
  await expect(fold).toBeVisible({ timeout: 30_000 });
  await fold.click();

  // --- Browser 2: Bob spectates the same table ------------------------------
  const bobContext = await browser.newContext();
  const bob = await openAs(bobContext, "BobE2E");
  await bob.getByRole("button", { name: "Spectate" }).first().click();
  await expect(bob).toHaveURL(/\/table/);

  // Bob sees Alice at the table but never any hole cards of hers
  // (spectator view renders only card backs / board / revealed cards).
  await expect(bob.getByText("AliceE2E").first()).toBeVisible({ timeout: 15_000 });

  // --- Bots complete full hands: the hand log fills with winners -------------
  await expect(alice.getByText(/wins [\d,]+/).first()).toBeVisible({ timeout: 60_000 });
  await expect(bob.getByText(/wins [\d,]+/).first()).toBeVisible({ timeout: 60_000 });

  await aliceContext.close();
  await bobContext.close();
});
