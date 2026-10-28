import "server-only";
import { Pool } from "pg";
import { ApiConfigurationError } from "@/lib/api-response";

export type DatabaseError = { code: string; message: string };

// Fixed identifiers and argument lists: request data is always parameterized.
const functions = {
  create_room: ["p_user_id", "p_name", "p_host_name"],
  join_room: ["p_user_id", "p_invite_token", "p_display_name"],
  get_room_snapshot: ["p_user_id", "p_room_id"],
  get_saved_round_estimates: ["p_user_id", "p_room_id"],
  add_task: ["p_user_id", "p_room_id", "p_title"],
  submit_vote: ["p_user_id", "p_room_id", "p_value", "p_cannot_estimate"],
  reveal_round: ["p_user_id", "p_room_id"],
  save_round: ["p_user_id", "p_room_id", "p_development_estimate", "p_testing_estimate", "p_unestimated"],
  start_next_round: ["p_user_id", "p_room_id"],
} as const;

const globalDatabase = globalThis as typeof globalThis & { pokerPool?: Pool };

export function createDatabaseClient() {
  if (!process.env.DATABASE_URL) {
    throw new ApiConfigurationError("PostgreSQL is not configured. Set DATABASE_URL in .env.local and restart the server. For a sandbox, run npm run dev:local.");
  }
  const pool = globalDatabase.pokerPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Handle idle connection failures without logging credentials or query data.
  if (pool.listenerCount("error") === 0) pool.on("error", () => console.error("[Poker Planning] Idle database connection failed"));

  return {
    async rpc(name: keyof typeof functions, args: Record<string, unknown>) {
      const parameters = functions[name];
      const placeholders = parameters.map((_, index) => `$${index + 1}`).join(", ");
      try {
        const result = await pool.query(`select public.${name}(${placeholders}) as data`, parameters.map((key) => args[key]));
        return { data: result.rows[0]?.data, error: null };
      } catch (error) {
        const failure = error as { code?: string; message?: string };
        return { data: null, error: { code: failure.code ?? "UNKNOWN", message: failure.message ?? "Database request failed" } };
      }
    },
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
