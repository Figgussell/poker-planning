# Poker Planning

Planning-poker rooms for independent team estimates, private voting, shared reveals, and persistent round history.

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS 4 with a product-specific responsive CSS layer
- Supabase Postgres with server-side role-checked RPCs and app-issued sessions
- Playwright for the three-browser acceptance flow

## Requirements

- Node.js 22 or newer
- A Supabase project, or Docker and the Supabase CLI for local development
- Chromium for the Playwright acceptance test

## Supabase setup

1. Create a Supabase project. No Supabase Auth settings need to be changed; Poker Planning manages participant sessions itself.
2. Copy `.env.example` to `.env.local` and set the project URL and server-only service-role key. For deployment, also set `APP_SESSION_SECRET` to a random value with at least 32 characters. Never prefix either secret with `NEXT_PUBLIC_` or send it to browser code.
3. Apply all SQL files in `supabase/migrations/` in filename order with the Supabase SQL editor, or install the Supabase CLI and run `supabase db push` for a linked project. The migrations add development/testing breakdowns and server-role-only RPC wrappers; existing saved totals are preserved as development estimates.
4. For local Supabase, run `supabase start` and `supabase db reset`.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. The host creates a room and shares the invitation URL; participants open it in separate browser sessions and choose display names.

### Manual sandbox without Supabase

To try the complete UI flow before configuring Supabase, run:

```sh
npm run dev:local
```

Open http://localhost:3000 in three isolated browser profiles (for example, Chrome, Firefox, and a separate Chrome profile). In the first, create the room and a task. Copy the invitation URL into the other two, join with distinct names, submit decimal and “Cannot estimate” votes, then reveal, save separate development/testing estimates, and start another round. Open the previous task in history to inspect everyone's revealed votes and the dev/test/total breakdown. Reload all three pages to confirm state returns. The app shows a `LOCAL SANDBOX` label when this mode is active.

This mode stores state in ignored `data/local-demo.json` and uses signed HTTP-only cookies. It is intended for manual UI/workflow checks only; it does not exercise Supabase Postgres or RLS. Remove `data/` to clear local sandbox rooms. Use the regular Supabase setup above when verifying database security.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The Playwright acceptance test uses three isolated browser contexts for the host and two participants. It verifies pre-reveal vote responses contain only the sender's value, non-host attempts at host-only actions return HTTP 403, votes become visible after reveal, separate development/testing estimates sum correctly, the previous task exposes its estimates and votes, and sessions recover after reload. It requires the Supabase URL and service-role key above; no Supabase Auth setup is needed.

## Vote privacy model

- Only server API routes use the Supabase service-role key. Browser code never receives it.
- Every base table has RLS enabled and no table grants to browser roles. Votes cannot be fetched from PostgREST directly.
- Browser sessions use random UUIDs in HMAC-signed, HTTP-only cookies. The server validates the cookie signature and supplies its user ID to RPC wrappers; the client cannot choose or alter that identity.
- Room reads use the `get_room_snapshot` security-definer RPC, which verifies membership. Before reveal, it returns `has_voted` booleans and only the caller's own vote; vote values are included only after reveal.
- RPC wrappers are executable only by `service_role`; they set the verified session identity for the existing role/membership checks. The browser never writes tables directly and cannot invoke these RPC wrappers with its anon key.
- Production requires `APP_SESSION_SECRET` (at least 32 characters) and `SUPABASE_SERVICE_ROLE_KEY`; both remain server-only.
- The app polls the authorized snapshot endpoint and does not subscribe to raw vote-table Realtime events.
- Invitation URLs contain a random 256-bit join token; only its SHA-256 hash is stored in the database.

## Project documents

- `AGENTS.md`: Codex project instructions, code map, security invariants, and verification commands
- `SPEC.md`: product and security requirements
- `PLAN.md`: staged implementation and verification plan
- `supabase/migrations/`: versioned schema, RPCs, and grants
- `tests/e2e/three-session.spec.ts`: independent-session acceptance test
