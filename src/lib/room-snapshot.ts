import type { SupabaseClient } from "@supabase/supabase-js";

type Estimate = {
  round_id: string;
  development_estimate: string | number | null;
  testing_estimate: string | number | null;
  final_estimate: string | number | null;
  final_unestimated: boolean;
};

type RoundShape = {
  id: string;
  final_estimate?: string | number | null;
  final_unestimated?: boolean;
};

type SnapshotShape = {
  active_round: RoundShape | null;
  history: Array<{
    rounds: RoundShape[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

function addSavedEstimate<T extends RoundShape>(round: T, estimate?: Estimate) {
  const legacyEstimate = round.final_estimate ?? null;
  const legacySaved = legacyEstimate !== null && !round.final_unestimated;
  return {
    ...round,
    development_estimate: estimate?.development_estimate ?? (legacySaved ? legacyEstimate : null),
    testing_estimate: estimate?.testing_estimate ?? (legacySaved ? "0" : null),
    final_estimate: estimate?.final_estimate ?? legacyEstimate,
    final_unestimated: estimate?.final_unestimated ?? round.final_unestimated ?? false,
  };
}

export async function getRoomSnapshot(supabase: SupabaseClient, userId: string, roomId: string) {
  const [snapshotResult, estimatesResult] = await Promise.all([
    supabase.rpc("get_room_snapshot", { p_user_id: userId, p_room_id: roomId }),
    supabase.rpc("get_saved_round_estimates", { p_user_id: userId, p_room_id: roomId }),
  ]);
  if (snapshotResult.error) return { data: null, error: snapshotResult.error };
  if (estimatesResult.error) return { data: null, error: estimatesResult.error };

  const snapshot = snapshotResult.data as SnapshotShape;
  const estimates = (estimatesResult.data ?? []) as Estimate[];
  const estimateByRound = new Map(estimates.map((estimate) => [estimate.round_id, estimate]));
  const activeRound = snapshot.active_round
    ? addSavedEstimate(snapshot.active_round, estimateByRound.get(snapshot.active_round.id))
    : null;

  return {
    data: {
      ...snapshot,
      active_round: activeRound,
      history: snapshot.history.map((task) => ({
        ...task,
        rounds: task.rounds.map((round) => addSavedEstimate(round, estimateByRound.get(round.id))),
      })),
    },
    error: null,
  };
}
