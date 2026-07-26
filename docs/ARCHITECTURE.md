# Architecture

One page. The full reasoning lives in
[`docs/specs/2026-07-26-collab-doc-editor-design.md`](specs/2026-07-26-collab-doc-editor-design.md).

## Stack, and why

A **single Next.js 16 application** (App Router, TypeScript, Node runtime),
persisting to **Postgres via Drizzle ORM**, deployed to **Vercel** with a
**Neon** database. Rich text is **TipTap v3** (ProseMirror) stored as ProseMirror
JSON in a `jsonb` column.

One app, not a split frontend and backend: server components read the database
directly, so the "API" only has to exist where a mutation genuinely needs one.
A Vite + Fastify split on Render was the alternative — cleaner boundaries on
paper, 45–60 minutes of CORS, two deploy pipelines and two env surfaces in
practice, all bought with time taken from graded features. Drizzle over an
ORM with a runtime engine because the schema *is* TypeScript and migrations are
generated SQL you can read in the diff. One Postgres code path everywhere
(`drizzle-orm/node-postgres`): docker-compose locally, a `postgres:16` service
container in CI, Neon in production.

## Data model

Three tables, and that is the whole model.

```
users              id uuid pk · email text unique · name text · created_at

documents          id uuid pk · owner_id -> users(id) on delete cascade
                   title text · content jsonb · version integer
                   created_at · updated_at · index (owner_id)

document_shares    id uuid pk · document_id -> documents(id) on delete cascade
                   user_id -> users(id) on delete cascade
                   role text check (role in ('viewer','editor'))
                   unique (document_id, user_id) · index (user_id)
```

`document_shares` is a table rather than an array column on `documents` because
that is what makes "shared with me" a cheap indexed query. The composite unique
makes double-sharing a database error rather than an application bug, and the
check constraint means an invalid role cannot be persisted even by a buggy
route. `content` is ProseMirror JSON, not HTML: the editor's native format
round-trips losslessly and we never sanitize untrusted HTML back into an editor.

## The permission model

This is the centrepiece. **Nothing else in the codebase decides access.**

One pure resolver:

```ts
resolveRole(userId, doc, share): 'owner' | 'editor' | 'viewer' | null
  doc.ownerId === userId   -> 'owner'
  share?.userId === userId -> share.role
  otherwise                -> null
```

One capability check — `can(role, capability)`: `read` needs any role, `write`
needs owner or editor, `share` needs owner. Twelve cells, unit tested as a truth
table.

**Two doors, one brain.** Route handlers and server components reach that logic
by different entry points, because an App Router server component has no
`Request` object to read a cookie from:

```ts
requireDocAccess(request, documentId, capability)   // route handlers
loadDocumentForPage(documentId, capability)         // server components (next/headers cookies())
```

Both live in `src/lib/require-doc-access.ts`, share the one joined query, make
the same `resolveRole` + `can` call, and throw the same `DocAccessError` carrying
a `.status` of 401, 403 or 404. Two doors, never two implementations. The second
door was not in the first draft of the design — it was forced by a review finding
that `requireDocAccess(request, …)` simply cannot be called from a server
component.

**404, not 403, when the caller has no role.** A 403 would confirm that a
document id exists, which lets anyone walk the id space and learn what documents
are in the system. So: no session is `401`; a document that does not exist is
`404`; a document that exists but the caller has no relationship to is **also
`404`** — they cannot tell the two apart. Only a caller who already holds a role,
and therefore already knows the document exists, gets an honest `403` when they
lack the capability.

Session identity is a seeded email-only login writing an HS256 JWT
(`jose`, httpOnly, sameSite=lax, secure in production). `src/proxy.ts` — Next
16's rename of `middleware.ts` — protects `/documents/*` and `/api/documents/*`,
but it verifies the signature only and never imports the database client. The
proxy is a coarse filter; the guard is the real control.

## Concurrency

Every document carries an integer `version`. A save sends the version it loaded;
the server updates `WHERE id = ? AND version = ?` and bumps it. Zero rows
affected means someone else saved first, and the server returns `409` with
`currentVersion` so the UI can say "this document changed elsewhere — reload".

This is last-write-wins with a stale-write guard. It cannot merge concurrent
edits, but it can never silently destroy one either — which is the honest half
of the problem, bought for about fifteen minutes.

## Testing

Outside-in. Playwright drives the flows a reviewer will actually try; Vitest
covers what those flows cannot reach cheaply.

- **E2E (Playwright)** — the sharing story end to end, each spec self-contained
  with its own per-run-unique fixtures, because Playwright runs specs in parallel
  workers with no ordering guarantee.
- **API integration (Vitest, real Postgres)** — denial paths only: no session, no
  role, wrong capability, duplicate share, stale-version 409. Happy paths are
  already covered by E2E and testing them twice was a line we cut.

Test layers were deliberately cut under time pressure. Playwright E2E is the only
mandatory layer, with a small number of API-level authorization denial assertions
kept alongside it — an E2E can prove the UI hides a control, but never that the
route refuses the request, and that gap is where a real security bug would hide.
The `resolveRole` / `can` truth table, schema unit tests and hook unit tests were
dropped. That is a real reduction in coverage, recorded here rather than glossed.

CI runs lint, typecheck, Vitest and Playwright on every PR against a real
Postgres service container. Every change lands through a CI-first red→green
cycle — see [`AI-WORKFLOW.md`](AI-WORKFLOW.md).

---

## Rejected alternatives

**File attachments via presigned URLs to object storage — the strongest of
these, and the one that hurt to cut.** It was designed and costed, not waved
away. The design: the client asks the API for a presigned PUT, uploads
**directly** to a strictly private bucket, then calls back to confirm; the server
`HEAD`s the object to verify size and type before writing the row; every download
is an API route that runs the read check and *then* 302s to a short-lived
presigned GET. Presigning rather than proxying is the right call at any real
scale — Vercel's serverless functions cap request bodies at 4.5 MB, and proxying
means paying function time to shuttle bytes that never needed to touch our
compute. It was cut at ~90 minutes for three reasons: the brief already counts
`.txt` import as the required file-upload capability, so attachments are a
*second* answer to an answered question — coverage, not depth; local development
would need an S3-compatible service, and Cloudflare R2's free tier requires a
card at checkout, which the brief's "do not require reviewers to pay" rules out;
and MinIO, the obvious substitute, cannot run as a GitHub Actions service
container, so CI would have needed bespoke plumbing before a single attachment
test could run. Note the same reasoning does *not* favour presigning for import:
import never retains the file, so presigning would add a round trip and then
force the server to fetch the object back to parse it.

**Real-time collaborative editing (Yjs / CRDT / operational transform).** The
headline association with "Google Docs", and the single most dangerous item in
the brief. The brief asks for *sharing*; it never asks for concurrent editing. A
partial CRDT integration would have consumed the entire budget and left every
other required capability unfinished. Optimistic versioning gives multi-user
safety without the machinery — and if real-time were ever built, versioning is
the thing to *replace*, not extend.

**Real authentication (Auth.js / OAuth / password hashing).** An hour of callback
and env plumbing, reviewers forced to create accounts or copy credentials, and it
demonstrates library configuration rather than product thinking. Seeded
identities make the *graded* flow — sharing between two users — demonstrable in
two browser profiles in under thirty seconds. The simplification is stated in the
login UI itself, not hidden.

**`.docx` import.** Attractive, since it is the first example in the brief, but
`mammoth` plus its style-mapping edge cases is a 45-minute detour into a
document-conversion problem rather than a product one. `.txt` satisfies the
requirement. `.md` import was cut for the same reason and is first on the
add-back list.

**Storing content as sanitized HTML.** Rejected in favour of ProseMirror JSON —
lossless round-trip and no XSS surface on the way back into the editor.
