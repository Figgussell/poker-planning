# Team Estimation MVP Specification

## Goal

Build a small, persistent planning-poker web application where a host creates a room, shares an invitation link, and runs estimation rounds with a team.

## Roles and permissions

- **Host:** creates and owns a room; may add tasks, reveal a round, save its final estimate, and start the next round.
- **Participant:** joins through an invitation link and submits one non-negative numeric estimate or “Cannot estimate” for the active round.
- The server derives the role from the authenticated room membership and checks authorization for every mutation. A client-provided role is never trusted.
- Only the host may manage tasks or control round state.

## Main workflow

1. The host creates a room and receives a shareable invitation URL.
2. Participants join the room by entering a display name through the invitation URL.
3. The host adds a task. A task has a title and is retained in room history.
4. Participants submit a decimal, non-negative number or “Cannot estimate” for the active round. A participant may change their vote while voting is open.
5. While the round is unrevealed, each participant can see their own selection and whether each other participant has voted, but cannot receive any other participant's selection.
6. The host reveals the round. Only then are the submitted selections available to room members.
7. The host saves separate development and testing estimates; the app stores and displays their sum as the task total. The host may also mark the task as unestimated. The breakdown and votes remain in history.
8. The host starts a new round for the next task; previous rounds remain available as read-only history.

## Data and privacy requirements

- Persist rooms, memberships, tasks, rounds, and votes in Supabase Postgres.
- Persist development estimate, testing estimate, and their total for every completed round. Existing saved totals migrate to development with a testing estimate of zero.
- Every room member can open a previous task and see each revealed round's participant votes, development estimate, testing estimate, and total.
- Keep votes private before reveal at every boundary: server-rendered/API responses, Supabase Realtime payloads, and direct database access through RLS.
- Before reveal, clients receive participant identity and a boolean `has_voted` status only. A participant's own vote may be returned only to that participant.
- Reveal must be an atomic, host-authorized server operation. The server must not broadcast vote values before the round is marked revealed.
- Use Supabase Auth for identity and server-side authorization. Invitation tokens are unguessable and grant room-join capability, not host permissions.

## User experience

- Responsive room view with current task, participants and voting statuses, private vote controls, reveal state, and task/round history.
- Support fractional values using a decimal input, reject negative, non-finite, or malformed values, and provide a distinct “Cannot estimate” choice.
- Clear waiting, revealed, loading, empty, and error states. Restore the active room and round after a page reload using persisted state.
- Host-only controls are hidden or disabled for participants, with server-side enforcement regardless of UI state.

## Technical constraints

- Next.js App Router, TypeScript, Tailwind CSS, and Supabase.
- Database schema and RLS policies are versioned as SQL migrations.
- Configuration is documented in `.env.example`; local setup and verification are documented in `README.md`.
- Never expose the Supabase service-role key to browser code.

## Acceptance criteria

- Host can create a room, add a task, reveal votes, save separate development/testing estimates and their total, and start a new round.
- All room members can inspect previously completed tasks, including round votes and the saved development/testing/total breakdown.
- Two participants can join the same room and vote independently, including decimal or “Cannot estimate” votes.
- Three independent browser sessions can participate concurrently as host and two participants.
- Before reveal, a participant's network-visible API and Realtime data contains no other participant's vote value, including for requests crafted outside the UI.
- Reloading a room restores membership, current task, vote status, revealed result, and saved history from Supabase.
- Non-host attempts to add tasks, reveal, save results, or start rounds are rejected by server authorization and database policy.

## Verification approach

- Typecheck, lint, and production build the application.
- Apply the SQL migration to a Supabase project and verify the policies with separate authenticated users.
- Run a browser test in three independent contexts: host, participant A, and participant B. Inspect network responses and Realtime events before reveal, exercise voting and reveal, reload each context, and confirm unauthorized host actions fail.
- If Supabase credentials are unavailable, keep the integration runnable and report the live database/browser acceptance checks as environment-blocked rather than claiming they passed.