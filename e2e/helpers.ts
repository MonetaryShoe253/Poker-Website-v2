import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = "http://localhost:3001";

/** Full signup → email verify → onboarding; leaves the page in the lobby. */
export async function signupVerifiedUser(
  page: Page,
  request: APIRequestContext,
  nickname: string,
): Promise<{ email: string; nickname: string }> {
  const email = `${nickname.toLowerCase()}@test.local`;
  await page.goto("/auth?mode=signup");
  await page.getByPlaceholder("Nickname (shows on leaderboards)").fill(nickname);
  await page.getByPlaceholder("University or personal email").fill(email);
  await page.getByPlaceholder("Password (8+ characters)").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Reserve my seat" }).click();
  await expect(page).toHaveURL(/check-inbox/);

  const mailbox = await request.get(`${API}/api/dev/mailbox?to=${encodeURIComponent(email)}`);
  const emails = (await mailbox.json()) as Array<{ html: string }>;
  const match = emails[0]!.html.match(/href="([^"]*verify-email[^"]*)"/);
  const verifyUrl = match![1]!.replace(/&amp;/g, "&");

  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/onboarding/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Take this name" }).click();
  await expect(page).toHaveURL(/play/);
  return { email, nickname };
}

/** Open /submit and pick the given session (dev can have a tournament and a
 * cash session open on the same day, which shows a picker). */
export async function openSubmitFor(page: Page, sessionId: string): Promise<void> {
  await page.goto("/submit");
  await expect(page.getByPlaceholder("SESSION CODE")).toBeVisible();
  const picker = page.getByRole("combobox");
  if ((await picker.count()) > 0) await picker.selectOption(sessionId);
}
