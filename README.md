# Poker Planning

Planning-poker rooms with private voting, shared reveals, and persistent history.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS 4, and PostgreSQL. The app connects directly to PostgreSQL with a server-only `pg` connection pool. Supabase is no longer required.

## Server setup

Use Node.js 22 or newer and PostgreSQL 16 or newer with the `pgcrypto` extension available. Install PostgreSQL through your server's package manager and keep it listening on localhost when the app runs on the same server.

1. As the PostgreSQL administrator, create separate migration and runtime logins. Use your own strong passwords:

   ```sql
   CREATE ROLE poker_owner LOGIN PASSWORD 'replace-owner-password' CREATEROLE;
   CREATE ROLE poker_runtime LOGIN PASSWORD 'replace-runtime-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
   CREATE DATABASE poker_planning OWNER poker_owner;
   ```

2. Run `npm install`. Copy `.env.example` to `.env.local`. Set `DATABASE_ADMIN_URL` to the owner connection and `DATABASE_URL` to the runtime connection. Set `APP_SESSION_SECRET` to at least 32 random characters, retaining the same value across deploys. These values are server-only.
3. Run `npm run db:migrate`. This loads `.env.local`, applies versioned SQL in `db/migrations/` transactionally, and records checksums. The initial migration creates the `poker_app` permission role, so the migration owner needs `CREATEROLE`. Use a dedicated database; this migration restricts the public schema.
4. As the PostgreSQL administrator, grant runtime membership and enable inheritance:

   ```sql
   GRANT poker_app TO poker_runtime;
   ALTER ROLE poker_runtime INHERIT;
   ALTER ROLE poker_owner NOCREATEROLE;
   ```

   Keep ownership with `poker_owner`. Do not grant the runtime login ownership, superuser, table access, or membership in privileged roles. Future migrations run as the owner; creating the application role is needed only once per PostgreSQL cluster. For additional installations on the same cluster, use a separate cluster or adapt the role name before applying the baseline.

5. Run `npm run build` and `npm start` under your process manager. Put an HTTPS reverse proxy in front of the app; production session cookies require HTTPS. Provision database backups and test restoring them. Keep port 5432 restricted to the application server; for connections across servers, configure PostgreSQL TLS and a verified certificate through the connection URL.

`DATABASE_ADMIN_URL` is used only by the migration command. It does not need to be present in the running application environment. Never prefix database credentials or the session secret with `NEXT_PUBLIC_`.

## Run locally

```sh
npm run dev
```

Open http://localhost:3000. Create a room, share its invitation URL, and join from independent browser sessions. Participants can submit or update numeric and “Cannot estimate” votes until the host reveals. Revealed and completed rounds cannot be changed.

### Manual sandbox without PostgreSQL

```sh
npm run dev:local
```

The `LOCAL SANDBOX` mode stores state in ignored `data/local-demo.json`. It supports the same workflow, but does not verify PostgreSQL permissions, RLS, or functions.

## Moving existing Supabase data

The standalone schema preserves the five application tables, UUIDs, invitation hashes, votes, and history. Historical migrations in `supabase/migrations/` remain unchanged for reference; do not apply them to standalone PostgreSQL.

Stop writes to the old app during transfer. Initialize the new database using the steps above, then use PostgreSQL's `pg_dump` against the old database to export **data only** for `public.rooms`, `public.room_members`, `public.tasks`, `public.rounds`, and `public.votes`, with `--column-inserts --no-owner --no-privileges`. Restore as `poker_owner` using `psql --single-transaction --set ON_ERROR_STOP=1`. The room/task/round circular references are deferred until commit. Do not restore Supabase schemas, roles, or functions. Verify counts and history before switching traffic. Keep a backup and the old database until the transfer is verified.

Retain `APP_SESSION_SECRET` and the app's hostname to preserve production browser sessions. Without the original signing secret, people can rejoin with an invitation but will receive new identities; host sessions will not automatically transfer. No server transfer has been performed by the repository changes.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The acceptance test requires a migrated PostgreSQL database reachable by `DATABASE_URL` in `.env.local` (or the process environment), plus Chromium. It uses three independent sessions to verify private votes, changes between numeric and Cannot estimate votes, persistence after reload, host-only actions, rejection of changes after reveal, separate development/testing totals, and history. It fails if the configured database is unavailable. Running it against sandbox mode verifies only the sandbox.

## Vote privacy model

- The server verifies HMAC-signed HTTP-only session cookies and passes that identity to database function wrappers. Client-provided identities and roles are ignored.
- All application tables retain RLS with no direct runtime table grants. Only the application role can execute the identity-taking wrappers. Internal helpers are not granted to it.
- The membership-checked snapshot returns vote-status booleans and the caller's own selection before reveal. Other selections appear only after reveal.
- Vote updates and host reveal lock the same room row, so the operations are serialized. Changes after reveal are rejected.
- Session identity is transaction-local, preventing leakage across pooled connections. Browsers poll the authorized snapshot API.
- Invitations contain a random 256-bit token; only a SHA-256 hash is stored.

## Project documents

- `SPEC.md`: behavior and acceptance criteria
- `AGENTS.md`: coding and verification conventions
- `PLAN.md`: implementation plan, not proof of verification
- `db/migrations/`: standalone PostgreSQL schema and functions
- `tests/e2e/three-session.spec.ts`: acceptance test
