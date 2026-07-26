# Collaborative Document Editor — Runbook

**Date:** 2026-07-26 · **Amended after stress-test rounds 1–4**
**Spec:** `docs/specs/2026-07-26-collab-doc-editor-design.md`
**Repo:** `verygreenboi/ai-assignment` (all children land here)

Read the spec first — §2.3 (permission model, **both guard signatures and
`DocAccessError.status`**), §2.4 (API contract), §2.5 (versioning) and §2.9
(testing) are the contracts every child is written against. Where this runbook and
the spec disagree, **the spec wins**; report the conflict in the PR.

## Conventions for every child

- **Outside-in TDD, no exceptions — and the red→green cycle runs in the
  pipeline.** Start at the outermost layer the child can reach (Playwright > API
  integration > unit). Every child's PR carries at least two pushes:

  1. **`test:` commit — the child's tests only**, plus any config or scaffolding
     without which there is no pipeline to run them. Push, open the PR as a
     **draft**, and let `ci` go **RED**. That run is the durable evidence the
     tests failed before any implementation existed — something a local run can
     never prove to a reader of the PR.
  2. **`feat:` commit — the minimum that turns `ci` GREEN.** Then `gh pr ready`,
     run the pre-PR reviews on the diff, and merge.

  **The red must fail for the *right* reason.** Read the failed run before
  writing a line of implementation: it must be the expected assertion failure —
  not a missing dependency, import error, type error, or config mistake. A red
  for the wrong reason means the test does not yet guard the behaviour: fix the
  test, push, and get a correct red first. An uninspected red proves nothing.

  Run `npm run lint && npm run typecheck` locally before each push. Do **not**
  run the test suites locally as a gate — that is the pipeline's job now.
- **API integration tests cover denial paths only** (spec §2.9). Happy paths are
  E2E's job. Where a denial test needs a successful call to set it up (child 6's
  409 needs a prior 200), that is sequencing, not a happy-path test.
- **Every E2E spec is self-contained.** It creates its own per-run-unique data and
  its own shares. Playwright runs spec files in parallel workers with no ordering
  guarantee, and `globalSetup` reseeds but never deletes — so documents accumulate
  across runs. **Any title you assert on must be per-run-unique**
  (`` `thing-${Date.now()}` ``), or run 2 hits a strict-mode locator failure that
  surfaces as an unrelated red in a later child.
- **Branch:** `feat/<n>-<slug>` off `main`. **Commits:** Conventional Commits, no
  AI-attribution trailers in commits or PR bodies.
- **Before marking the PR ready:** `ci` green on the latest head, both pre-PR
  reviews clean. `--auto` is armed only after that — never on the red push, which
  would merge tests with no implementation the moment CI passed.
- **Scope discipline:** build the child's deliverable and stop. The *only*
  exception is the add-back rule below.
- **Human handoffs are explicit.** Children 1, 8 and 10 contain steps an
  autonomous session cannot perform. Never fake or skip them; never block a PR on
  them.

### The clock — `docs/CLOCK.md`

An autonomous driver has no session-spanning clock, so elapsed time lives in a
committed file or not at all.

**Every child except 10 appends exactly one line in its PR** (child 10 has no PR;
it appends via its `docs:` commit to `main`):

```
child-3: 47m (started 2026-07-26T14:02Z, pr-ready 2026-07-26T14:49Z)
```

Timestamps via `date -u +%Y-%m-%dT%H:%MZ`. Minutes are wall clock within the
session.

**Blowing your budget does not abort the child.** Finish the smallest green slice,
apply your cut floor, flag the overrun in the PR body.

**Checkpoint — child 4's merge.** Sum the minutes. If > 155, append to `CLOCK.md`
via a `docs:` commit straight to `main`:

```
CUTS-FIRED: no add-backs
```

**The add-back rule — the one sanctioned exception to scope discipline.** A child
may implement the topmost item on spec §5's add-back list that falls inside its
own surface **only if** all three hold: its base deliverable is green; it has ≥10
unused budget minutes; `CLOCK.md` has no `CUTS-FIRED` line. Otherwise, do not.
Children 4, 5 and 7 have items on that list; children 5, 6 and 7 **must read
`docs/CLOCK.md` before writing any test.**

### Time budget

| # | Child | Budget | Cumulative |
|---|---|---|---|
| 1 | Scaffold, toolchain, CI | 40m | 40m |
| 2 | Schema, migrations, seed | 30m | 70m |
| 3 | Auth, session, permission model | 45m | 115m |
| 4 | Document CRUD and dashboard | 40m | 155m ⏱ |
| 5 | Sharing — grant with role | 30m | 185m |
| 6 | Rich-text editor and autosave | 65m | 250m |
| 7 | File import (.txt) | 25m | 275m |
| 8 | Production deploy | 30m | 305m |
| 9 | Submission documents | 35m | 340m |
| 10 | Video and Drive bundle *(human)* | 30m | 370m |

**≈ 6h10m** — the fourth estimate; the first two were fiction. Assumes
denial-path-only integration tests.

Each child's **Verify** section lists the commands that must pass; under the
CI-first cycle above those are what the `ci` job runs on the PR, not a local
gate. Budgets count hands-on time, not the wall-clock spent waiting on a
pipeline — two CI round-trips per child (red, then green) add real elapsed time
that these numbers do not include. `docs/CLOCK.md` records actual minutes, and
`docs/AI-WORKFLOW.md` reports what it says.

### Pinned facts (verified empirically 2026-07-26 — do not re-derive)

| Fact | Value |
|---|---|
| `create-next-app@latest` / `next` | **16.2.12** — Turbopack default |
| Middleware file | **`src/proxy.ts`**, default or named `proxy` export; **Node** runtime by default; a `runtime` config in a proxy file throws |
| `@tiptap/starter-kit` | **3.29.0 — already bundles Underline.** Do NOT install `@tiptap/extension-underline` |
| `StarterKit.configure` | `{ heading: { levels: [1,2,3] } }` valid on v3 |
| `Extensions` type | exported by `@tiptap/core` (`= AnyExtension[]`) |
| Vitest | **4.1.10 — `environmentMatchGlobs` REMOVED.** Use `test.projects`; `fileParallelism` honoured per-project |
| Playwright `globalSetup` | config option taking a **file path** whose module default-exports `(config: FullConfig) => Promise<void>` |
| `docker compose up -d --wait` | real; waits for `running\|healthy` |
| Drizzle driver | `drizzle-orm/node-postgres` everywhere. Never `neon-http`, never edge |

### Shared environment (established by child 1, used by all)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/collab_docs
SESSION_SECRET=dev-secret-change-me-at-least-32-chars
```

`docker compose up -d --wait` starts **postgres:16** as service **`db`** on host
port **5433**. `cp .env.example .env` is part of child 1.

**Next auto-loads `.env`; Vitest and `tsx` do not.** Anything run outside Next —
integration tests, `scripts/seed.ts`, migrations — must load it explicitly
(`import 'dotenv/config'` at the entry point, and `setupFiles: ['dotenv/config']`
on the Vitest node project). Child 2 owns wiring this; without it every
integration test fails on an undefined `DATABASE_URL`.

---

## Child 1 — Scaffold, toolchain, CI · *40m*

**Intent.** A running Next.js app with a test harness that can express a failing
test, and CI that runs it.

**In play.** `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`,
`src/app/page.tsx`, `README.md`, `vitest.config.ts`, `playwright.config.ts`,
`docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.gitignore`,
`docs/CLOCK.md`.

**Build.**

1. **Scaffold non-interactively, in a temp dir** — `create-next-app` refuses a
   non-empty directory (`CLAUDE.md`, `.agents/`, `docs/` are here) and otherwise
   prompts:
   ```
   npx create-next-app@latest scaffold-tmp \
     --ts --eslint --tailwind --app --src-dir --use-npm --yes \
     --import-alias '@/*' --disable-git
   ```
   `--disable-git` matters: without it you move a nested `.git` into a repo that
   already has one. Move the contents to the repo root (merging, not overwriting,
   `.gitignore`), delete `scaffold-tmp`. Keep Turbopack.
2. Scripts: `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`,
   `"test:e2e": "playwright test"`. None exist until you add them.
3. Vitest 4 + `@vitejs/plugin-react`, using **`test.projects`** (an array under
   `test` in `defineConfig`) — `environmentMatchGlobs` was removed in v4:
   - node: `{ name: 'integration', environment: 'node',
     include: ['**/*.integration.test.ts'], fileParallelism: false }`
   - jsdom: `{ name: 'unit', environment: 'jsdom',
     exclude: ['**/*.integration.test.ts', 'e2e/**', '**/node_modules/**'] }`

   **The `exclude` is not optional.** A jsdom project on Vitest's default
   `include` also matches `*.integration.test.ts`, so those files run in *both*
   projects and the node-only ones fail. Verified empirically.
4. Playwright: `webServer.command` = `npm run dev` locally, `npm run build &&
   npm run start` when `process.env.CI`; port 3000;
   `reuseExistingServer: !process.env.CI`.
5. `docker-compose.yml`: service **`db`**, image `postgres:16`, host port 5433,
   credentials as above, named volume, `pg_isready` healthcheck.
6. `.env.example` with **both** variables; `cp .env.example .env`. Confirm
   `.gitignore` covers `.env` and `.env*.local` — **this repo is public.**
7. `.github/workflows/ci.yml`, job id **`ci`** (the required check): checkout,
   node 22, `npm ci`, a `postgres:16` service container with a health check, then
   lint → typecheck → test → `npx playwright install --with-deps chromium` →
   test:e2e. Children 2 and 3 extend this file.
8. `docs/CLOCK.md` with a one-line header and this child's entry.
9. **Vercel link — human handoff.** If `VERCEL_TOKEN` is set:
   `vercel link --yes --token $VERCEL_TOKEN`. If absent, **record in the PR body**:
   *"Human: run `vercel login && vercel link`, then connect the GitHub repo in the
   Vercel dashboard."* Do not block the PR — deploy is child 8.

**TDD order.** `src/lib/app-info.test.ts` asserting an `appName()` helper, and
`e2e/smoke.spec.ts` asserting the root page renders a known heading. Both red
first, then green. Throwaway harness proofs.

**Verify.** `docker compose up -d --wait && npm run lint && npm run typecheck &&
npm run test && npm run test:e2e`; `docker compose exec db psql -U postgres -d
collab_docs -c 'select 1'`; CI green on the PR.

**Gates.** `reviewer-can-run-it`.

---

## Child 2 — Schema, migrations, seed · *30m*

**Intent.** The three tables exist, migrate cleanly onto an empty database, and a
seed script produces the demo state.

**Blocked by:** 1.

**In play.** `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`,
`drizzle/*.sql`, `scripts/seed.ts`, `src/test/db.ts`, `vitest.config.ts` *(adds
`setupFiles: ['dotenv/config']` to the node project)*, `playwright.config.ts`
*(adds `globalSetup`)*, `e2e/global-setup.ts`, `package.json` (adds
`db:generate`, `db:migrate`, `db:seed`), `.github/workflows/ci.yml`,
`src/db/schema.integration.test.ts`, `docs/CLOCK.md`.

**Build.** Drizzle schema exactly as spec §2.2 — every FK `onDelete: 'cascade'`,
`unique(document_id, user_id)` on `document_shares`, `role` constrained to
`viewer|editor`, indexes on `documents.owner_id` and `document_shares.user_id`.
`src/db/client.ts` exports a single `db` on `drizzle-orm/node-postgres`.

**Env loading.** `scripts/seed.ts` and the migration entry point start with
`import 'dotenv/config'`; the Vitest node project gets
`setupFiles: ['dotenv/config']`. Next loads `.env` on its own — nothing else does.

**Seed** (`scripts/seed.ts`), idempotent — keyed on email for users and
`(owner_id, title)` for documents: three users — `ada@ajaia.test` (Ada Lovelace),
`grace@ajaia.test` (Grace Hopper), `alan@ajaia.test` (Alan Turing) — plus two
documents owned by Ada with **distinct, stable titles**, one already shared with
Grace as `viewer` so *Shared with me* is non-empty on a reviewer's first login.

The seed is demo state for humans. **E2E specs never assert on it as their
subject** — they create their own data (see Conventions).

**`src/test/db.ts` — the shared harness** (children 3–7 import it):

```ts
export async function resetDb(): Promise<void>      // TRUNCATE the THREE app tables only, RESTART IDENTITY CASCADE
export async function seedBaseline(): Promise<void> // the three users only
```

`resetDb` must **not** truncate Drizzle's migrations journal — that breaks
`db:migrate` on the next run.

**`e2e/global-setup.ts`** default-exports an async function running
`db:migrate && db:seed`, wired via `playwright.config.ts`'s `globalSetup` (a file
path). Child 1 created that config; this child adds the one option.

**CI.** Add `DATABASE_URL` to the `ci` job env and `npm run db:migrate &&
npm run db:seed` before the test steps, or the required check goes red from here.

**TDD order.** Integration tests against real Postgres, red first:
1. two shares for the same `(document_id, user_id)` violate the unique constraint;
2. `role = 'admin'` is rejected by the check constraint;
3. deleting a document cascades away its shares;
4. deleting a user cascades away their owned documents;
5. `npm run db:seed` twice leaves exactly 3 users, 2 documents **and 1 share**.

*Acknowledged exception to "fails for the right reason":* before the schema exists
these fail as "relation does not exist". That is the only available red for a
schema child — note it in the PR.

**Verify.** `docker compose down -v && docker compose up -d --wait &&
npm run db:migrate && npm run db:seed && npm run db:seed && npm run test &&
npm run test:e2e`. Running `test:e2e` here proves the `globalSetup` wiring and its
idempotence — the only spec that exists is child 1's smoke test, so it does not
yet prove suite re-runnability; that arrives with children 4–7's specs.

**Gates.** `db-migration-safety`, `reviewer-can-run-it`.

---

## Child 3 — Auth, session, and the permission model · *45m*

**Intent.** The server knows who you are and what you may do. No product UI beyond
login.

**Blocked by:** 2.

**In play.** `src/lib/session.ts`, `src/lib/permissions.ts`,
`src/lib/require-doc-access.ts`, `src/app/api/auth/login/route.ts`,
`src/app/api/auth/logout/route.ts`, `src/app/login/page.tsx`,
`src/app/documents/page.tsx` *(placeholder)*, `src/proxy.ts`,
`e2e/helpers/auth.ts`, `.github/workflows/ci.yml`, tests alongside, `docs/CLOCK.md`.

**Build — session.** HS256 JWT via `jose` signed with `SESSION_SECRET`; cookie
`session`, httpOnly, sameSite=lax, `secure` in production, 7-day expiry, path `/`.
`SESSION_SECRET` is read once at module load and **throws at boot if absent**.
`src/lib/session.ts` exports `createSessionCookie`, `readSession`, and
`requireSession(request: Request): Promise<SessionUser>` — the last is named by the
authz gate and consumed by children 4 and 7, so it is pinned here. Add
`SESSION_SECRET` to the `ci` job env (child 1 already put it in `.env.example`).

Login page lists the seeded accounts as clickable cards with a visible "Demo mode
— pick a seeded account, no password required" note.

`src/proxy.ts` (default or named `proxy` export) matches `/documents/:path*` and
`/api/documents/:path*`, redirecting unauthenticated page requests to `/login` and
returning 401 JSON for API requests. Signature verification only — it **must never
import `src/db/client.ts`**.

**Build — permissions.** Exactly spec §2.3. `resolveRole` is **pure** —
`(userId, document, share | null) => Role | null`, no I/O.
`src/lib/require-doc-access.ts` exports **both** guards over one shared joined
query and one `resolveRole` + `can` call:

```ts
requireDocAccess(request: Request, documentId: string, capability: Capability)
loadDocumentForPage(documentId: string, capability: Capability)  // reads cookies() from next/headers
```

A server component has no `Request` — that is why the second door exists; child 6's
editor page uses it. Both throw `DocAccessError` with `.status: 401 | 403 | 404`.
Also export `toErrorResponse(err)` mapping it to a `NextResponse` with body
`{ error: string }`.

**Two seams this child owns for everyone downstream:**
- `src/app/documents/page.tsx` — a **placeholder** server component rendering the
  session user's name and a logout button. Child 4 replaces its body **but must
  keep the name and logout control**, which this child's `auth.spec.ts` asserts on
  permanently. Without the placeholder, this child's own E2E asserts against a 404
  and fails for the wrong reason.
- `e2e/helpers/auth.ts` — `export async function loginAs(page: Page, email:
  string): Promise<void>`, driving the real login UI. **Every later E2E spec uses
  it**; multi-user specs open a second context via `browser.newContext()`.

**TDD order.**
1. `e2e/auth.spec.ts` (red first): `/documents` unauthenticated → `/login`;
   `loginAs(page, 'ada@ajaia.test')` → `/documents` showing her name; logout →
   `/login` and `/documents` protected again.
2. Unit: all twelve cells of {owner, editor, viewer, none} × {read, write, share}
   asserted **explicitly, not in a loop**, so a failure names the exact cell. Leave
   a comment at the 404-vs-403 case naming why it must stay 404 (spec §2.3).
3. API integration (denial paths): login with an unknown email → 401, no
   `Set-Cookie`; `readSession` null for a cookie signed with a different secret, an
   expired token, and garbage; `requireDocAccess` → 401 missing session, 404
   nonexistent id, **404** existing-document-no-share, 403 viewer+`write`.

**Verify.** `npm run test && npm run test:e2e`. Confirm nothing outside
`permissions.ts` / `require-doc-access.ts` decides access:
`grep -rn "ownerId ===" src/ | grep -v src/lib/permissions` returns nothing.

**Gates.** `authz-enforcement` — carve-out: `/api/auth/login` and `/logout` are the
session entry points and cannot call `requireSession`; they satisfy the gate by
touching no document data and having their own denial test.
`reviewer-can-run-it` (edits `ci.yml`).

---

## Child 4 — Document CRUD and dashboard · *40m*  ⏱ **checkpoint child**

**Intent.** Create, list and rename documents, and a dashboard that visibly
separates *My documents* from *Shared with me*.

**Blocked by:** 3.

**In play.** `src/app/api/documents/route.ts`,
`src/app/api/documents/[id]/route.ts`, `src/lib/validation.ts`,
`src/app/documents/page.tsx` *(replaces child 3's placeholder body, keeping its
name + logout control)*, `src/components/document-list.tsx`,
`src/components/empty-state.tsx`, tests alongside, `docs/CLOCK.md`.

**Read `docs/CLOCK.md` before writing any test** (add-back rule).

**Build.** Handlers per spec §2.4. `GET /api/documents` returns `{ owned, shared }`
— two queries; rows carry `id`, `title`, `updatedAt`, `version`, and on `shared`
also `role` and `ownerName`. (`version` is on the row because child 6's rename and
autosave must send it.) `PATCH` handles **title** here (content is child 6) and
implements the version guard from spec §2.5, returning `409 { error,
currentVersion }`. Zod validates every body; title trimmed, 1–200 chars, empty →
`Untitled document`.

**There is no `DELETE`** — deletion is out of scope (spec §5) and sits on the
add-back list.

Dashboard: two labelled sections. *Shared with me* rows show the owner's name and a
role badge (`Viewer` / `Editor`). Empty states are written, not blank — "No
documents yet. Create one or import a file to get started."

**TDD order.**
1. `e2e/documents.spec.ts` (red first), using `loginAs`: Ada creates a document,
   renames it to a **per-run-unique title** (`` `renamed-${Date.now()}` ``),
   reloads, and that title persists — assert on the unique title, never a count,
   because earlier runs' documents survive `globalSetup`. Grace sees the seeded
   shared document under *Shared with me* with an owner name and a `Viewer` badge,
   and **not** in her *My documents*.
2. API integration (denial paths): `PATCH` by a viewer → 403; `PATCH` with a stale
   version → 409 carrying `currentVersion`; 300-char title → 400; unauthenticated
   → 401.
3. Unit: the Zod title schema (trim, empty → default, over-length rejected).

**Verify.** `npm run test && npm run test:e2e && npm run test:e2e` (twice — this is
the first child whose specs mutate data, so re-runnability is now real).

**⏱ On merge: sum `docs/CLOCK.md`. If > 155 minutes, append `CUTS-FIRED:
no add-backs`** via a `docs:` commit straight to `main`.

**Gates.** `authz-enforcement`.

---

## Child 5 — Sharing: grant with a role · *30m*

**Intent.** An owner grants another seeded user access at a chosen role, from the
dashboard.

**Blocked by:** 4.

**In play.** `src/app/api/documents/[id]/shares/route.ts` (GET, POST),
`src/components/share-dialog.tsx`, `src/lib/validation.ts` (share schemas),
`src/components/document-list.tsx` *(adds a Share button to owned rows — extend
child 4's component, do not restructure it)*, tests alongside, `docs/CLOCK.md`.

**Read `docs/CLOCK.md` before writing any test.** Sharing lives on the dashboard
row, not the editor header (spec §2.8) — this child does not touch the editor.

**Build.** A **Share** button on each owned row opens a dialog: email input + role
select (`Viewer` / `Editor`) + a read-only list of who already has access. POST
requires the `share` capability.

Errors surface in the dialog, not swallowed: unknown email → *"No user with that
email. This demo has three seeded accounts."*; self → *"You already own this
document."*; duplicate → *"Already shared with that person."* Handle the duplicate
on the **unique-constraint violation** as well as the pre-check, so a race cannot
500.

**Cut floor — grant-with-a-role and the dashboard role badge never go to zero.**
Role change and revoke are not part of the base deliverable (spec §3). They are the
top two items on spec §5's add-back list and this child owns both — build them only
under the add-back rule.

**TDD order.**
1. `e2e/sharing.spec.ts` (red first), self-contained: Ada creates a document with a
   per-run-unique title and shares it with Grace as `viewer` and Alan as `editor`
   through the dialog. Grace (second context, `loginAs`) finds it under *Shared
   with me* with a `Viewer` badge; Alan finds it with an `Editor` badge; neither
   sees it under *My documents*. (Editor-role *enforcement* is child 6's half —
   spec §2.9.)
2. API integration (denial paths): POST `/shares` by a non-owner editor → 403; by a
   viewer → 403; unknown email → 404; self-share → 400; duplicate → 409.
3. Unit: the share Zod schema (email lowercased and trimmed; role ∈ `viewer|editor`).

**Verify.** `npm run test && npm run test:e2e && npm run test:e2e`; run it by hand
in two browser profiles.

**Gates.** `authz-enforcement`.

---

## Child 6 — Rich-text editor and autosave · *65m*

**Intent.** The editing experience: formatting, inline rename, autosave with a
truthful indicator, and a real read-only mode for viewers.

**Blocked by:** 5.

**In play.** `src/app/documents/[id]/page.tsx`, `src/components/editor.tsx`,
`src/components/toolbar.tsx`, `src/components/save-indicator.tsx`,
`src/lib/tiptap-extensions.ts`, `src/hooks/use-autosave.ts`,
`src/app/api/documents/[id]/route.ts` *(extends PATCH to accept `content`)*,
`package.json` (adds TipTap deps), tests alongside, `docs/CLOCK.md`.

**Read `docs/CLOCK.md` before writing any test.**

**Build.** `@tiptap/starter-kit@3` configured `{ heading: { levels: [1,2,3] } }` —
bold, italic, bullet and ordered lists, **and Underline, which v3's StarterKit
already includes.** Do not install `@tiptap/extension-underline`.

`src/lib/tiptap-extensions.ts` exports exactly:
```ts
import type { Extensions } from '@tiptap/core'
export const extensions: Extensions = [ /* StarterKit configured */ ]
```

**The page is a server component** and uses
`loadDocumentForPage(documentId, 'read')` from `src/lib/require-doc-access.ts`
(child 3) — **not** `requireDocAccess`, which needs a `Request` a server component
does not have. Catch `DocAccessError` and call `notFound()` when `.status === 404`;
let the rest propagate.

Toolbar buttons reflect `editor.isActive(...)`, are keyboard-reachable, and carry
`aria-pressed`.

Autosave: debounce 800 ms after the last keystroke, plus a forced flush on blur and
on `visibilitychange → hidden`. Indicator states are honest — `Saving…`, `All
changes saved`, `Couldn't save — retrying`, and on 409 `Couldn't save — this
document changed elsewhere. Reload.` **There is no separate banner component**
(spec §2.5); the indicator carries the 409 message.

Read-only: when `role === 'viewer'`, mount with `editable: false`, hide the
toolbar, show a "You have view-only access" bar. The API already refuses the write
(child 4) — this is the UI half of a control enforced on both sides.

Title rename is an inline input in the header that PATCHes on blur/Enter, sending
the loaded `version`.

**TDD order.**
1. `e2e/editor.spec.ts` (red first), **self-contained — never reuse the seeded
   share and never depend on `sharing.spec.ts` having run** (parallel workers, no
   ordering guarantee). Setup: `loginAs` Ada, create a document with a
   per-run-unique title, and grant Grace `viewer` and Alan `editor` via
   `POST /api/documents/:id/shares` using the authenticated context's `request`
   fixture — the dialog UI is already covered by `sharing.spec.ts`. Then: Ada
   types, applies bold and a bulleted list, waits for "All changes saved",
   hard-reloads, and both survive; Grace opens it — no toolbar, not editable; Alan
   opens it, edits, saves; Ada reloads and sees his text.
2. API integration: `PATCH` with `version: 1` → 200 (version becomes 2); a
   **second** `PATCH` also sending `version: 1` → 409 with `currentVersion: 2`, and
   the stored content is the first writer's. (The opening 200 is setup for the
   denial assertion, not a happy-path test — see Conventions.)
3. Unit: `use-autosave` collapses a burst into one call and flushes immediately on
   explicit `flush()`; the save-state machine transitions idle → saving → saved →
   (error) correctly.

**Verify.** `npm run test && npm run test:e2e && npm run test:e2e`. Manually: open
one document in two tabs, save in both, confirm the 409 message rather than silent
loss.

**Gates.** `authz-enforcement`.

---

## Child 7 — File import (.txt → document) · *25m*

**Intent.** Upload a plain-text file and land inside a new, editable document.

**Blocked by:** 6.

**In play.** `src/app/api/documents/import/route.ts`, `src/lib/import.ts`,
`src/components/import-button.tsx`, `src/app/documents/page.tsx` *(mounts the
import control — extend child 4's page, do not restructure it)*,
`src/lib/import.test.ts`, `e2e/import.spec.ts`, `docs/CLOCK.md`.

**Read `docs/CLOCK.md` before writing any test.** `.md` import is not part of the
base deliverable (spec §3); it is the last item on the add-back list and this child
owns it.

**Build.** Multipart POST, field `file`. Server-side validation in order: extension
is `.txt` → declared MIME plausible → byte length ≤ 1 MB. The `accept` attribute is
a hint; the server is the control. Import validation lives in `src/lib/import.ts`,
keeping `src/lib/validation.ts` for document and share schemas.

`parseUpload(filename, bytes)` is **pure**, returning `{ title, content }`: one
ProseMirror paragraph per line; title = filename without extension. Handle CRLF and
an empty file.

UI states the supported type and cap next to the control ("Plain text (.txt), up to
1 MB") and renders rejections inline. Status codes: wrong type → **415**, too large
→ **413**. **README wording is child 9's job** — do not edit `README.md` here; note
the required sentence in the PR body.

**Cut floor — `.txt` import never goes to zero.** File upload is a core graded
requirement.

**TDD order.**
1. `e2e/import.spec.ts` (red first): Ada uploads a `.txt` with per-run-unique
   content; she lands in the editor with the text as paragraphs; the title came
   from the filename (make the filename per-run-unique too); it appears under *My
   documents* on return. Uploading a `.pdf` (**generate a dummy buffer in the
   test — do not commit a fixture**) shows the supported-type error and creates
   nothing.
2. API integration (denial paths): oversized → 413 and no row (**generate the
   oversized buffer in the test**); `.pdf` → 415 and no row; unauthenticated → 401.
3. Unit: `parseUpload` for multi-line text, an empty file, and CRLF endings.

**Verify.** `npm run test && npm run test:e2e && npm run test:e2e`; manually import
a real `.txt`.

**Gates.** `authz-enforcement`.

---

## Child 8 — Production deploy · *30m*

**Intent.** A live URL a stranger can open, verified by hand.

**Blocked by:** 7.

**In play.** Vercel + Neon configuration, `docs/screenshots/`, `docs/CLOCK.md`.

**Build.** **The Neon project already exists — do not create one.** Use the
pre-provisioned **pooled** string for `DATABASE_URL` and the **direct/unpooled**
string for migrations (migrating through pgbouncer can fail).

*If `VERCEL_TOKEN` is present:* `vercel env add` for `DATABASE_URL` (pooled) and a
freshly generated `SESSION_SECRET`; run `npm run db:migrate && npm run db:seed`
against the **direct** URL; `vercel deploy --prod`.

*If absent — STOP and hand off*, with this checklist in the PR body: (1) set
`DATABASE_URL` (pooled) and a fresh `SESSION_SECRET` in Vercel → Production; (2)
run migrate + seed against the **direct** Neon URL; (3) promote and paste the URL
back. Then resume for verification only. **Never commit a connection string or
secret — this repo is public.**

**TDD order.** No product code, so no new automated tests. The manual verification
*is* the deliverable.

**Verify (against the live URL, in two browser profiles).** Login as Ada → create →
format → refresh → intact. Import a `.txt`. Share with Grace as viewer and Alan as
editor → Grace sees it under *Shared with me* and cannot edit → Alan edits → Ada
sees it. Log out; re-run in a private window to confirm nothing depends on local
state. Capture **three** screenshots into `docs/screenshots/`: dashboard (both
sections populated), editor with the toolbar active, share dialog.

Record the live URL — children 9 and 10 quote it.

**Gates.** `reviewer-can-run-it`.

---

## Child 9 — Submission documents · *35m*

**Intent.** The written deliverables. Graded directly, not a formality.

**Blocked by:** 8.

**In play.** `README.md`, `docs/ARCHITECTURE.md`, `docs/AI-WORKFLOW.md`,
`SUBMISSION.md`, `docs/VIDEO-SCRIPT.md`, `docs/VIDEO.txt`, `docs/CLOCK.md`.

**Build.**

- **README.md** — what it is; the live URL; the three seeded accounts; local setup
  verbatim-runnable (`npm ci` → `cp .env.example .env` → `docker compose up -d
  --wait` → `npm run db:migrate` → `npm run db:seed` → `npm run dev`); how to run
  both suites; **the supported upload type (.txt) and the 1 MB cap**; a short
  "what's intentionally not here" list.
- **docs/ARCHITECTURE.md** — one page: stack and why; data model; the permission
  model including the 404-not-403 decision and the two-doors-one-brain guard;
  optimistic versioning; testing strategy; and spec §3's rejected alternatives a
  paragraph each — **including the presigned-URL attachment design that was costed
  and cut**, the strongest single tradeoff story in the submission.
- **docs/AI-WORKFLOW.md** — honest and specific: which tools; where AI genuinely
  saved time; **what was rejected or rewritten**, with concrete cases — adversarial
  review rounds caught that `create-next-app@latest` now scaffolds Next 16 not 15,
  that TipTap v3's StarterKit already bundles Underline, that `marked` has no
  `sanitize` option, that Vitest 4 removed `environmentMatchGlobs`, and that a
  guard signature could not be called from a server component; the first two time
  budgets were fiction and were rewritten twice — and how correctness was verified
  (failing-test-first, denial-path integration tests, the two-profile manual
  smoke). **Read `docs/CLOCK.md` and state the real elapsed build time.**
- **SUBMISSION.md** — exactly what is included, file by file; live URL; seeded
  accounts; video link; and **What works / What is incomplete / What I'd build next
  with 2–4 hours** (spec §5, in priority order).
- **docs/VIDEO-SCRIPT.md** — **bullet points, not prose**: shot list following child
  8's smoke path, timed to land **between 3 and 5 minutes**.
- **docs/VIDEO.txt** — `TODO(human): paste unlisted walkthrough URL`.

**TDD order.** No product code. The check is executable instead: `git clone` the
repo into a clean temp directory and follow the README verbatim through to
`npm run dev`. Confirm every command quoted exists in `package.json`, and that
`.env.example` covers every `process.env` read in `src/`
(`grep -rn "process.env" src/`).

**Verify.** Fresh-clone walkthrough passes; every link resolves from a logged-out
browser.

**Gates.** `reviewer-can-run-it`.

---

## Child 10 — Walkthrough video and Drive bundle *(human-led)* · *30m*

**Intent.** The two deliverables no agent can produce.

**Blocked by:** 9.

**HUMAN HANDOFF — no PR, no CI signal.** Done-criteria:

1. Record the walkthrough from `docs/VIDEO-SCRIPT.md`. **Check the 3-minute floor
   as well as the 5-minute ceiling.** Upload unlisted to Loom or YouTube.
2. Replace the `TODO(human)` in `docs/VIDEO.txt` with the URL, and append this
   child's `CLOCK.md` line, in one `docs:` commit straight to `main`.
3. Create the Google Drive folder and populate it exactly as SUBMISSION.md lists:
   source (repo link or zip), `README.md`, `docs/ARCHITECTURE.md`,
   `docs/AI-WORKFLOW.md`, `SUBMISSION.md`, `docs/VIDEO.txt`, `docs/screenshots/`.
4. Set the folder to "anyone with the link can view".
5. **From a logged-out browser**, open every link — Drive folder, live URL, video —
   and confirm each resolves. Log in to the live app as Ada with no prior session
   and complete one share, confirming the seeded state survived.

**Verify.** All five steps done. **Close the child with a comment containing the
Drive folder URL and the video URL** — that comment is the only machine-visible
evidence the epic completed.

---

## Dependency graph

```
1 scaffold → 2 schema+seed → 3 auth+permissions → 4 crud+dashboard ⏱
  → 5 sharing → 6 editor+autosave → 7 import → 8 deploy → 9 docs → 10 video+Drive (human)
```

Fully linear, deliberately. Earlier drafts claimed parallel children; every claim
hid a shared file (the editor page, the dashboard, `validation.ts`). For a solo
build of this size the coordination cost of real parallelism exceeded its benefit,
and a linear chain makes the clock checkpoint meaningful — cumulative minutes are
unambiguous.

**Cut floors:** `.txt` import and grant-with-a-role never go to zero — both are
core graded requirements, not stretches. Children 1–4 and 8–10 are non-negotiable:
an app that is not deployed and not documented fails the brief regardless of how
good the editor is.
