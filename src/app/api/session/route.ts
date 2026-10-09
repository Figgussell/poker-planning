import { noStoreJson } from "@/lib/api-response";
import { createAppSession, getAppUserId } from "@/lib/local-demo-auth";
import { isLocalDemoEnabled } from "@/lib/local-demo";

export async function POST() {
  try {
    const userId = await getAppUserId() ?? await createAppSession();
    return noStoreJson({ userId, mode: isLocalDemoEnabled() ? "local-demo" : "supabase" });
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : "Could not create an application session." }, 503);
  }
}