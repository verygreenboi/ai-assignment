# Collaborative Document Editor — Design

**Date:** 2026-07-26
**Status:** Approved for build (amended after stress-test rounds 1–3)
**Epic:** Ajaia AI-Native Full Stack Developer assignment

---

## 1. Problem

Ajaia's brief asks for a lightweight, Google-Docs-inspired collaborative document
editor, built and submitted inside a **4–6 hour timebox**. The brief is explicit
that it is grading *product judgment and prioritisation* at least as hard as it
grades code:

> "We are evaluating product judgment as much as implementation skill. Strong
> candidates usually make deliberate scope cuts and explain them clearly."

So the real problem is not "how much of Google Docs can we clone". It is:

**Which coherent product slice, shipped to a URL a stranger can open, best
demonstrates full-stack judgment under a hard deadline — and can the reasoning
behind every cut be defended out loud?**

The required capabilities are fixed by the brief: document create/rename/edit/
save/reopen with rich text; at least one product-relevant file upload; a working
share model with owner + grantee + a visible owned-vs-shared distinction;
persistence across refresh; and an engineering-quality floor (setup docs, live
deploy, validation and error handling, ≥1 meaningful automated test, an
architecture note). Everything beyond that is ours to choose or refuse.

The failure mode we are designing against is the classic take-home death spiral:
starting real-time collaborative editing, getting 70% of a CRDT working, and
submitting an app where nothing is finished and the demo video is an apology.

**The plan is budgeted at ~6h across 9 children** (§6). It got there by being cut
three times against adversarial review, and the cuts are recorded in §3 and §5
because they are part of the deliverable, not an embarrassment to hide.

---

## 2. Chosen approach

A **single Next.js 16 application** (App Router, TypeScript, Node runtime),
persisting to **Postgres via Drizzle ORM**, deployed to **Vercel** with a **Neon**
database. Rich text is **TipTap v3** (ProseMirror), stored as ProseMirror JSON in
a `jsonb` column. Identity is **seeded users with an email-only login** writing a
signed httpOnly cookie.

> **Version pins are load-bearing.** `create-next-app@latest` scaffolds Next
> **16** (Turbopack default; `middleware.ts` renamed `proxy.ts`, defaulting to the
> **Node** runtime). `@tiptap/starter-kit@3.x` **already bundles Underline** — do
> not add `@tiptap/extension-underline`. **Vitest 4 removed
> `environmentMatchGlobs`** — use `test.projects`, and give the jsdom project an
> explicit `exclude` or integration files run twice. Every one of these was a
> wrong assumption in an earlier draft, caught by adversarial review before any
> code was written.

### 2.1 The three areas we go deep on

Depth over coverage, per the brief:

1. **A correctly enforced authorization model.** One resolver, one guard, every
   route through it, denial paths tested, 404-not-403 so document existence never
   leaks. Roles are `owner` / `editor` / `viewer` from day one — not bolted on at
   the end. This is the dimension where a half-measure reads as a real security
   bug rather than a scope cut, so it gets no half-measures.
2. **An editing experience that feels coherent.** Bold / italic / underline /
   H1–H3 / bulleted + numbered lists, an always-visible toolbar with active
   states, inline title rename, debounced autosave with a truthful save-state
   indicator, and a genuine read-only mode for viewers rather than a
   disabled-looking editable one.
3. **A file import that is actually part of the workflow.** Upload a `.txt` and it
   becomes a real, editable document you land inside — not an attachment blob
   sitting next to a document.

### 2.2 Data model

```
users              id uuid pk
                   email text unique not null
                   name text not null
                   created_at timestamptz not null default now()

documents          id uuid pk
                   owner_id uuid not null -> users(id) on delete cascade
                   title text not null default 'Untitled document'
                   content jsonb not null default '{"type":"doc","content":[]}'
                   version integer not null default 1
                   created_at timestamptz not null default now()
                   updated_at timestamptz not null default now()
                   index (owner_id)

document_shares    id uuid pk
                   document_id uuid not null -> documents(id) on delete cascade
                   user_id uuid not null -> users(id) on delete cascade
                   role text not null check (role in ('viewer','editor'))
                   created_at timestamptz not null default now()
                   unique (document_id, user_id)
                   index (user_id)
```

Three tables is the whole model. `document_shares` being a separate table (rather
than an array column on `documents`) is what makes "shared with me" a cheap
indexed query.

`content` is ProseMirror JSON, not HTML. It is the editor's native format, so
round-tripping is lossless and we never sanitize untrusted HTML on the way back
into the editor.

### 2.3 Permission model

A single pure resolver plus a single guard. Nothing else in the codebase decides
access.

```ts
type Role = 'owner' | 'editor' | 'viewer'
type Capability = 'read' | 'write' | 'share'

resolveRole(userId, doc, share): Role | null
  doc.ownerId === userId        -> 'owner'
  share?.userId === userId      -> share.role
  otherwise                     -> null

can(role, capability)
  read   -> role !== null
  write  -> role === 'owner' || role === 'editor'
  share  -> role === 'owner'
```

**Two entry points, one brain.** Route handlers and server components reach the
same logic by different doors, because an App Router server component has no
`Request` object:

```ts
// route handlers
requireDocAccess(request: Request, documentId: string, capability: Capability):
  Promise<{ user: SessionUser; document: Document; role: Role }>

// server components — reads the cookie via next/headers cookies()
loadDocumentForPage(documentId: string, capability: Capability):
  Promise<{ user: SessionUser; document: Document; role: Role }>
```

Both live in `src/lib/require-doc-access.ts`, share the one joined query and the
one `resolveRole` + `can` call, and throw the same `DocAccessError`. Two doors,
never two implementations.

```ts
class DocAccessError extends Error {
  readonly status: 401 | 403 | 404
}
```

`.status` is the discriminator every consumer branches on — route handlers map it
via `toErrorResponse`, and the editor page turns `404` into `notFound()`.

| Situation | Status |
|---|---|
| No / invalid session cookie | `401` |
| Document does not exist | `404` |
| Document exists, caller has no role | `404` *(deliberate — see below)* |
| Caller has a role but lacks the capability | `403` |

**404 for no-access is deliberate.** Returning 403 would confirm that a document
id exists, letting anyone enumerate the id space. A caller with zero relationship
to a document should not be able to tell "does not exist" from "not yours". A
caller who *does* hold a role gets an honest 403, because they already know the
document exists.

Errors render as `{ error: string }`, plus `currentVersion` on the 409 path (§2.5).

### 2.4 API contract

All handlers live under `src/app/api/`, run on the Node runtime, and validate
bodies with Zod before touching the database.

| Method | Path | Capability | Notes |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | `{ email }`; 401 on unknown email |
| `POST` | `/api/auth/logout` | — | clears cookie, 204 |
| `GET` | `/api/documents` | session | `{ owned: [], shared: [] }` — two lists, deliberately |
| `POST` | `/api/documents` | session | creates empty owned doc, 201 `{ id }` |
| `GET` | `/api/documents/:id` | read | includes caller's `role`, `ownerName`, `version` |
| `PATCH` | `/api/documents/:id` | write | `{ title?, content?, version }`, 409 `{ error, currentVersion }` if stale |
| `GET` | `/api/documents/:id/shares` | read | collaborator list |
| `POST` | `/api/documents/:id/shares` | share | `{ email, role }` |
| `POST` | `/api/documents/import` | session | multipart `.txt`, 201 `{ id }` |

`GET /api/documents` returning `{ owned, shared }` as two arrays rather than one
flat list with an `isOwner` flag is a small decision with a real payoff: the
owned-vs-shared distinction the brief asks for becomes structural, and the
dashboard cannot accidentally render them as one undifferentiated pile.

### 2.5 Concurrency: the cheap half of the honest answer

Every document carries an integer `version`. `PATCH` sends the version the client
loaded; the server updates `WHERE id = ? AND version = ?` and bumps it. Zero rows
affected means someone else saved first — the server returns `409` with
`currentVersion`, and the **existing save indicator** renders "Couldn't save —
this document changed elsewhere. Reload."

This is last-write-wins with a **stale-write guard**. It cannot merge concurrent
edits, but it can never silently destroy them either. We kept the server-side
guard (~15 min, and it is the part that prevents data loss) and cut the dedicated
reload-banner component that an earlier draft specified — the save indicator
already had an error state, so a second UI surface was pure cost.

### 2.6 Authentication

Three seeded users (`ada@ajaia.test`, `grace@ajaia.test`, `alan@ajaia.test`). The
login page lists them as clickable cards; clicking one POSTs the email and the
server sets a `session` cookie — an HS256 JWT (`jose`) signed with
`SESSION_SECRET`, httpOnly, sameSite=lax, secure in production, 7-day expiry.

Mocked identity is a **stated** simplification, surfaced in the login UI itself
("Demo mode — pick a seeded account"), the README, and the architecture note. A
reviewer can demo the entire sharing flow in two browser profiles in under thirty
seconds, which is worth more to this submission than a real password flow would be.

`src/proxy.ts` (Next 16's rename of `middleware.ts`, defaulting to the Node
runtime) matches `/documents/:path*` and `/api/documents/:path*`, redirecting
unauthenticated page requests to `/login` and returning 401 JSON for API requests.
It performs **signature verification only and never imports the database client** —
proxy is a coarse filter; the guard is the real control.

### 2.7 File import

Drag-or-click upload on the dashboard. Accepts **`.txt` only**, ≤ 1 MB, validated
**server-side** on extension, MIME type, and byte length — the `accept` attribute
is a convenience, never the control. Plain text becomes one paragraph per line;
the title comes from the filename without its extension. The document is created
owned by the uploader and the user lands directly in the editor.

Markdown import was in an earlier draft and was cut with the rest of the
timebox work (§3). `.txt`-only removes the `marked` dependency, the HTML→
ProseMirror conversion, and the raw-HTML-stripping question entirely — roughly 25
minutes for a capability the brief already counts as satisfied by `.txt`.

Rejections are explicit and visible: wrong type → *"Only .txt files are
supported"* (415); too large → *"Files must be under 1 MB"* (413). The supported
type and the size cap are stated in the UI next to the control and in the README,
as the brief requires.

### 2.8 Sharing

Sharing lives on the **dashboard**, on each owned document's row — not in the
editor header. That is a deliberate simplification made late: it removes a
cross-child coordination seam (an earlier draft had one child leaving a slot in
the editor header for another child to fill, which adversarial review flagged as
a divergence risk), and it matches how Drive-style products actually work.

An owner clicks **Share** on a row, enters a seeded user's email, picks
`Viewer` or `Editor`, and confirms. The grantee sees the document under *Shared
with me* with a role badge.

**Changing a role and revoking access are cut** (§3). Grant-with-a-role is what
makes viewer-vs-editor demonstrable, and it is the floor that never goes to zero;
change and revoke are the polish on top. Revoke is the single cheapest thing to
add back if the build runs ahead (§5).

### 2.9 Testing strategy

Outside-in. Playwright drives the flows a reviewer will actually try; Vitest
covers what those flows cannot reach cheaply.

- **E2E (Playwright), the flagship story — deliberately two specs.** Ada creates a
  document and shares it with Grace as `viewer` and Alan as `editor`. Grace sees
  it under *Shared with me* (not *My documents*) with a `Viewer` badge and
  **cannot** edit it. Alan sees an `Editor` badge, edits, saves; Ada reloads and
  sees his text.

  The story spans `e2e/sharing.spec.ts` (dashboard surface, badges, owned-vs-shared
  separation) and `e2e/editor.spec.ts` (role enforcement in the editor), because
  the editor does not exist yet when sharing is built. **Each spec must be
  self-contained** — creating its own per-run-unique document and its own shares.
  Playwright runs spec files in parallel workers with no ordering guarantee, so one
  spec depending on another having run is both interdependence and a race.
- **API integration (Vitest, real Postgres): denial paths only.** No session, no
  role, wrong capability, self-share, duplicate share, stale-version 409,
  oversized and wrong-type upload. Happy paths are already covered by E2E; testing
  them twice was a budget line we cut.
- **Unit (Vitest):** the `resolveRole`/`can` truth table — all twelve cells.

One Postgres code path everywhere (`drizzle-orm/node-postgres`): docker-compose
locally, a `postgres:16` service container in CI, Neon in production.

**E2E runs against the dev server locally and a production build only in CI.**
Rebuilding for every red-green iteration was costing more than it caught.

---

## 3. Rejected alternatives

**Real-time collaborative editing (Yjs / CRDT / operational transform).** The
headline association with "Google Docs", and the single most dangerous item in the
brief. Rejected because the brief asks for *sharing*, never for concurrent
editing, and a partial CRDT integration would consume the entire budget while
leaving every other required capability unfinished. Optimistic versioning (§2.5)
gives multi-user safety without the machinery.

**Real authentication (Auth.js / OAuth / password hashing).** Rejected: an hour of
callback and env plumbing, reviewers forced to create accounts or copy
credentials, and it demonstrates library configuration rather than product
thinking. Seeded identities make the *graded* flow — sharing — testable in seconds.

**File attachments uploaded via presigned URLs to object storage.** Designed,
costed, and cut — the most interesting trade in the build. The design was: client
asks the API for a presigned PUT, uploads **directly** to the bucket, then calls
back to confirm; the server `HEAD`s the object to verify size and writes the row;
every download is an API route that runs the read check and *then* 302s to a
short-lived presigned GET, with the bucket kept strictly private. Presigning
rather than proxying is right at any real scale: Vercel's serverless functions cap
request bodies at **4.5 MB**, and proxying means paying function time to shuttle
bytes that never needed to touch our compute.

It was cut because the brief already counts `.txt` import as the required
file-upload capability, making attachments a *second* answer to an answered
question — ~90 minutes for coverage rather than depth. Two details made it worse
per unit of time: local development would need an S3-compatible service
(Cloudflare R2's free tier requires a card at checkout, which the brief's "do not
require reviewers to pay" rules out), and MinIO — the obvious substitute — cannot
run as a GitHub Actions service container, so CI would have needed bespoke
plumbing before a single attachment test could run.

The same reasoning does **not** favour presigning for the import path: import
never retains the file, so presigning would add a round trip *and* force the
server to fetch the object back to parse it. Different problems, different answers.

**Markdown (`.md`) import.** Cut in the final timebox pass. It needs `marked`, an
HTML→ProseMirror conversion step, and a raw-HTML-stripping decision (`marked` has
no `sanitize` option, so it requires a renderer override) — ~25 minutes for a
capability `.txt` already satisfies. First on the add-back list.

**Role change and revoke.** Cut. Grant-with-a-role is what demonstrates the
viewer/editor distinction; the mutation UI on top is polish.

**`.docx` import.** Attractive (it is the first example in the brief), but
`mammoth` plus its style-mapping edge cases is a 45-minute detour.

**Split frontend/backend deployment (Vite + Fastify on Render).** Cleaner service
boundaries on paper; in practice 45–60 minutes of CORS, two deploy pipelines, and
two env surfaces, bought with time taken directly from the graded features.

**Storing content as sanitized HTML.** Rejected in favour of ProseMirror JSON:
lossless round-trip, no XSS surface on the way back into the editor.

---

## 4. Success criteria

The epic is done when a reviewer who has never seen the repo can, from the
submitted links alone:

1. Open the live URL, sign in as a seeded user, and create, rename, edit, close
   and reopen a document with formatting intact after a hard refresh.
2. Apply bold, italic, underline, headings, and bulleted **and** numbered lists,
   and see the toolbar reflect the cursor's active marks.
3. Upload a `.txt` file and land inside a new editable document; and be told
   clearly, in the UI, what is supported when they try a `.pdf`.
4. Share a document with a second seeded user, see it appear under *Shared with
   me* — visibly distinct from *My documents*, with a role badge — and confirm
   that a `viewer` cannot edit it **and cannot edit it via the API either**, while
   an `editor` can.
5. Clone the repo and get it running locally by following the README verbatim,
   with no paid service, no cloud account, and no undocumented env var.
6. Run `npm run test` and `npm run test:e2e` and watch them pass.
7. Read a 1-page architecture note and an AI-workflow note that name the cuts and
   the reasoning, and watch a 3–5 minute walkthrough that matches what the app
   actually does.

---

## 5. Scope boundary

### Out — cut deliberately, stated without hedging

- Real-time co-editing, cursors, and operational merge
- File attachments and object storage (§3 — designed, costed, cut)
- Markdown and `.docx` import; role change and revoke
- Comments, suggestions, version history
- Deleting a document (the brief asks for create / rename / edit / save / reopen —
  delete is not on the list, and the confirmation flow plus its denial tests were
  ~10 minutes better spent elsewhere)
- Folders, tags, search, trash, document duplication
- Public / link-based sharing; sharing with non-seeded users
- Export (PDF, Markdown) — one-way import only
- Real authentication, registration, password reset
- Images, tables, code blocks, text colour, alignment
- Mobile-optimised editing (responsive to tablet; phone editing is not a target)
- Rate limiting, audit logging, soft delete, pagination

### Add back first, if the build runs ahead

In order, each independently shippable and each landing inside one existing
child's surface: **revoke a share** (~10 min, child 5, completes the sharing
model); **change a role** (~15 min, child 5); **delete a document** (~10 min,
child 4); **`.md` import** (~25 min, child 7).

**Add-backs are the one sanctioned exception to "build the deliverable and
stop".** The rule, so two drivers cannot diverge: a child may implement the
topmost item on this list that falls inside its own surface **only if** its base
deliverable is green, it has ≥10 unused budget minutes, and `docs/CLOCK.md`
carries no `CUTS-FIRED` line. If `CUTS-FIRED` is present, add-backs are forbidden.

### Next 2–4 hours, for SUBMISSION.md

`.docx` import via `mammoth`; export to Markdown; presigned-URL attachments per the
design in §3; presence indicators via polling; document search; and only then, if
the product warranted it, a Yjs-backed real-time layer — noting that the
optimistic-versioning design in §2.5 is the correct thing to *replace* at that
point, not to extend.

---

## 6. Delivery plan

Ten children, strictly linear, **~6h10m budgeted**. Per-child budgets, the TDD
recipe, and verification commands are in the runbook.

That number is the fourth estimate. The first two were fiction (5h55m against a
real ~9h); each adversarial round produced a more honest figure and another round
of cuts. It sits ~10 minutes over the brief's 6h ceiling, which is stated here
rather than massaged — the remaining lever, if that matters more than the
capability, is dropping the §2.5 version guard (~15 min).

Time is tracked in `docs/CLOCK.md`: every child appends one line with its actual
minutes. This is the only mechanism that makes the budget real — an autonomous
driver session has no session-spanning clock, so without a committed artifact the
elapsed-time target is unenforceable and the AI-workflow note's honesty claim has
no data behind it.

**Checkpoint at child 4's merge** (cumulative ≤ 155 min): if exceeded, the driver
appends `CUTS-FIRED` to `CLOCK.md`, and children 5–7 read that file before writing
any test. Since children 5–7 already sit at their cut floors, a `CUTS-FIRED` line
does not shed further scope — what it does is **forbid the §5 add-backs**, which
is the only discretionary time left in the plan. The checkpoint sits at child 4
because that is the last point where the decision can still change anything.
