# AI workflow

## The setup

Claude Code, driving a multi-agent epic workflow. It ran in two phases.

**Planning.** A design spec and a runbook were written first, then put through
adversarial review — a reviewer agent whose only job is to find reasons the plan
will fail, run repeatedly until it stops finding them. Only after that did any
code get written.

**Implementation.** The runbook decomposes the build into ten children, each one
a GitHub issue with a deliverable, a time budget and a list of verification
commands. Each child is handed to an implementer subagent that opens its own
branch and PR. The orchestrating agent never edits source files itself — it
plans, reviews diffs, runs git and CI, and decides whether a child is done.

## Where AI genuinely sped things up

Scaffolding and configuration, mostly — the parts where the answer is known and
typing it is the cost. The Next.js scaffold and toolchain setup, the Drizzle
schema and its generated migration, the CI workflow with its Postgres service
container, the seed script, and the drafting of these documents. Roughly the
first hour of work compressed into minutes.

That is the honest boundary of the speedup. It did not make design decisions
better; it made writing them down faster.

## What got rejected or rewritten

This is the part worth reading. Every item below is a real thing that was caught
and thrown away.

**Four adversarial review rounds on the spec and runbook, before a single line of
code, found 35 blocking defects.** Not style notes — things that would have cost
real time on contact with the toolchain:

- `create-next-app@latest` now scaffolds Next **16**, not 15. The plan assumed
  15 throughout, including a `middleware.ts` that Next 16 has renamed to
  `proxy.ts`.
- `@tiptap/starter-kit@3` already bundles Underline. The plan installed
  `@tiptap/extension-underline` on top of it, which is a duplicate-extension
  error at editor construction, not a warning.
- **Vitest 4 removed `environmentMatchGlobs`.** The test config was written
  against it. The fix is `test.projects`, plus an explicit `exclude` on the jsdom
  project or the integration files run in *both* projects.
- `marked` has no `sanitize` option (removed years ago), so the planned Markdown
  import would have needed a renderer override — one of the inputs that led to
  `.md` import being cut entirely.
- `requireDocAccess(request, …)` **cannot be called from a server component**,
  because a server component has no `Request`. This one changed the design:
  it forced the second guard door, `loadDocumentForPage`, reading the cookie via
  `next/headers`. Two entry points, one shared implementation — that shape exists
  because a reviewer refused to accept the single-door version.

An LLM writing plausible-looking version-pinned instructions is exactly the
failure mode you should expect, and every one of these was that.

**A red push that failed for the wrong reason was rejected and rewritten.** The
process requires the first push of every PR to turn CI red. One did — with
`TS2307: Cannot find module`. That is a *compile* error, not a behavioural
failure: it proves the file is missing, not that the test guards anything. It was
sent back and rewritten with a stub that exists and returns a deliberately wrong
value, so the thing that fails is the assertion. An uninspected red proves
nothing at all; every red run in this repo was opened and read.

**A test that would have been red on both pushes, caught before it was written.**
drizzle-orm wraps driver errors in `DrizzleQueryError`, so the Postgres error
code lives at `error.cause.code`, not `error.code`. A constraint-violation test
asserting `e.code === '23505'` would have gone red on the red push — looking
exactly like success — and then **stayed red on the green push**, because the
implementation was never the problem. That is inverted TDD: a test that can only
ever fail, wearing the costume of a passing cycle. Caught in review of the test
plan, before the test existed.

**The CI Postgres service container was missing `POSTGRES_PASSWORD`.** The
`postgres:16` image refuses to boot without it, so the job would have died at
service startup — reddening the first PR for a reason that had nothing to do with
the child being built, and burning a CI round trip to discover it.

**The time budget was rewritten three times.** 5h55m first — fiction, produced by
an estimator with every incentive to agree with the target. An honest re-estimate
put the same scope at ~9h. Getting back under the ceiling took actual cuts:
attachments, `.md` import, role change and revoke, and document deletion, landing
at ~6h10m. The interesting artifact is not the final number but that the first
two were wrong in the same direction. Optimistic estimates are the default output
unless something adversarial is pointed at them.

## How correctness was verified

**CI-first red→green.** Every child's pull request carries at least two pushes:

1. A `test:` commit containing the tests only. It is pushed, the PR is opened as
   a draft, and the pipeline must go **RED**. The run is then opened and read, to
   confirm it failed on an *assertion* — not on a missing module, not on a broken
   fixture, not on a service container that never started.
2. A `feat:` commit with the implementation. The pipeline must go **GREEN**.

Both runs stay visible on the PR, so the red→green transition is evidence a
reviewer can check rather than a claim in a commit message. Running it in CI
rather than locally is deliberate: CI is the environment with the real Postgres
and the real production build, and a local green proves nothing about it.

The gate is lint + typecheck + Vitest (unit and integration against a real
`postgres:16` service container) + Playwright. Generated migrations were reviewed
by hand rather than trusted — a `db:generate` diff is exactly the kind of
plausible output that needs eyes on it.

## Real elapsed time

From [`docs/CLOCK.md`](CLOCK.md), which every child appends to as it finishes:

```
child-1 (scaffold, toolchain, CI):  44m   (budget 40m)
child-2 (schema, migrations, seed): 18m   (budget 30m)
```

That is **62 minutes of recorded hands-on time** across the two merged children,
against a ~6h10m budget for all ten. Child 3 — auth, session and the permission
model, budgeted at 45m — was in flight when these documents were written, and
children 4 through 7 (document CRUD, sharing, the editor, `.txt` import) were not
started. The README's "Current state" section is the authoritative list.

Two caveats on those numbers, stated rather than buried. They count hands-on
agent time and exclude wall-clock spent waiting on CI — two pipeline round trips
per child, which is real elapsed time the budget never accounted for. And the
clock only exists because it is a committed file: an autonomous agent has no
session-spanning timer, so an uncommitted elapsed-time claim would have been a
guess. This one is at least a measurement.
