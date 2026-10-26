import { expect, test } from "@playwright/test";
import { API, openSubmitFor, signupVerifiedUser } from "./helpers";

/**
 * P4 gate: submit-with-code lands on the board; wrong code and duplicate
 * submissions are rejected with clear errors.
 */
test("session result submission: wrong code, success, board, duplicate", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const nickname = `Sub${stamp}`.slice(0, 16);
  await signupVerifiedUser(page, request, nickname);

  // A session for today with an open window (dev-only helper).
  const sessionRes = await request.post(`${API}/api/dev/ensure-test-session`);
  const session = (await sessionRes.json()) as { id: string; code: string };
  expect(session.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

  // --- Wrong code is rejected with a helpful error -----------------------------
  await openSubmitFor(page, session.id);
  await page.getByPlaceholder("SESSION CODE").fill("222222");
  await page.getByPlaceholder("Your finish (e.g. 3)").fill("2");
  await page.getByPlaceholder("Total entrants").fill("10");
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText(/doesn't match tonight's session/)).toBeVisible();

  // --- Correct code lands the result ------------------------------------------
  await page.getByPlaceholder("SESSION CODE").fill(session.code);
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText("RESULT IN")).toBeVisible();

  // --- It's on the board (points come from the admin-tunable ICM formula, so
  // only assert the row shows up with a positive points total) ---------------
  await page.getByRole("link", { name: "See the leaderboards" }).click();
  await expect(page).toHaveURL(/leaderboards/);
  const row = page.getByRole("row", { name: new RegExp(nickname) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(2)).toHaveText(/^[1-9]\d*$/);

  // --- Duplicate is rejected at the database level ------------------------------
  await openSubmitFor(page, session.id);
  await page.getByPlaceholder("SESSION CODE").fill(session.code);
  await page.getByPlaceholder("Your finish (e.g. 3)").fill("1");
  await page.getByPlaceholder("Total entrants").fill("10");
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText(/already submitted/)).toBeVisible();
});
