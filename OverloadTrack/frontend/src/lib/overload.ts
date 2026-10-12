// Progressive overload on the client: the target of each set, shown as a ghost value in the
// empty fields. "The app proposes, the athlete validates": an untouched field records its target.
import type { ActiveExercise, ExerciseStats } from '../components/ActiveExercise';
import { DEFAULT_STEP, detectEquipment } from './loadMath';

export interface SetTarget {
  weight: number;
  reps: number;
}

/** How a target was derived from the last performance. */
export type OverloadRule = 'reps' | 'load' | 'hold';

/** Rep range of each training goal (same ranges as the coach and the profile). */
export const GOAL_REP_RANGES: Record<string, [number, number]> = {
  FORCE: [3, 5],
  BODYBUILDING: [8, 12],
  ENDURANCE: [15, 20],
};

const repRange = (goal?: string) => GOAL_REP_RANGES[(goal || 'BODYBUILDING').toUpperCase()] || GOAL_REP_RANGES.BODYBUILDING;

/** A recommended set, as sent by the coach or the local engine, read as a target. */
export const toTarget = (set?: { weight?: number; reps?: number } | null): SetTarget | undefined => {
  const reps = Number(set?.reps) || 0;
  if (!set || reps <= 0) return undefined;
  return { weight: Math.max(0, Number(set.weight) || 0), reps };
};

/**
 * Double progression from the last performance: one more rep at the same load until the top of
 * the goal's range, then the smallest real load jump with the reps back to the bottom.
 * A last session felt at RPE 10 is repeated as is.
 */
export function progressFrom(
  previous: SetTarget,
  exerciseName: string,
  goal?: string,
  lastRpe?: number | null,
): { target: SetTarget; rule: OverloadRule } {
  if (lastRpe !== undefined && lastRpe !== null && lastRpe >= 10) {
    return { target: { ...previous }, rule: 'hold' };
  }
  const [bottom, top] = repRange(goal);
  const equipment = detectEquipment(exerciseName);
  // Bodyweight without a belt: progress only comes from reps
  if (previous.reps < top || previous.weight <= 0 || equipment === 'bodyweight') {
    return { target: { weight: previous.weight, reps: previous.reps + 1 }, rule: 'reps' };
  }
  const step = DEFAULT_STEP[equipment];
  return {
    target: { weight: Math.round((previous.weight + step) * 100) / 100, reps: bottom },
    rule: 'load',
  };
}

/** The set lifted last time at the same position, else the last one of that session. */
const previousSetAt = (stats: ExerciseStats | undefined, setIndex: number): SetTarget | null => {
  const sets = stats?.previousSets ?? [];
  if (sets.length > 0) return sets[Math.min(setIndex, sets.length - 1)];
  return stats?.lastSet ?? null;
};

/**
 * Target of one set: the one planned by the coach or the protocol, else the progression of what
 * was lifted last time. Null on a first session with no plan: the field stays blank.
 */
export function resolveSetTarget(
  exercise: ActiveExercise,
  setIndex: number,
  stats: ExerciseStats | undefined,
  goal?: string,
): SetTarget | null {
  const planned = exercise.sets[setIndex]?.target;
  if (planned) return planned;
  const previous = previousSetAt(stats, setIndex);
  if (!previous || previous.reps <= 0) return null;
  return progressFrom(previous, exercise.name, goal, stats?.lastRpe).target;
}

/** Heaviest set of a list, the most reps breaking ties: what "last time" means for a movement. */
export const topSet = (sets: SetTarget[]): SetTarget | null =>
  sets.reduce<SetTarget | null>(
    (top, s) => (!top || s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps) ? s : top),
    null,
  );

export type GapTone = 'up' | 'down' | 'same' | 'new';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} kg`;

/** What the target asks compared with last time: "+2,5 kg", "+1 rep", "Même charge"... */
export function describeGap(target: SetTarget | null, previous: SetTarget | null): { label: string; tone: GapTone } | null {
  if (!target) return null;
  if (!previous) return { label: 'Première fois', tone: 'new' };
  const weightGap = Math.round((target.weight - previous.weight) * 100) / 100;
  if (weightGap > 0) return { label: `+${kg(weightGap)}`, tone: 'up' };
  if (weightGap < 0) return { label: `−${kg(-weightGap)}`, tone: 'down' };
  const repGap = target.reps - previous.reps;
  if (repGap > 0) return { label: `+${plural(repGap, 'rep')}`, tone: 'up' };
  if (repGap < 0) return { label: `−${plural(-repGap, 'rep')}`, tone: 'down' };
  return { label: 'Même charge', tone: 'same' };
}

/** Empty fields take their ghost value: what is validated is what is shown. */
export function fillFromTarget<T extends { weight: number; reps: number }>(set: T, target: SetTarget | null): T {
  if (!target) return set;
  return {
    ...set,
    weight: Number(set.weight) > 0 ? set.weight : target.weight,
    reps: Number(set.reps) > 0 ? set.reps : target.reps,
  };
}
