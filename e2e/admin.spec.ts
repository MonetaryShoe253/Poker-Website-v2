import { expect, test, type Page } from "@playwright/test";
import { API, signupVerifiedUser } from "./helpers";

/**
 * P6 gate: session codes display big, submission void/restore, points
 * scheme edit + recompute, and the site-wide banner.
 *
 * The admin account is fixed (ADMIN_EMAIL=adminboss@test.local in the
 * Playwright server env); first run signs it up, later runs sign in.
 */

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/auth");
  await page.getByPlaceholder("University or personal email").fill("adminboss@test.local");
  await page.getByPlaceholder("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Deal me in" }).click();
  try {
    await page.waitForURL(/play/, { timeout: 5_000 });
  } catch {
    // First run: account doesn't exist yet — full signup.
    await signupVerifiedUser(page, page.request, "AdminBoss");
  }
}

test("admin cockpit: codes, void/restore, scheme recompute, banner", async ({ page }) => {
  await signInAsAdmin(page);

  // Give the admin a submission to void: today's test session + API call.
  const sessionRes = await page.request.post(`${API}/api/dev/ensure-test-session`);
  const session = (await sessionRes.json()) as { id: string; code: string };
  await page.request.post(`${API}/api/submissions/tournament`, {
    data: {
      sessionId: session.id,
      code: session.code,
      finishingPosition: 3,
      entrantCount: 12,
    },
  }); // 409 on re-runs is fine — a submission exists either way

  await page.goto("/admin");
  await expect(page.getByText("ADMIN", { exact: false }).first()).toBeVisible();

  // --- Sessions: the code is displayed big for whoever runs the night ----------
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByText(session.code).first()).toBeVisible();

  // --- Submissions: void then restore ------------------------------------------
  await page.getByRole("button", { name: "Submissions" }).click();
  const voidButton = page.getByRole("button", { name: "Void" }).first();
  await expect(voidButton).toBeVisible();
  await voidButton.click();
  const restoreButton = page.getByRole("button", { name: "Restore" }).first();
  await expect(restoreButton).toBeVisible();
  await restoreButton.click();
  await expect(page.getByRole("button", { name: "Void" }).first()).toBeVisible();

  // --- Points scheme: edit + recompute, then put it back -------------------------
  await page.getByRole("button", { name: "Points scheme" }).click();
  const firstPlace = page.getByLabel("Points for position 1");
  await expect(firstPlace).toBeVisible();
  await firstPlace.fill("12");
  await page.getByRole("button", { name: "Save & recompute season" }).click();
  await expect(page.getByText(/recomputed/)).toBeVisible();
  await firstPlace.fill("10");
  await page.getByRole("button", { name: "Save & recompute season" }).click();
  await expect(page.getByText(/recomputed/)).toBeVisible();

  // --- Banner: set, see it site-wide, clear ---------------------------------------
  const bannerMsg = "Pizza at Thursday's session";
  await page.getByRole("button", { name: "Banner", exact: true }).click();
  const bannerInput = page.getByPlaceholder("Site-wide announcement…");
  await bannerInput.fill(bannerMsg);
  await page.getByRole("button", { name: "Set banner" }).click();
  // Input clears only after the PUT resolves and load() reruns — deterministic.
  await expect(bannerInput).toHaveValue("", { timeout: 10_000 });
  await expect(page.getByText("Current banner:")).toContainText("Pizza", { timeout: 10_000 });

  await page.goto("/");
  await expect(page.getByText(bannerMsg)).toBeVisible({ timeout: 10_000 });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Banner", exact: true }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Current banner: none")).toBeVisible({ timeout: 10_000 });
});

test("non-admins are turned away from /admin", async ({ page, request }) => {
  const stamp = Date.now().toString(36);
  await signupVerifiedUser(page, request, `Pleb${stamp}`.slice(0, 16));
  await page.goto("/admin");
  await expect(page.getByText("This room's for the committee.")).toBeVisible();
});
