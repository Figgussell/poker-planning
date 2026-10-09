import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type Role = "host" | "participant";
type Member = { member_id: string; user_id: string; display_name: string; role: Role; joined_at: string };
type Vote = { value: string | null; cannot_estimate: boolean };
type Round = {
  id: string;
  number: number;
  status: "voting" | "revealed" | "complete";
  final_estimate: string | null;
  final_unestimated: boolean;
  development_estimate?: string | null;
  testing_estimate?: string | null;
  votes: Record<string, Vote>;
};
type Task = { id: string; number: number; title: string; rounds: Round[] };
type Room = {
  id: string;
  name: string;
  invite_hash: string;
  created_at: string;
  members: Member[];
  tasks: Task[];
  active_task_id: string | null;
  active_round_id: string | null;
};
type Store = { rooms: Record<string, Room> };

export class LocalDemoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type DemoGlobal = typeof globalThis & { __tablePlanLocalWriteQueue?: Promise<void> };
const demoGlobal = globalThis as DemoGlobal;
const storePath = path.join(process.cwd(), "data", "local-demo.json");
const estimatePattern = /^(?:\d{1,16}(?:\.\d{1,8})?|\.\d{1,8})$/;

function addEstimates(development: string, testing: string) {
  const scale = (value: string) => {
    const [integer = "0", fraction = ""] = value.split(".");
    return BigInt(`${integer || "0"}${fraction.padEnd(8, "0")}`);
  };
  const sum = (scale(development) + scale(testing)).toString().padStart(9, "0");
  const integer = sum.slice(0, -8);
  const fraction = sum.slice(-8).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

export function isLocalDemoEnabled() {
  return process.env.LOCAL_DEMO_MODE === "1" && process.env.NODE_ENV !== "production";
}

export function hashInvite(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as Store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rooms: {} };
    throw error;
  }
}

async function updateStore<T>(update: (store: Store) => T): Promise<T> {
  let release!: () => void;
  const previous = demoGlobal.__tablePlanLocalWriteQueue ?? Promise.resolve();
  demoGlobal.__tablePlanLocalWriteQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const store = await readStore();
    const result = update(store);
    await mkdir(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    await rename(temporaryPath, storePath);
    return result;
  } finally {
    release();
  }
}

function findMember(room: Room, userId: string) {
  const member = room.members.find((item) => item.user_id === userId);
  if (!member) throw new LocalDemoError("Room membership required", 403);
  return member;
}

function findHost(room: Room, userId: string) {
  const member = findMember(room, userId);
  if (member.role !== "host") throw new LocalDemoError("Host role required", 403);
  return member;
}

function findRoom(store: Store, roomId: string) {
  const room = store.rooms[roomId];
  if (!room) throw new LocalDemoError("Room not found", 404);
  return room;
}

function activeItems(room: Room) {
  const task = room.tasks.find((item) => item.id === room.active_task_id) ?? null;
  const round = task?.rounds.find((item) => item.id === room.active_round_id) ?? null;
  return { task, round };
}

function revealedVotes(room: Room, round: Round) {
  return Object.entries(round.votes).map(([memberId, vote]) => ({
    display_name: room.members.find((member) => member.member_id === memberId)?.display_name ?? "Participant",
    value: vote.value,
    cannot_estimate: vote.cannot_estimate,
  }));
}

function makeSnapshot(room: Room, userId: string) {
  const viewer = findMember(room, userId);
  const { task, round } = activeItems(room);
  return {
    room: { id: room.id, name: room.name },
    viewer: { member_id: viewer.member_id, display_name: viewer.display_name, role: viewer.role },
    participants: room.members.map((member) => ({
      member_id: member.member_id,
      display_name: member.display_name,
      role: member.role,
      has_voted: Boolean(round?.votes[member.member_id]),
    })),
    active_task: task ? { id: task.id, number: task.number, title: task.title } : null,
    active_round: round ? {
      id: round.id,
      number: round.number,
      status: round.status,
      my_vote: round.votes[viewer.member_id] ?? null,
      votes: round.status === "voting" ? null : revealedVotes(room, round),
      final_estimate: round.final_estimate,
      final_unestimated: round.final_unestimated,
      development_estimate: round.development_estimate ?? (round.final_estimate !== null && !round.final_unestimated ? round.final_estimate : null),
      testing_estimate: round.testing_estimate ?? (round.final_estimate !== null && !round.final_unestimated ? "0" : null),
    } : null,
    history: [...room.tasks].sort((left, right) => right.number - left.number).map((historyTask) => ({
      id: historyTask.id,
      number: historyTask.number,
      title: historyTask.title,
      rounds: historyTask.rounds.map((historyRound) => ({
        id: historyRound.id,
        number: historyRound.number,
        status: historyRound.status,
        final_estimate: historyRound.final_estimate,
        final_unestimated: historyRound.final_unestimated,
        development_estimate: historyRound.development_estimate ?? (historyRound.final_estimate !== null && !historyRound.final_unestimated ? historyRound.final_estimate : null),
        testing_estimate: historyRound.testing_estimate ?? (historyRound.final_estimate !== null && !historyRound.final_unestimated ? "0" : null),
        votes: historyRound.status === "voting" ? null : revealedVotes(room, historyRound),
      })),
    })),
  };
}

export async function createLocalRoom(userId: string, roomName: string, displayName: string) {
  const name = roomName.trim();
  const person = displayName.trim();
  if (name.length < 1 || name.length > 80 || person.length < 1 || person.length > 40) {
    throw new LocalDemoError("Enter a room name and a display name.", 400);
  }

  const roomId = randomUUID();
  const inviteToken = randomBytes(32).toString("hex");
  const host: Member = {
    member_id: randomUUID(),
    user_id: userId,
    display_name: person,
    role: "host",
    joined_at: new Date().toISOString(),
  };
  const room: Room = {
    id: roomId,
    name,
    invite_hash: hashInvite(inviteToken),
    created_at: new Date().toISOString(),
    members: [host],
    tasks: [],
    active_task_id: null,
    active_round_id: null,
  };

  await updateStore((store) => { store.rooms[roomId] = room; });
  return { roomId, inviteToken, snapshot: makeSnapshot(room, userId) };
}

export async function joinLocalRoom(userId: string, inviteToken: string, displayName: string) {
  const person = displayName.trim();
  if (person.length < 1 || person.length > 40) throw new LocalDemoError("Display name must contain 1 to 40 characters", 400);
  const inviteHash = hashInvite(inviteToken);
  const roomId = await updateStore((store) => {
    const room = Object.values(store.rooms).find((item) => item.invite_hash === inviteHash);
    if (!room) throw new LocalDemoError("Invalid invitation", 400);
    const existing = room.members.find((member) => member.user_id === userId);
    if (existing) {
      existing.display_name = person;
    } else {
      room.members.push({ member_id: randomUUID(), user_id: userId, display_name: person, role: "participant", joined_at: new Date().toISOString() });
    }
    return room.id;
  });
  return { roomId, snapshot: await getLocalSnapshot(roomId, userId) };
}

export async function getLocalSnapshot(roomId: string, userId: string) {
  const store = await readStore();
  return makeSnapshot(findRoom(store, roomId), userId);
}

export async function runLocalAction(roomId: string, userId: string, body: Record<string, unknown>) {
  const result = await updateStore((store) => {
    const room = findRoom(store, roomId);
    const member = findMember(room, userId);
    const { task, round } = activeItems(room);
    const action = body.action;

    if (action === "add-task") {
      findHost(room, userId);
      if (round && round.status !== "complete") throw new LocalDemoError("Complete the active round before adding another task", 409);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (title.length < 1 || title.length > 240) throw new LocalDemoError("Task title must contain 1 to 240 characters", 400);
      const newTask: Task = {
        id: randomUUID(),
        number: room.tasks.length + 1,
        title,
        rounds: [{ id: randomUUID(), number: 1, status: "voting", final_estimate: null, final_unestimated: false, development_estimate: null, testing_estimate: null, votes: {} }],
      };
      room.tasks.push(newTask);
      room.active_task_id = newTask.id;
      room.active_round_id = newTask.rounds[0].id;
    } else if (action === "vote") {
      if (!round || round.status !== "voting") throw new LocalDemoError("Voting is not open", 409);
      const cannotEstimate = body.cannotEstimate === true;
      let value: string | null = null;
      if (!cannotEstimate) {
        if (typeof body.value !== "string" || !estimatePattern.test(body.value) || !Number.isFinite(Number(body.value))) {
          throw new LocalDemoError("Enter a valid non-negative estimate or choose Cannot estimate", 400);
        }
        value = body.value;
      }
      round.votes[member.member_id] = { value, cannot_estimate: cannotEstimate };
    } else if (action === "reveal") {
      findHost(room, userId);
      if (!round || round.status !== "voting") throw new LocalDemoError("No round is ready to reveal", 409);
      round.status = "revealed";
    } else if (action === "save-result") {
      findHost(room, userId);
      if (!round || round.status !== "revealed") throw new LocalDemoError("Reveal the round before saving its result", 409);
      if (body.unestimated === true) {
        round.final_estimate = null;
        round.final_unestimated = true;
        round.development_estimate = null;
        round.testing_estimate = null;
      } else if (typeof body.developmentEstimate === "string" && typeof body.testingEstimate === "string"
        && estimatePattern.test(body.developmentEstimate) && estimatePattern.test(body.testingEstimate)
        && Number.isFinite(Number(body.developmentEstimate)) && Number.isFinite(Number(body.testingEstimate))) {
        round.development_estimate = body.developmentEstimate;
        round.testing_estimate = body.testingEstimate;
        round.final_estimate = addEstimates(body.developmentEstimate, body.testingEstimate);
        round.final_unestimated = false;
      } else {
        throw new LocalDemoError("Enter valid development and testing estimates", 400);
      }
      round.status = "complete";
    } else if (action === "next-round") {
      findHost(room, userId);
      if (!task || !round || round.status !== "complete") throw new LocalDemoError("Save the active round before starting another", 409);
      const newRound: Round = {
        id: randomUUID(),
        number: task.rounds.length + 1,
        status: "voting",
        final_estimate: null,
        final_unestimated: false,
        development_estimate: null,
        testing_estimate: null,
        votes: {},
      };
      task.rounds.push(newRound);
      room.active_round_id = newRound.id;
    } else {
      throw new LocalDemoError("The action or estimate is invalid", 400);
    }

    return makeSnapshot(room, userId);
  });
  return result;
}
