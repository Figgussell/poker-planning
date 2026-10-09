"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Layers3, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/read-api-response";

export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [localMode, setLocalMode] = useState(process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === "1");

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const session = await fetch("/api/session", { method: "POST" });
      const sessionData = await readApiResponse(session, "Session could not be started.");
      setLocalMode(sessionData.mode === "local-demo");
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, displayName }),
      });
      const result = await readApiResponse<{ roomId: string; inviteToken: string }>(response, "Room could not be created.");
      router.push(`/room/${result.roomId}?invite=${encodeURIComponent(result.inviteToken)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Room could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="home-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Poker Planning home">
          <span className="brand-mark"><Layers3 size={17} strokeWidth={2.2} /></span>
          <span>Poker Planning</span>
        </Link>
        <div className="topbar-status"><span className="topbar-note">TEAM ESTIMATION ROOM</span>{localMode && <span className="local-mode-tag">LOCAL SANDBOX</span>}</div>
      </header>

      <div className="home-content">
        <section className="home-intro">
          <p className="eyebrow"><span className="eyebrow-line" /> SPRINT PLANNING, TOGETHER</p>
          <h1>Good estimates.<br /><em>No guesswork.</em></h1>
          <p className="intro-copy">Bring the team to the same table. Vote independently, reveal together, and keep every round in reach.</p>
          <div className="intro-footer">
            <div className="avatar-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span><span>+</span></div>
            <span>One room. Every point of view.</span>
          </div>
        </section>

        <section className="launch-panel" aria-labelledby="launch-title">
          <div className="panel-heading">
            <div className="panel-index">01 <span> / START HERE</span></div>
            <div className="panel-icon"><Plus size={18} /></div>
          </div>
          <h2 id="launch-title">Create a room</h2>
          <p className="panel-copy">Set up a private table and invite your team with one link.</p>
          <form className="form-stack" onSubmit={createRoom}>
            <label className="field-label" htmlFor="room-name">ROOM NAME</label>
            <input id="room-name" className="text-input" maxLength={80} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Platform team" required value={roomName} />
            <label className="field-label" htmlFor="display-name">YOUR NAME</label>
            <input id="display-name" className="text-input" maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="How the team knows you" required value={displayName} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary create-button" disabled={pending} type="submit">
              {pending ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
              {pending ? "Creating room" : "Open a room"}
            </button>
          </form>
          <div className="panel-footnote"><span className="live-dot" /> No account needed to join</div>
        </section>
      </div>
      <footer className="home-footer"><span>BUILT FOR THE WORK AHEAD</span><span>ESTIMATE INDEPENDENTLY · DECIDE TOGETHER</span></footer>
    </main>
  );
}
