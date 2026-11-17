// Progressive overload on the dashboard: how many movements move up over the last four weeks.
// Each movement trained twice in the window compares its latest best set with its first one,
// so a missed session or a lighter week of volume does not read as a drop.

import { SetType } from '@prisma/client';
import { isWorkSet } from './set-type';

export const OVERLOAD_WINDOW_DAYS = 28;

export interface LoggedLift {
  date: Date;
  exerciseId: string;
  name: string;
  sets: Array<{ weight: number; reps: number; completed: boolean; type?: SetType | null }>;
}

export interface OverloadSummary {
  windowDays: number;
  /** Movements trained at least twice in the window. */
  tracked: number;
  /** Load up, or same load for more reps: the most improved first. */
  progressing: string[];
  /** Real load drops only, the largest first. */
  declining: Array<{ name: string; delta: number }>;
  /** null until a movement is trained twice in the window. */
  trend: 'up' | 'down' | 'flat' | null;
}

type Best = { weight: number; reps: number };

/** Heaviest completed work set, the most reps breaking ties. */
function bestSet(sets: LoggedLift['sets']): Best | null {
  let best: Best | null = null;
  for (const s of sets) {
    if (!s.completed || !isWorkSet(s) || !(s.reps > 0)) continue;
    const weight = Math.max(0, Number(s.weight) || 0);
    if (!best || weight > best.weight || (weight === best.weight && s.reps > best.reps)) best = { weight, reps: s.reps };
  }
  return best;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeOverload(lifts: LoggedLift[], now = new Date(), windowDays = OVERLOAD_WINDOW_DAYS): OverloadSummary {
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const byMovement = new Map<string, { name: string; bests: Array<{ at: number } & Best> }>();
  for (const lift of lifts) {
    const at = lift.date.getTime();
    if (at < since || at > now.getTime()) continue;
    const best = bestSet(lift.sets);
    if (!best) continue;
    const entry = byMovement.get(lift.exerciseId) || { name: lift.name, bests: [] };
    // A movement logged twice in one session keeps that session's best: it was trained once
    const sameSession = entry.bests.find((b) => b.at === at);
    if (!sameSession) entry.bests.push({ at, ...best });
    else if (best.weight > sameSession.weight || (best.weight === sameSession.weight && best.reps > sameSession.reps)) {
      Object.assign(sameSession, best);
    }
    byMovement.set(lift.exerciseId, entry);
  }

  const progressing: Array<{ name: string; score: number }> = [];
  const declining: Array<{ name: string; delta: number }> = [];
  let tracked = 0;
  for (const { name, bests } of byMovement.values()) {
    if (bests.length < 2) continue;
    tracked++;
    bests.sort((a, b) => a.at - b.at);
    const first = bests[0];
    const last = bests[bests.length - 1];
    const delta = round2(last.weight - first.weight);
    if (delta > 0) progressing.push({ name, score: first.weight > 0 ? delta / first.weight : delta });
    else if (delta < 0) declining.push({ name, delta });
    // Same load for more reps also counts; fewer reps at the same load is no drop of load
    else if (last.reps > first.reps) progressing.push({ name, score: 0 });
  }

  progressing.sort((a, b) => b.score - a.score);
  declining.sort((a, b) => a.delta - b.delta);
  const trend =
    tracked === 0
      ? null
      : declining.length > progressing.length
      ? 'down'
      : progressing.length > declining.length
      ? 'up'
      : 'flat';
  return { windowDays, tracked, progressing: progressing.map((p) => p.name), declining, trend };
}
