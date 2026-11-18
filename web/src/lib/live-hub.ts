/**
 * In-memory pub/sub for live stage sync (one Bandival server process).
 * A leader publishes the current song + metronome; followers receive it via Server-Sent Events.
 */

export type LiveState = {
  index: number;
  songId: string | null;
  leaderId: string;
  leaderName: string;
  metronome: { running: boolean; bpm: number; beatsPerBar: number; beatUnit: number; countInBars: number; gridStartEpochMs: number } | null;
  message: string | null;
  updatedAt: number;
};

type Subscriber = { userId: string; displayName: string; send: (event: string, data: unknown) => void };

type Room = { state: LiveState | null; subscribers: Set<Subscriber> };

const globalForHub = globalThis as unknown as { bandivalLiveRooms?: Map<string, Room> };
const rooms = globalForHub.bandivalLiveRooms ?? new Map<string, Room>();
globalForHub.bandivalLiveRooms = rooms;

function room(setlistId: string): Room {
  let entry = rooms.get(setlistId);
  if (!entry) {
    entry = { state: null, subscribers: new Set() };
    rooms.set(setlistId, entry);
  }
  return entry;
}

function presence(entry: Room) {
  const unique = new Map<string, string>();
  entry.subscribers.forEach((subscriber) => unique.set(subscriber.userId, subscriber.displayName));
  return Array.from(unique, ([userId, displayName]) => ({ userId, displayName }));
}

export function subscribe(setlistId: string, subscriber: Subscriber): () => void {
  const entry = room(setlistId);
  entry.subscribers.add(subscriber);
  subscriber.send("hello", { serverTime: Date.now(), state: entry.state });
  const people = presence(entry);
  entry.subscribers.forEach((other) => other.send("presence", people));
  return () => {
    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size === 0) {
      // Keep the last state for a while so reconnecting devices pick it up.
      setTimeout(() => {
        const current = rooms.get(setlistId);
        if (current && current.subscribers.size === 0) rooms.delete(setlistId);
      }, 10 * 60_000).unref?.();
    } else {
      const remaining = presence(entry);
      entry.subscribers.forEach((other) => other.send("presence", remaining));
    }
  };
}

export function publish(setlistId: string, state: LiveState | null): void {
  const entry = room(setlistId);
  entry.state = state;
  entry.subscribers.forEach((subscriber) => subscriber.send("state", state));
}

export function currentState(setlistId: string): LiveState | null {
  return rooms.get(setlistId)?.state ?? null;
}
