"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

type Vote = { display_name: string; value: number | string | null; cannot_estimate: boolean };
type Round = {
  id: string;
  number: number;
  status: "voting" | "revealed" | "complete";
  my_vote: { value: number | string | null; cannot_estimate: boolean } | null;
  votes: Vote[] | null;
  final_estimate: number | string | null;
  final_unestimated: boolean;
  development_estimate: number | string | null;
  testing_estimate: number | string | null;
};
type Task = { id: string; number: number; title: string };
type HistoryTask = Task & { rounds: Array<Pick<Round, "id" | "number" | "status" | "votes" | "final_estimate" | "final_unestimated" | "development_estimate" | "testing_estimate">> };
type Snapshot = {
  room: { id: string; name: string };
  viewer: { member_id: string; display_name: string; role: "host" | "participant" };
  participants: Array<{ member_id: string; display_name: string; role: string; has_voted: boolean }>;
  active_task: Task | null;
  active_round: Round | null;
  history: HistoryTask[];
};

type PageState = "loading" | "join" | "ready" | "error";

async function fetchRoom(roomId: string) {
  const response = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Room could not be loaded.");
  return result as Snapshot;
}

function estimateTotalPreview(development: string, testing: string) {
  if (!development || !testing) return "—";
  const toUnits = (value: string) => {
    const [integer = "0", fraction = ""] = value.split(".");
    return BigInt(`${integer || "0"}${fraction.padEnd(8, "0")}`);
  };
  const sum = (toUnits(development) + toUnits(testing)).toString().padStart(9, "0");
  const fraction = sum.slice(-8).replace(/0+$/, "");
  return fraction ? `${sum.slice(0, -8)}.${fraction}` : sum.slice(0, -8);
}

export default function RoomClient({ roomId, inviteToken }: { roomId: string; inviteToken: string }) {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [voteValue, setVoteValue] = useState("");
  const [developmentValue, setDevelopmentValue] = useState("");
  const [testingValue, setTestingValue] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [localMode, setLocalMode] = useState(process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === "1");

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setPageState("loading");
      try {
        const session = await fetch("/api/session", { method: "POST" });
        const sessionData = await session.json();
        if (!session.ok) throw new Error(sessionData.error ?? "Session could not be started.");
        setLocalMode(sessionData.mode === "local-demo");
        const state = await fetchRoom(roomId);
        if (!cancelled) {
          setSnapshot(state);
          setPageState("ready");
        }
      } catch (cause) {
        if (cancelled) return;
        if (inviteToken) {
          setPageState("join");
        } else {
          setError(cause instanceof Error ? cause.message : "Room could not be loaded.");
          setPageState("error");
        }
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [roomId, inviteToken]);

  useEffect(() => {
    if (pageState !== "ready") return;
    const timer = window.setInterval(() => {
      void fetchRoom(roomId).then(setSnapshot).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pageState, roomId]);

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("join");
    setError("");
    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken, displayName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not join this room.");
      setSnapshot(result.snapshot as Snapshot);
      setPageState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this room.");
    } finally {
      setPending("");
    }
  }

  async function act(action: string, values: Record<string, unknown> = {}) {
    setPending(action);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action could not be completed.");
      setSnapshot(result as Snapshot);
      if (action === "vote") setVoteValue("");
      if (action === "save-result") {
        setDevelopmentValue("");
        setTestingValue("");
      }
      if (action === "add-task") setTaskTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action could not be completed.");
    } finally {
      setPending("");
    }
  }

  async function copyInvite() {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (pageState === "loading") return <RoomLoading />;
  if (pageState === "error") return <RoomMessage message={error} />;
  if (pageState === "join") {
    return (
      <main className="join-screen">
        <Link className="brand" href="/"><span className="brand-mark"><UsersRound size={17} /></span><span>Poker Planning</span></Link>
        <form className="join-panel" onSubmit={joinRoom}>
          <div className="panel-index">INVITATION <span> / ROOM ACCESS</span></div>
          <h1>You&apos;re invited.</h1>
          <p className="panel-copy">Choose a name your team will recognize.</p>
          <label className="field-label" htmlFor="join-name">YOUR NAME</label>
          <input autoComplete="name" className="text-input" id="join-name" maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Jordan" required value={displayName} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary create-button" disabled={pending === "join"} type="submit">
            {pending === "join" ? <LoaderCircle className="spin" size={17} /> : <ArrowLeft className="flip-icon" size={17} />}
            Join the room
          </button>
        </form>
      </main>
    );
  }

  if (!snapshot) return <RoomMessage message="Room state is unavailable." />;
  const { active_round: round, active_task: task } = snapshot;
  const isHost = snapshot.viewer.role === "host";
  const revealed = round?.status === "revealed" || round?.status === "complete";
  const complete = round?.status === "complete";

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <Link className="brand" href="/"><span className="brand-mark"><UsersRound size={17} /></span><span>Poker Planning</span></Link>
        <div className="room-breadcrumb"><span>{snapshot.room.name}</span><span className="breadcrumb-separator">/</span><strong>{snapshot.viewer.display_name}</strong>{isHost && <span className="host-tag">HOST</span>}{localMode && <span className="local-mode-tag">LOCAL</span>}</div>
        <button className="button button-quiet invite-button" onClick={() => void copyInvite()} title="Copy invitation link" type="button">
          {copied ? <Check size={16} /> : <Copy size={15} />}<span>{copied ? "Copied" : "Invite"}</span>
        </button>
      </header>

      <div className="room-layout">
        <aside className="room-sidebar">
          <div className="sidebar-section-title"><span>AT THE TABLE</span><span className="member-count">{snapshot.participants.length}</span></div>
          <ul className="participant-list">
            {snapshot.participants.map((person, index) => (
              <li className="participant-row" key={person.member_id}>
                <span className={`participant-avatar avatar-${index % 4}`}>{person.display_name.trim().charAt(0).toUpperCase()}</span>
                <span className="participant-info"><strong>{person.display_name}{person.member_id === snapshot.viewer.member_id ? <small>YOU</small> : null}</strong><span>{person.role === "host" ? "Host" : "Participant"}</span></span>
                <span className={`vote-status ${person.has_voted ? "vote-status-done" : ""}`} title={person.has_voted ? "Vote submitted" : "Waiting for vote"}>{person.has_voted ? <Check size={13} /> : <span />}</span>
              </li>
            ))}
          </ul>

          <div className="sidebar-divider" />
          <div className="sidebar-section-title"><span>ROUND HISTORY</span><span className="member-count">{snapshot.history.length}</span></div>
          {snapshot.history.length === 0 ? <p className="history-empty">Your completed tasks will collect here.</p> : (
            <ol className="history-list">
              {snapshot.history.map((historyTask) => (
                <li key={historyTask.id}>
                  <details className="history-disclosure" open={historyTask.id !== task?.id}>
                    <summary className={`history-item ${historyTask.id === task?.id ? "history-item-current" : ""}`}>
                      <span className="history-number">{String(historyTask.number).padStart(2, "0")}</span>
                      <span className="history-copy"><strong>{historyTask.title}</strong><span>{historyTask.rounds.length} {historyTask.rounds.length === 1 ? "round" : "rounds"}</span></span>
                      {historyTask.rounds.every((item) => item.status === "complete") && <CheckCheck className="history-check" size={15} />}
                    </summary>
                    <div className="history-round-list">
                      {historyTask.rounds.map((historyRound) => (
                        <section className="history-round" key={historyRound.id}>
                          <div className="history-round-heading"><strong>ROUND {String(historyRound.number).padStart(2, "0")}</strong><span>{historyRound.status === "complete" ? "SAVED" : historyRound.status === "revealed" ? "REVEALED" : "IN PROGRESS"}</span></div>
                          {historyRound.status === "complete" && (
                            <div className="history-estimate-grid">
                              <div><span>DEV</span><strong>{historyRound.final_unestimated ? "—" : historyRound.development_estimate}</strong></div>
                              <div><span>TEST</span><strong>{historyRound.final_unestimated ? "—" : historyRound.testing_estimate}</strong></div>
                              <div><span>TOTAL</span><strong>{historyRound.final_unestimated ? "—" : historyRound.final_estimate}</strong></div>
                            </div>
                          )}
                          {historyRound.status === "voting" ? <p className="history-private">Votes are private while this round is in progress.</p> : (
                            <ul className="history-votes">
                              {(historyRound.votes ?? []).map((vote, index) => (
                                <li key={`${vote.display_name}-${index}`}><span>{vote.display_name}</span><strong>{vote.cannot_estimate ? "Cannot estimate" : vote.value}</strong></li>
                              ))}
                              {historyRound.votes?.length === 0 && <li className="history-private">No votes submitted</li>}
                            </ul>
                          )}
                        </section>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
          <div className="sidebar-bottom"><span className="live-dot" /> Updates every few seconds</div>
        </aside>

        <section className="room-main">
          <div className="room-kicker"><span className="round-pill">{round ? `ROUND ${String(round.number).padStart(2, "0")}` : "READY"}</span><span className="kicker-divider">/</span><span>{task ? `TASK ${String(task.number).padStart(2, "0")}` : "FIRST TASK"}</span></div>

          {task ? (
            <div className="task-heading"><p className="task-label">CURRENT STORY</p><h1>{task.title}</h1></div>
          ) : (
            <div className="task-heading empty-task"><p className="task-label">THE TABLE IS YOURS</p><h1>What are we<br /><em>estimating?</em></h1></div>
          )}

          {!task && isHost && <TaskForm title={taskTitle} setTitle={setTaskTitle} pending={pending} onSubmit={() => void act("add-task", { title: taskTitle })} />}

          {task && round?.status === "voting" && (
            <div className="vote-area">
              <div className="section-rule"><span>YOUR ESTIMATE</span><span className="rule-line" /><span className="private-label"><EyeOff size={13} /> PRIVATE</span></div>
              {round.my_vote ? <p className="submitted-note"><Check size={15} /> Your vote: <strong>{round.my_vote.cannot_estimate ? "Cannot estimate" : round.my_vote.value}</strong>. It stays private until the host reveals.</p> : <p className="vote-prompt">Choose a number that reflects the work, not the room.</p>}
              <form className="vote-form" onSubmit={(event) => { event.preventDefault(); void act("vote", { value: voteValue }); }}>
                <label className="visually-hidden" htmlFor="estimate">Your estimate</label>
                <input className="estimate-input" id="estimate" inputMode="decimal" max="9999999999999999.99999999" min="0" onChange={(event) => setVoteValue(event.target.value)} placeholder="0" step="any" type="number" value={voteValue} />
                <button className="button button-primary vote-submit" disabled={pending === "vote" || voteValue === ""} type="submit">{pending === "vote" ? <LoaderCircle className="spin" size={16} /> : <Send size={15} />} Vote</button>
              </form>
              <button className="cannot-button" disabled={pending === "vote"} onClick={() => void act("vote", { cannotEstimate: true })} type="button"><CircleHelp size={15} /> Cannot estimate</button>
              {isHost && <div className="host-reveal-row"><span>Everyone has made their estimate?</span><button className="button button-primary" disabled={pending === "reveal"} onClick={() => void act("reveal")} type="button">{pending === "reveal" ? <LoaderCircle className="spin" size={16} /> : <Eye size={15} />} Reveal votes</button></div>}
            </div>
          )}

          {task && round && revealed && (
            <div className="results-area">
              <div className="section-rule"><span>REVEALED VOTES</span><span className="rule-line" /><span className="revealed-label"><Eye size={14} /> VISIBLE TO ALL</span></div>
              <div className="result-grid">
                {(round.votes ?? []).map((vote, index) => (
                  <div className={`result-tile result-tile-${index % 4}`} key={`${vote.display_name}-${index}`}><span>{vote.display_name}</span><strong>{vote.cannot_estimate ? "—" : vote.value}</strong><small>{vote.cannot_estimate ? "Cannot estimate" : "points"}</small></div>
                ))}
                {round.votes?.length === 0 && <p className="no-votes">No votes were submitted in this round.</p>}
              </div>
              {complete ? (
                <div className="saved-result"><span>DEVELOPMENT</span><strong>{round.final_unestimated ? "—" : round.development_estimate}</strong><small>points</small><span>TESTING</span><strong>{round.final_unestimated ? "—" : round.testing_estimate}</strong><small>points</small><span>TOTAL ESTIMATE</span><strong>{round.final_unestimated ? "Unestimated" : round.final_estimate}</strong><small>points</small></div>
              ) : isHost ? (
                <div className="host-result-controls">
                  <div className="final-estimate-grid">
                    <div><label className="field-label" htmlFor="development-estimate">DEVELOPMENT</label><input className="text-input final-input" id="development-estimate" inputMode="decimal" min="0" onChange={(event) => setDevelopmentValue(event.target.value)} placeholder="e.g. 3.5" step="any" type="number" value={developmentValue} /></div>
                    <div><label className="field-label" htmlFor="testing-estimate">TESTING</label><input className="text-input final-input" id="testing-estimate" inputMode="decimal" min="0" onChange={(event) => setTestingValue(event.target.value)} placeholder="e.g. 1" step="any" type="number" value={testingValue} /></div>
                  </div>
                  <p className="estimate-total-preview">TOTAL <strong>{estimateTotalPreview(developmentValue, testingValue)}</strong></p>
                  <button className="button button-primary" disabled={pending === "save-result" || developmentValue === "" || testingValue === ""} onClick={() => void act("save-result", { developmentEstimate: developmentValue, testingEstimate: testingValue })} type="button">Save estimates</button>
                  <button className="text-action" disabled={pending === "save-result"} onClick={() => void act("save-result", { unestimated: true })} type="button">Mark task unestimated</button>
                </div>
              ) : <p className="waiting-host"><span className="live-dot" /> Waiting for {snapshot.participants.find((person) => person.role === "host")?.display_name ?? "the host"} to save the result.</p>}
            </div>
          )}

          {task && complete && isHost && (
            <div className="next-round-row">
              <button className="button button-primary" disabled={pending === "next-round"} onClick={() => void act("next-round")} type="button">{pending === "next-round" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={15} />} Start next round</button>
              <span>Run another vote on this story or add the next task.</span>
            </div>
          )}

          {task && isHost && (complete || !round) && <TaskForm compact title={taskTitle} setTitle={setTaskTitle} pending={pending} onSubmit={() => void act("add-task", { title: taskTitle })} />}

          {error && <p className="inline-error" role="alert">{error}</p>}
          {task && !revealed && <div className="privacy-note"><EyeOff size={15} /><span>Votes stay hidden until the host reveals the round. You can only see your own.</span></div>}
          {task && revealed && <div className="privacy-note privacy-note-open"><Eye size={15} /><span>Votes are visible to everyone. The round is saved in room history.</span></div>}
        </section>
      </div>
    </main>
  );
}

function TaskForm({ title, setTitle, pending, onSubmit, compact = false }: { title: string; setTitle: (value: string) => void; pending: string; onSubmit: () => void; compact?: boolean }) {
  return (
    <form className={`task-form ${compact ? "task-form-compact" : ""}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label className="field-label" htmlFor={compact ? "next-task" : "first-task"}>{compact ? "NEXT TASK" : "TASK TITLE"}</label>
      <div className="task-input-row">
        <input className="text-input" id={compact ? "next-task" : "first-task"} maxLength={240} onChange={(event) => setTitle(event.target.value)} placeholder="Add a story or task" required value={title} />
        <button className="button button-primary" disabled={pending === "add-task" || !title.trim()} type="submit">{pending === "add-task" ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Add task</button>
      </div>
    </form>
  );
}

function RoomLoading() {
  return <main className="room-message"><LoaderCircle className="spin" size={22} /><span>Opening your table</span></main>;
}

function RoomMessage({ message }: { message: string }) {
  return <main className="room-message"><Link className="brand" href="/"><span className="brand-mark"><UsersRound size={17} /></span><span>Poker Planning</span></Link><p role="alert">{message}</p><Link className="button button-primary" href="/">Back to rooms</Link></main>;
}