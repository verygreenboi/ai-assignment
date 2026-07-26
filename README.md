# Collab Docs

A collaborative document editor, built as a take-home assignment.

**This build is in progress.** What exists today is the scaffold, the test
harness and CI. There is no auth, no documents and no sharing yet — those land
in later increments.

## Prerequisites

- Node 22
- Docker (for the Postgres container)

## Setup

```bash
npm ci
cp .env.example .env
docker compose up -d --wait
npm run dev
```

The app runs at http://localhost:3000.

`docker compose up -d --wait` starts Postgres 16 and blocks until its health
check passes. It publishes on host port **5433**, not the default 5432, so it
will not collide with a Postgres you already have installed locally — the
`DATABASE_URL` in `.env.example` already points there.

## Checks

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # Vitest
npm run test:e2e   # Playwright
```

Playwright needs a browser downloaded once before `npm run test:e2e` will run:

```bash
npx playwright install chromium
```

`npm run test:e2e` starts the dev server itself, so you do not need to have
`npm run dev` running. CI runs the same checks in the same order.
