import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

/**
 * Authentication, the session cookie and the two route refusals that are
 * provable before any document route exists.
 *
 * The guard's own denial statuses (viewer -> 403 on write, no-role -> 404,
 * non-owner -> 403 on share) are NOT API-observable in this child: there is no
 * `/api/documents/:id` handler until child #6. They land in children #6 and #7.
 */

const ADA = { email: "ada@ajaia.test", name: "Ada Lovelace" };

/** The logout control child #4 must keep when it replaces the page body. */
const LOGOUT = /log ?out/i;

test("an unauthenticated visitor to /documents is redirected to /login", async ({
  page,
}) => {
  await page.goto("/documents");

  await expect(page).toHaveURL(/\/login\/?$/);
});

test("signing in as a seeded account lands on /documents with a name and a logout control", async ({
  page,
}) => {
  await loginAs(page, ADA.email);

  await expect(page).toHaveURL(/\/documents\/?$/);
  await expect(page.getByText(ADA.name).first()).toBeVisible();
  await expect(page.getByRole("button", { name: LOGOUT })).toBeVisible();
});

test("logging out returns to /login and leaves /documents protected again", async ({
  page,
}) => {
  await loginAs(page, ADA.email);

  await page.getByRole("button", { name: LOGOUT }).click();
  await expect(page).toHaveURL(/\/login\/?$/);

  await page.goto("/documents");
  await expect(page).toHaveURL(/\/login\/?$/);
});

test("POST /api/auth/login with an unknown email is refused and sets no session cookie", async ({
  request,
}) => {
  const response = await request.post("/api/auth/login", {
    data: { email: "mallory@ajaia.test" },
  });

  expect(response.status()).toBe(401);

  const { cookies } = await request.storageState();
  expect(cookies.find((cookie) => cookie.name === "session")).toBeUndefined();
});

test("GET /api/documents/:id without a session cookie is refused with 401 JSON", async ({
  request,
}) => {
  const response = await request.get("/api/documents/anything");

  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: expect.any(String) });
});
