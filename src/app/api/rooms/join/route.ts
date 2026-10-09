import { databaseErrorResponse, localDemoErrorResponse, noStoreJson } from "@/lib/api-response";
import { getLocalUserId } from "@/lib/local-demo-auth";
import { isLocalDemoEnabled, joinLocalRoom } from "@/lib/local-demo";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.inviteToken !== "string" || typeof body.displayName !== "string") {
    return noStoreJson({ error: "An invitation and display name are required." }, 400);
  }

  if (isLocalDemoEnabled()) {
    try {
      const userId = await getLocalUserId();
      if (!userId) return noStoreJson({ error: "Start a local session first." }, 401);
      return noStoreJson(await joinLocalRoom(userId, body.inviteToken, body.displayName));
    } catch (error) {
      return localDemoErrorResponse(error);
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data: roomId, error } = await supabase.rpc("join_room", {
    p_invite_token: body.inviteToken,
    p_display_name: body.displayName,
  });
  if (error) return databaseErrorResponse(error);

  const { data: snapshot, error: snapshotError } = await getRoomSnapshot(supabase, roomId);
  if (snapshotError) return databaseErrorResponse(snapshotError);
  return noStoreJson({ roomId, snapshot });
}