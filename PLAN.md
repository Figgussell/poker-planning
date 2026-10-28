# Implementation Plan

## Stage 1: Application foundation

- Initialize Next.js App Router with TypeScript and Tailwind CSS.
- Add environment validation, Supabase browser/server clients, and a responsive visual foundation.
- Verify dependencies install and the application typechecks/builds.

## Stage 2: Secure persistence

- Add Supabase migration for rooms, memberships, tasks, rounds, and votes.
- Add RLS and database functions that enforce host-only mutations and prevent unrevealed vote values from being selected or broadcast to other users.
- Add `.env.example` and document Supabase setup.
- Verify migration syntax and application types; use local Supabase tooling if available.

## Stage 3: Room and round workflows

- Implement room creation/joining and authenticated membership.
- Implement host task and round controls, participant voting, reveal, final estimate, and history.
- Ensure pre-reveal reads return vote status and only the requesting participant's own vote.
- Verify each workflow and the build before moving on.

## Stage 4: Live updates and recovery

- Poll the membership-checked, privacy-safe room snapshot rather than subscribing to raw vote-table Realtime events.
- Restore the current room and round from the database after reload.
- Verify host and participant sessions remain in sync without exposing private votes.

## Stage 5: Acceptance checks and handoff

- Add automated checks for authorization and vote privacy, plus a three-context browser test where the available environment permits.
- Run lint, typecheck, tests, and production build.
- Finish README setup, test instructions, and known environment requirements.

## Completion criteria

The acceptance criteria in `SPEC.md` pass, or any check blocked by missing Supabase credentials/runtime is explicitly identified with reproducible instructions.