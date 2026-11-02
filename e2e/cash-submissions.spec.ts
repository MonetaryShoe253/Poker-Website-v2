import { expect, test } from "@playwright/test";
import { API, openSubmitFor, signupVerifiedUser } from "./helpers";

/**
 * Thursday cash night: submit buy-in + cash-out with the code, land on the
 * Thursday board for the current season with the right net.
 */
test("cash result submission: needs both fields, lands on the Thursday board", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const nickname = `Cash${stamp}`.slice(0, 16);
  await signupVerifiedUser(page, request, nickname);

  const sessionRes = await request.post(`${API}/api/dev/ensure-test-session`, {
    data: { type: "CASH" },
  });
  const session = (await sessionRes.json()) as { id: string; code: string; type: string };
  expect(session.type).toBe("CASH");

  await openSubmitFor(page, session.id);
  await expect(page.getByText("Thursday cash game")).toBeVisible();

  const submit = page.getByRole("button", { name: "Submit result" });
  await page.getByPlaceholder("SESSION CODE").fill(session.code);
  await page.getByLabel("Total bought in").fill("1000");
  // An empty cash-out must not go up as a 0-chip result.
  await expect(submit).toBeDisabled();
  await page.getByLabel("Chips at the end").fill("1450");
  await expect(page.getByText("+450")).toBeVisible();
  await submit.click();
  await expect(page.getByText("RESULT IN")).toBeVisible();

  // The Thursday tab defaults to the current season, not all-time.
  await page.goto("/leaderboards");
  await page.getByRole("button", { name: "Thursday · Net chips" }).click();
  await expect(page.locator("select").first().locator("option:checked")).toContainText("(current)");
  const row = page.getByRole("row", { name: new RegExp(nickname) });
  await expect(row).toContainText("+450");
  await expect(row).toContainText("New");
});

/**
 * The QR code on the admin Sessions tab links to /submit?session=…&code=….
 * A brand-new player scanning it must end up back on that form after
 * sign-up, email verification and onboarding, with the code already in.
 */
test("QR link: new player signs up and lands on a prefilled cash form", async ({
  page,
  request,
}) => {
  const sessionRes = await request.post(`${API}/api/dev/ensure-test-session`, {
    data: { type: "CASH" },
  });
  const session = (await sessionRes.json()) as { id: string; code: string };

  await page.goto(`/submit?session=${session.id}&code=${session.code}`);
  await page.getByRole("link", { name: "Create an account" }).click();

  const stamp = Date.now().toString(36);
  const nickname = `Qr${stamp}`.slice(0, 16);
  const email = `${nickname.toLowerCase()}@test.local`;
  await page.getByPlaceholder("Nickname (shows on leaderboards)").fill(nickname);
  await page.getByPlaceholder("University or personal email").fill(email);
  await page.getByPlaceholder("Password (8+ characters)").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Reserve my seat" }).click();
  await expect(page).toHaveURL(/check-inbox/);

  const mailbox = await request.get(`${API}/api/dev/mailbox?to=${encodeURIComponent(email)}`);
  const emails = (await mailbox.json()) as Array<{ html: string }>;
  const verifyUrl = emails[0]!.html.match(/href="([^"]*verify-email[^"]*)"/)![1]!.replace(/&amp;/g, "&");
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/onboarding/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Take this name" }).click();

  await expect(page).toHaveURL(/\/submit\?session=/);
  await expect(page.getByPlaceholder("SESSION CODE")).toHaveValue(session.code);
  await expect(page.getByText("Thursday cash game")).toBeVisible();
  await page.getByLabel("Total bought in").fill("1000");
  await page.getByLabel("Chips at the end").fill("700");
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText("RESULT IN")).toBeVisible();
});
