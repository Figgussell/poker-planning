import type { PostgrestError } from "@supabase/supabase-js";
import { LocalDemoError } from "@/lib/local-demo";

export function noStoreJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export function databaseErrorResponse(error: PostgrestError) {
  const status = error.code === "42501" ? 403 : error.code === "28000" ? 401 : error.code === "55000" ? 409 : error.code === "22023" ? 400 : 500;
  return noStoreJson({ error: status === 500 ? "The request could not be completed." : error.message }, status);
}

export function localDemoErrorResponse(error: unknown) {
  if (error instanceof LocalDemoError) return noStoreJson({ error: error.message }, error.status);
  return noStoreJson({ error: "The local demo request could not be completed." }, 500);
}