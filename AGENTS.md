# Codex project instructions

## Project context

Poker Planning is a planning-poker application with host-controlled rooms, private votes, shared reveals, and persistent round history. Codex is the primary coding agent for this repository.

- `SPEC.md` defines product behavior, security requirements, and acceptance criteria.
- `README.md` documents setup, environment variables, and verification.
- `PLAN.md` describes the implementation stages; it is a plan, not evidence that a check has passed. Prefer the current specification and implementation over outdated plan details.
- Keep these documents aligned when changing behavior or setup. Follow the user's current instructions when they change existing requirements.

## Code map

- `src/app/`: App Router pages, layouts, styles, and server API routes.
- `src/components/room-client.tsx`: interactive room UI and polling.
- `src/lib/room-snapshot.ts`: shared room snapshot types and helpers.
- `src/lib/supabase/server.ts`: server-only Supabase admin client.
- `src/lib/local-demo-auth.ts`: signed application sessions used by the server.
- `src/lib/local-demo.ts`: file-backed sandbox implementation; keep its workflow aligned with the database implementation.
- `supabase/migrations/`: versioned schema, authorization, RPCs, and grants. Add new migrations for database changes rather than rewriting deployed migration history.
- `tests/e2e/three-session.spec.ts`: acceptance flow with a host and two independent participants.

## Development and verification

Use Node.js 22 or newer and npm. Available commands are defined in `package.json`:

- `npm run dev`: regular Supabase-backed development.
- `npm run dev:local`: manual sandbox without Supabase; persisted files live in ignored `data/`.
- `npm run lint`, `npm run typecheck`, `npm run build`: checks for application changes. The production build currently uses webpack.
- `npm run test:e2e`: Playwright acceptance test, requiring configured Supabase and Chromium (`npx playwright install chromium`).

Run checks appropriate to the change. For authorization, voting, persistence, or round workflow changes, run the three-session acceptance test when its environment is available. Sandbox checks do not verify Postgres, RLS, or database RPC authorization. Report missing dependencies or credentials and unrun checks explicitly; never claim environment-blocked checks passed.

## Security and behavior invariants

- Derive user identity from the verified, HMAC-signed HTTP-only session cookie. Enforce room membership and host permissions on the server and through database RPC checks; never trust client-provided identities or roles.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `APP_SESSION_SECRET` server-only. Do not print secrets, commit local environment files, or expose secrets through `NEXT_PUBLIC_` variables.
- Before reveal, return only vote-status booleans and the caller's own vote. Other members' vote values must stay absent from API responses, rendered data, and event payloads.
- Preserve RLS, restricted table grants, and service-role-only RPC wrappers. Poll the authorized snapshot endpoint; raw vote-table subscriptions must not expose private votes.
- Reveal is an atomic host-authorized operation. Invitations permit joining, not host privileges.
- Preserve decimal non-negative votes, the distinct “Cannot estimate” choice, separate development/testing estimates and their total, and read-only completed history.

## Working conventions

Preserve existing TypeScript, App Router, and styling conventions. Inspect the affected flow before editing and keep changes scoped to the request. Update `.env.example` and setup documentation when adding configuration, without including real credentials. Summarize changes, verification results, and any remaining limitations when handing work back.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
