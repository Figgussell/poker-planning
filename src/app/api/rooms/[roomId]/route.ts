import { databaseErrorResponse, localDemoErrorResponse, noStoreJson } from "@/lib/api-response";
import { getAppUserId } from "@/lib/local-demo-auth";
import { getLocalSnapshot, isLocalDemoEnabled, runLocalAction } from "@/lib/local-demo";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ActionBody = {
  action?: string;
  title?: unknown;
  value?: unknown;
  developmentEstimate?: unknown;
  testingEstimate?: unknown;
  cannotEstimate?: unknown;
  unestimated?: unknown;
};

const estimatePattern = /^(?:\d{1,16}(?:\.\d{1,8})?|\.\d{1,8})$/;

export async function GET(_request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  if (isLocalDemoEnabled()) {
    try {
      const userId = await getAppUserId();
      if (!userId) return noStoreJson({ error: "Start a local session first." }, 401);
      return noStoreJson(await getLocalSnapshot(roomId, userId));
    } catch (error) {
      return localDemoErrorResponse(error);
    }
  }

  const userId = await getAppUserId();
  if (!userId) return noStoreJson({ error: "Start a session first." }, 401);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await getRoomSnapshot(supabase, userId, roomId);
  if (error) return databaseErrorResponse(error);
  return noStoreJson(data);
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body || typeof body.action !== "string") return noStoreJson({ error: "Choose an action." }, 400);

  if (isLocalDemoEnabled()) {
    try {
      const userId = await getAppUserId();
      if (!userId) return noStoreJson({ error: "Start a local session first." }, 401);
      return noStoreJson(await runLocalAction(roomId, userId, body));
    } catch (error) {
      return localDemoErrorResponse(error);
    }
  }

  const userId = await getAppUserId();
  if (!userId) return noStoreJson({ error: "Start a session first." }, 401);
  const supabase = createSupabaseAdminClient();
  let error;

  if (body.action === "add-task" && typeof body.title === "string") {
    ({ error } = await supabase.rpc("add_task", { p_user_id: userId, p_room_id: roomId, p_title: body.title }));
  } else if (body.action === "vote" && body.cannotEstimate === true) {
    ({ error } = await supabase.rpc("submit_vote", {
      p_user_id: userId,
      p_room_id: roomId,
      p_value: null,
      p_cannot_estimate: true,
    }));
  } else if (body.action === "vote" && typeof body.value === "string" && estimatePattern.test(body.value)) {
    ({ error } = await supabase.rpc("submit_vote", {
      p_user_id: userId,
      p_room_id: roomId,
      p_value: body.value,
      p_cannot_estimate: false,
    }));
  } else if (body.action === "reveal") {
    ({ error } = await supabase.rpc("reveal_round", { p_user_id: userId, p_room_id: roomId }));
  } else if (body.action === "save-result" && body.unestimated === true) {
    ({ error } = await supabase.rpc("save_round", {
      p_user_id: userId,
      p_room_id: roomId,
      p_development_estimate: null,
      p_testing_estimate: null,
      p_unestimated: true,
    }));
  } else if (body.action === "save-result"
    && typeof body.developmentEstimate === "string"
    && typeof body.testingEstimate === "string"
    && estimatePattern.test(body.developmentEstimate)
    && estimatePattern.test(body.testingEstimate)) {
    ({ error } = await supabase.rpc("save_round", {
      p_user_id: userId,
      p_room_id: roomId,
      p_development_estimate: body.developmentEstimate,
      p_testing_estimate: body.testingEstimate,
      p_unestimated: false,
    }));
  } else if (body.action === "next-round") {
    ({ error } = await supabase.rpc("start_next_round", { p_user_id: userId, p_room_id: roomId }));
  } else {
    return noStoreJson({ error: "The action or estimate is invalid." }, 400);
  }

  if (error) return databaseErrorResponse(error);
  const { data, error: snapshotError } = await getRoomSnapshot(supabase, userId, roomId);
  if (snapshotError) return databaseErrorResponse(snapshotError);
  return noStoreJson(data);
}