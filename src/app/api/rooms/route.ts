import { databaseErrorResponse, localDemoErrorResponse, noStoreJson } from "@/lib/api-response";
import { getLocalUserId } from "@/lib/local-demo-auth";
import { createLocalRoom, isLocalDemoEnabled } from "@/lib/local-demo";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.roomName !== "string" || typeof body.displayName !== "string") {
    return noStoreJson({ error: "Enter a room name and your name." }, 400);
  }

  if (isLocalDemoEnabled()) {
    try {
      const userId = await getLocalUserId();
      if (!userId) return noStoreJson({ error: "Start a local session first." }, 401);
      return noStoreJson(await createLocalRoom(userId, body.roomName, body.displayName));
    } catch (error) {
      return localDemoErrorResponse(error);
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_room", {
    p_name: body.roomName,
    p_host_name: body.displayName,
  });
  if (error) return databaseErrorResponse(error);

  const created = data as { room_id: string; invite_token: string };
  const { data: snapshot, error: snapshotError } = await getRoomSnapshot(supabase, created.room_id);
  if (snapshotError) return databaseErrorResponse(snapshotError);

  return noStoreJson({ roomId: created.room_id, inviteToken: created.invite_token, snapshot });
}