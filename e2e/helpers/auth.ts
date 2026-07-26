import { expect, type Page } from "@playwright/test";

/**
 * Log in through the real login UI.
 *
 * This is the authentication seam for the whole E2E suite: every later spec
 * that needs a signed-in browser calls this, and nothing anywhere uses
 * `storageState` or hand-signed cookies. If the login flow changes, it changes
 * here once.
 *
 * The contract this pins for the implementation (spec §2.6):
 *
 *   - `/login` renders one clickable control per seeded account, and that
 *     control's accessible name CONTAINS the account's email address. A
 *     `<button>` wrapping the person's name and email satisfies this; a card
 *     labelled only "Sign in" does not.
 *   - Clicking it signs the user in and navigates to `/documents`.
 *
 * The visibility assertion before the click is deliberate: when the card is
 * missing the failure is a readable `toBeVisible` diff naming the locator,
 * rather than a 30-second click timeout that tells you nothing.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");

  const card = page.getByRole("button", { name: email });
  await expect(card).toBeVisible();
  await card.click();

  // An `expect` rather than `waitForURL` so a failure here is also a diff.
  await expect(page).toHaveURL(/\/documents\/?$/);
}
