import { expect, test } from "@playwright/test";

test("root page renders the application heading", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Collab Docs",
  );
});
