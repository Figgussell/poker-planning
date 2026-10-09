import { noStoreJson } from "@/lib/api-response";
import { createLocalSession, getLocalUserId } from "@/lib/local-demo-auth";
import { isLocalDemoEnabled } from "@/lib/local-demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    if (isLocalDemoEnabled()) {
      const userId = await getLocalUserId() ?? await createLocalSession();
      return noStoreJson({ userId, mode: "local-demo" });
    }

    const supabase = await createSupabaseServerClient();
    const { data: current } = await supabase.auth.getUser();
    if (current.user) return noStoreJson({ userId: current.user.id });

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      return noStoreJson({ error: error?.message ?? "Could not create a session." }, 503);
    }
    return noStoreJson({ userId: data.user.id });
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : "Supabase is unavailable." }, 503);
  }
}