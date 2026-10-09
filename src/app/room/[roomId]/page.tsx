import { Suspense } from "react";
import RoomClient from "@/components/room-client";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ invite?: string }>;
};

export default function RoomPage(props: RoomPageProps) {
  return <Suspense fallback={<main className="room-message">Opening your table</main>}><RoomContent {...props} /></Suspense>;
}

async function RoomContent({ params, searchParams }: RoomPageProps) {
  const [{ roomId }, query] = await Promise.all([params, searchParams]);
  return <RoomClient roomId={roomId} inviteToken={query.invite ?? ""} />;
}