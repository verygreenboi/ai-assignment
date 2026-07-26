# Submission — Collaborative Document Editor

**Live app:** https://ai-assignment-ajaia.vercel.app/
**Repository:** https://github.com/verygreenboi/ai-assignment (public)
**Walkthrough video:** TODO(human)

## Seeded accounts

Demo mode — pick an account on the login page, no password required.

| Email | Name |
|---|---|
| `ada@ajaia.test` | Ada Lovelace |
| `grace@ajaia.test` | Grace Hopper |
| `alan@ajaia.test` | Alan Turing |

---

## What is included

| File | What it is |
|---|---|
| `README.md` | What the app is, the live URL, seeded accounts, verbatim-runnable local setup, how to run the checks, and an honest "Current state" section |
| `docs/ARCHITECTURE.md` | One-page architecture note — stack and why, data model, the permission model in detail, concurrency, testing strategy, and the rejected alternatives with their reasoning |
| `docs/AI-WORKFLOW.md` | How AI was used, where it genuinely helped, what it got wrong and had to be rewritten, and how correctness was verified |
| `docs/specs/2026-07-26-collab-doc-editor-design.md` | The full design spec the build was planned from — scope boundary, rejected alternatives, success criteria |
| `docs/runbooks/2026-07-26-collab-doc-editor-plan.md` | The implementation runbook — ten children with budgets, TDD recipe and verification commands |
| `docs/CLOCK.md` | Real elapsed minutes per child, appended by each child as it merged |
| `src/db/schema.ts`, `drizzle/` | The three-table Postgres schema and its generated, committed migrations |
| `scripts/seed.ts` | Idempotent seed — 3 users, 2 documents, 1 share |
| `src/lib/`, `src/proxy.ts` | Session handling, the permission model (`resolveRole` / `can`) and the two guard doors |
| `.github/workflows/ci.yml` | CI — lint, typecheck, Vitest against a real Postgres service container, Playwright |
| `docker-compose.yml`, `.env.example` | Local Postgres on host port 5433, and placeholder-only environment config |

---

## What works

Verifiable at the live URL and in the repository:

- **The deployed app.** Next.js 16 (App Router, TypeScript) on Vercel, backed by
  a Neon Postgres database. Merging to `main` auto-deploys.
- **Authentication.** Seeded email-only login (demo mode, no password) issuing a
  signed httpOnly JWT session cookie, with route protection in `src/proxy.ts`
  that verifies the signature and never touches the database.
- **The permission model.** One pure `resolveRole`, one `can`, and two guard
  entry points over a single shared implementation — `requireDocAccess` for route
  handlers and `loadDocumentForPage` for server components, which have no
  `Request` object to read a cookie from. No-access returns **404, not 403**, so
  document ids cannot be enumerated. Tested, including the full role/capability
  truth table.
- **The data model.** `users`, `documents`, `document_shares` with cascade
  foreign keys, a composite unique on `(document_id, user_id)`, and a `role`
  check constraint — invalid state is rejected by the database, not just by
  application code. Drizzle migrations generated from the schema and committed.
- **The seed.** Idempotent, safe to re-run: three users, two documents, one
  share.
- **Local setup from a clean clone.** `npm ci` → `cp .env.example .env` →
  `docker compose up -d --wait` → `npm run db:migrate` → `npm run db:seed` →
  `npm run dev`. No paid service, no cloud account, no undocumented env var.
- **CI.** Lint, typecheck, Vitest and Playwright on every pull request, against a
  real `postgres:16` service container. Every change landed through a CI-first
  red→green cycle, both runs visible on the PR.

## What is incomplete

Stated plainly — none of the following is in the deployed app:

- **Document CRUD and the dashboard.** No create, rename, list, or "My documents"
  versus "Shared with me" split.
- **The rich-text editor and autosave.** TipTap is designed for (ProseMirror JSON
  in a `jsonb` column, optimistic `version` guard, 409 on a stale write) but not
  built. The `version` column exists; nothing increments it yet.
- **Sharing.** No UI and no API to grant a document to another user with a role.
  The seed contains a share row, and the permission model resolves it correctly,
  but there is no way to create one through the app.
- **`.txt` import.** Not started.

The important caveat: **the permission model is a tested library with no document
routes consuming it.** The guards are correct and covered, but nothing calls them
from a document page, because the document pages do not exist. It is a load-
bearing piece of a build that has not yet reached the surface that would use it.

Also deliberately out of scope, and cut with reasoning rather than forgotten:
real-time co-editing, file attachments and object storage, `.docx` and `.md`
import, role change and revoke, document deletion, comments, version history,
export, and real authentication. The reasoning for each is in
`docs/ARCHITECTURE.md` and, at length, in §3 and §5 of the design spec.

## What I would build next, with 2–4 hours

In this order — each item is independently shippable and each unblocks the next.

1. **Document CRUD and the dashboard** (~40 min). Create, rename, and the list
   view split into *My documents* and *Shared with me* with a role badge. This is
   what turns the permission model from a library into a feature — the guards
   finally get called.
2. **The TipTap editor with autosave** (~65 min). ProseMirror JSON persisted to
   `content`, debounced autosave through a `PATCH` that carries the loaded
   `version`, and the 409 stale-write path wired to the save indicator. Bold,
   italic, underline, headings, and bulleted and numbered lists.
3. **Sharing — grant with a role** (~30 min). Share a document with a seeded user
   as `viewer` or `editor`. This completes the flagship demo: a viewer cannot
   edit, in the UI *and* through the API; an editor can. The denial paths are
   already the tests the design calls for.
4. **`.txt` import** (~25 min). Upload a text file, land in a new editable
   document, with a clear in-UI message about what is supported when someone
   tries a `.pdf`.

That is the brief satisfied. Past it, in the order the design spec's "Later" list
sets out: revoke a share and change a role (~25 min together, completing the
sharing model); delete a document (~10 min); `.md` import (~25 min); then `.docx`
import via `mammoth`, export to Markdown, the presigned-URL attachment design
costed in §3, presence indicators via polling, and document search. Real-time
collaborative editing sits last on purpose — and when it arrives, optimistic
versioning is the thing it should *replace*, not extend.
