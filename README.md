# Collab Docs

A collaborative document editor — a small Google-Docs-shaped app built as a
take-home assignment. Documents live in Postgres, identity is a seeded demo
login, and access is decided by a single permission model shared by every route
and page.

- **Live:** https://ai-assignment-ajaia.vercel.app/
- **Repo:** https://github.com/verygreenboi/ai-assignment
- **Design spec:** [`docs/specs/2026-07-26-collab-doc-editor-design.md`](docs/specs/2026-07-26-collab-doc-editor-design.md)
- **Architecture note:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **AI workflow note:** [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md)
- **Submission summary:** [`SUBMISSION.md`](SUBMISSION.md)

---

## Current state — read this first

This is an honest snapshot, not a wish list. The build ran against a ~6h
timebox and stopped where it stopped.

### Shipped and working

- Next.js 16 application (App Router, TypeScript, Turbopack), deployed to Vercel
  with a Neon Postgres database. The live URL serves it.
- Postgres schema — `users`, `documents`, `document_shares` — with cascade
  foreign keys, a composite unique on `(document_id, user_id)` so a document
  cannot be shared with the same person twice, and a `role` check constraint
  restricting shares to `viewer` or `editor`.
- Drizzle migrations (`drizzle/`), generated from `src/db/schema.ts` and
  committed, plus an idempotent seed (3 users, 2 documents, 1 share) that is
  safe to re-run.
- Authentication — seeded email-only login (demo mode, no password), a signed
  httpOnly JWT session cookie, and route protection in `src/proxy.ts`.
- The permission model — `resolveRole` / `can`, plus the two guard doors
  `requireDocAccess` (route handlers) and `loadDocumentForPage` (server
  components). Implemented and tested.
- CI on every pull request: lint, typecheck, Vitest against a real Postgres
  service container, and Playwright.

### Not shipped

- Document CRUD and the dashboard (create / rename / list owned vs shared).
- The TipTap rich-text editor and autosave.
- Sharing UI and API (grant a document to another user with a role).
- `.txt` file import.

The permission model is therefore a **tested library with no document routes
consuming it yet** — the guards are real and correct, but nothing calls them
from a document page, because the document pages do not exist. Closing that gap
is the top of the "what I'd build next" list in [`SUBMISSION.md`](SUBMISSION.md).

---

## Seeded accounts

Demo mode — pick an account, no password.

| Email | Name |
|---|---|
| `ada@ajaia.test` | Ada Lovelace |
| `grace@ajaia.test` | Grace Hopper |
| `alan@ajaia.test` | Alan Turing |

---

## Prerequisites

- Node.js 22
- Docker (for the local Postgres)

No paid service and no cloud account are needed to run this locally.

## Setup

Run these in order, from the repository root:

```bash
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

The app runs at http://localhost:3000.

`docker compose up -d --wait` starts **postgres:16** and blocks until its health
check passes. It publishes on host port **5433**, not the default 5432, so it
will not collide with a Postgres already installed on your machine — the
`DATABASE_URL` in `.env.example` already points there.

`.env.example` holds placeholder values only; this repository is public and
carries no real secrets.

## Checks

One extra one-time step before the first E2E run — Playwright needs its browser:

```bash
npx playwright install chromium
```

Then:

```bash
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test       # vitest — unit + integration against the local Postgres
npm run test:e2e   # playwright — runs migrate + seed first, so it is re-runnable
npm run build      # production build
```

`npm run test` and `npm run test:e2e` both need the database up
(`docker compose up -d --wait`). `npm run test:e2e` starts the dev server
itself, so you do not need `npm run dev` running. The same checks run in GitHub
Actions on every pull request, against a `postgres:16` service container.

## Database scripts

```bash
npm run db:generate  # regenerate migrations from src/db/schema.ts
npm run db:migrate   # apply migrations
npm run db:seed      # idempotent seed — safe to re-run
```
