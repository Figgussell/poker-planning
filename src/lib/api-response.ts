import type { DatabaseError } from "@/lib/database";
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

export function databaseErrorResponse(error: DatabaseError) {
  const status = error.code === "42501" ? 403 : error.code === "28000" ? 401 : error.code === "55000" ? 409 : ["22023", "22P02", "22003"].includes(error.code) ? 400 : 500;
  if (status !== 500) return noStoreJson({ error: error.message }, status);

  // Only expose structured error codes, never database details or failing rows.
  const code = /^[A-Z0-9]{5}$/.test(error.code) ? error.code : "UNKNOWN";
  console.error("[Poker Planning] Database request failed", { code });

  if (["42883", "42P01", "42703"].includes(code)) {
    return noStoreJson({
      error: `The database schema or a required function is unavailable (${code}). Check that all migrations were applied to the PostgreSQL database used by this site.`,
      code,
    }, 503);
  }
  return noStoreJson({ error: `The request could not be completed. Database error code: ${code}.`, code }, 500);
}

export function localDemoErrorResponse(error: unknown) {
  if (error instanceof LocalDemoError) return noStoreJson({ error: error.message }, error.status);
  return noStoreJson({ error: "The local demo request could not be completed." }, 500);
}
