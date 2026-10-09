import type { PostgrestError } from "@supabase/supabase-js";
import { LocalDemoError } from "@/lib/local-demo";

export class ApiConfigurationError extends Error {}

export function withApiErrorHandling<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiConfigurationError) {
        return noStoreJson({ error: error.message }, 503);
      }
      return noStoreJson({ error: "The request could not be completed. Please try again." }, 500);
    }
  };
}

export function noStoreJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export function databaseErrorResponse(error: PostgrestError) {
  const status = error.code === "42501" ? 403 : error.code === "28000" ? 401 : error.code === "55000" ? 409 : error.code === "22023" ? 400 : 500;
  if (status !== 500) return noStoreJson({ error: error.message }, status);

  // Only expose structured error codes, never database details or failing rows.
  const code = /^(?:[A-Z0-9]{5}|PGRST[A-Z0-9]{3})$/.test(error.code) ? error.code : "UNKNOWN";
  console.error("[Poker Planning] Database request failed", { code });

  if (["PGRST202", "PGRST204", "PGRST205", "42883", "42P01", "42703"].includes(code)) {
    return noStoreJson({
      error: `The database schema or a required function is unavailable (${code}). Check that all migrations were applied to the Supabase project used by this site and refresh its API schema cache.`,
      code,
    }, 503);
  }
  if (["PGRST301", "PGRST302", "PGRST303"].includes(code)) {
    return noStoreJson({
      error: `Supabase rejected the server credentials (${code}). Check that the project URL and service-role key belong to the same project.`,
      code,
    }, 503);
  }
  return noStoreJson({ error: `The request could not be completed. Database error code: ${code}.`, code }, 500);
}

export function localDemoErrorResponse(error: unknown) {
  if (error instanceof LocalDemoError) return noStoreJson({ error: error.message }, error.status);
  return noStoreJson({ error: "The local demo request could not be completed." }, 500);
}
