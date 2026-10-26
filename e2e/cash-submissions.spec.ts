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
