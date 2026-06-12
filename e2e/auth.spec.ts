import { expect, test } from "@playwright/test";

/**
 * P3 gate: signup → verify (dev mailbox capture) → onboarding → lobby.
 */
test("signup, email verification, onboarding, and landing in the lobby", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@test.local`;
  const nickname = `Hero${stamp}`.slice(0, 16);

  // --- Sign up ----------------------------------------------------------------
  await page.goto("/auth?mode=signup");
  await page.getByPlaceholder("Nickname (shows on leaderboards)").fill(nickname);
  await page.getByPlaceholder("University or personal email").fill(email);
  await page.getByPlaceholder("Password (8+ characters)").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Reserve my seat" }).click();
  await expect(page).toHaveURL(/check-inbox/);
  await expect(page.getByText("CHECK YOUR INBOX")).toBeVisible();

  // --- Verification email lands in the dev mailbox -----------------------------
  const mailbox = await request.get(
    `http://localhost:3001/api/dev/mailbox?to=${encodeURIComponent(email)}`,
  );
  const emails = (await mailbox.json()) as Array<{ subject: string; html: string }>;
  expect(emails.length).toBeGreaterThanOrEqual(1);
  expect(emails[0]!.subject).toContain("Your seat is reserved");

  const match = emails[0]!.html.match(/href="([^"]*verify-email[^"]*)"/);
  expect(match).not.toBeNull();
  const verifyUrl = match![1]!.replace(/&amp;/g, "&");

  // --- Click the link: verified, auto signed in, sent to onboarding ------------
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/onboarding/, { timeout: 15_000 });
  const nickInput = page.getByPlaceholder("Nickname");
  await expect(nickInput).toHaveValue(nickname); // prefilled from signup
  await page.getByRole("button", { name: "Take this name" }).click();

  // --- Landed in the lobby as a real, playable user -----------------------------
  await expect(page).toHaveURL(/play/);
  await expect(page.getByText("THE LOBBY")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play now" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`Playing as ${nickname}`)).toBeVisible();

  // The welcome email followed verification.
  const mailbox2 = await request.get(
    `http://localhost:3001/api/dev/mailbox?to=${encodeURIComponent(email)}`,
  );
  const emails2 = (await mailbox2.json()) as Array<{ subject: string }>;
  expect(emails2.some((m) => m.subject.includes("welcome to UOS Poker"))).toBe(true);
});
