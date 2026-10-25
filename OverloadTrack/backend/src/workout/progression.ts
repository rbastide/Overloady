// Next target of a movement: what the local engine proposes, and the guard-rails applied to the
// loads Atlas proposes. Pure functions, so the rules can be tested without a database.
// Equipment detection mirrors frontend/src/lib/loadMath.ts: keep both in step.

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

/** Smallest load jump proposed for each equipment (one dumbbell for dumbbells, the belt for bodyweight). */
export const LOAD_STEP: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  bodyweight: 2.5,
};

/** Lightest load that exists: the empty bar, the smallest dumbbell, one plate of the stack. */
const MIN_LOAD: Record<Equipment, number> = {
  barbell: 20,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  bodyweight: 0,
};

/** Rep range of each training goal (same ranges as the coach and the client). */
export const GOAL_REP_RANGES: Record<string, [number, number]> = {
  FORCE: [3, 5],
  BODYBUILDING: [8, 12],
  ENDURANCE: [15, 20],
};

/** Reps of a first session on a movement, for each goal. */
const START_REPS: Record<string, number> = { FORCE: 5, BODYBUILDING: 10, ENDURANCE: 15 };

export const repRange = (goal?: string) =>
  GOAL_REP_RANGES[(goal || 'BODYBUILDING').toUpperCase()] || GOAL_REP_RANGES.BODYBUILDING;

const normalize = (text: string) =>
  (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const hasAny = (name: string, words: string[]) => words.some((w) => name.includes(w));

export function detectEquipment(exerciseName: string): Equipment {
  const name = normalize(exerciseName);
  if (hasAny(name, ['dumbbell', 'haltere', 'kettlebell'])) return 'dumbbell';
  if (hasAny(name, ['cable', 'poulie', 'pulldown', 'tirage vertical', 'face pull', 'pushdown'])) return 'cable';
  if (hasAny(name, ['barbell', 'barre', 'ez bar', 'ez-bar', 'trap bar', 'smith', 'landmine'])) return 'barbell';
  if (hasAny(name, ['machine', 'leg press', 'presse', 'hack squat', 'pec deck', 'butterfly', 'leg extension', 'leg curl'])) {
    return 'machine';
  }
  if (
    hasAny(name, ['pull up', 'pull-up', 'pullup', 'chin up', 'chin-up', 'traction', 'dip', 'push up', 'push-up', 'pompe',
      'muscle up', 'bodyweight', 'poids du corps', 'plank', 'gainage', 'hanging', 'suspendu', 'crunch', 'sit up',
      'sit-up', 'ab wheel'])
  ) {
    return 'bodyweight';
  }
  // Unlabelled classics are barbell lifts; anything else is most likely a machine.
  if (hasAny(name, ['squat', 'deadlift', 'souleve', 'bench', 'developpe', 'row', 'rowing', 'press', 'hip thrust'])) {
    return 'barbell';
  }
  return 'machine';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nearest load the equipment allows, never under its lightest load. */
export function roundLoad(value: number, equipment: Equipment): number {
  const step = LOAD_STEP[equipment];
  return round2(Math.max(MIN_LOAD[equipment], Math.round(value / step) * step));
}

/** Largest rise in one session: 10 % of the last load, at least one step, at most two. */
export function maxIncrease(lastWeight: number, equipment: Equipment): number {
  const step = LOAD_STEP[equipment];
  const tenPercent = Math.floor((lastWeight * 0.1) / step) * step;
  return round2(Math.min(2 * step, Math.max(step, tenPercent)));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const daysSince = (date: Date, now: Date) => Math.floor((now.getTime() - date.getTime()) / DAY_MS);

/**
 * Share of the load kept after a break on the movement. One session a week per muscle is the
 * normal rhythm, so the count starts after it: about one week of break, two, three or more.
 */
export function pauseFactor(days: number): number {
  if (days >= 24) return 0.5;
  if (days >= 17) return 0.75;
  if (days >= 10) return 0.9;
  return 1;
}

/** Best work set of a movement in one session. */
export interface Performance {
  weight: number;
  reps: number;
  date: Date;
  /** The set was taken to failure: repeat it before going up. */
  failure?: boolean;
  /** Session RPE: 10 means all-out, the load holds. */
  rpe?: number | null;
}

export type TargetRule = 'reps' | 'load' | 'hold' | 'failure' | 'pause' | 'start';

export interface Target {
  weight: number;
  reps: number;
  rule: TargetRule;
  /** Told to the athlete when the load goes down or is a first guess. */
  note?: string;
}

interface LoggedSet {
  weight: number;
  reps: number;
  completed: boolean;
  type?: string | null;
}

/**
 * Best set of a session for the next target: heaviest, most reps breaking ties. Warm-up and drop
 * sets are left out; a bodyweight set at 0 kg counts (it is the movement done without a belt).
 */
export function topPerformance(
  exerciseName: string,
  sets: LoggedSet[],
  date: Date,
  rpe?: number | null,
): Performance | null {
  const bodyweight = detectEquipment(exerciseName) === 'bodyweight';
  const work = sets.filter(
    (s) => s.completed && s.reps > 0 && (s.weight > 0 || bodyweight) && s.type !== 'warmup' && s.type !== 'drop',
  );
  if (work.length === 0) return null;
  const top = work.reduce((best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best));
  return {
    weight: top.weight,
    reps: top.reps,
    date,
    failure: top.type === 'failure',
    rpe: rpe || null,
  };
}

const formatKg = (n: number) => String(round2(n)).replace('.', ',');

function pauseNote(days: number, factor: number, bodyweight: boolean): string {
  const weeks = Math.max(1, Math.round((days - 7) / 7));
  const what = bodyweight ? 'répétitions baissées' : 'charge baissée';
  return `Reprise après ${weeks} semaine${weeks > 1 ? 's' : ''} de pause sur ce mouvement : ${what} de ${Math.round(
    (1 - factor) * 100,
  )} %.`;
}

/**
 * Double progression from the last performance: one more rep at the same load up to the top of
 * the goal's range, then one load step with the reps back to the bottom. The load never goes down
 * while the athlete keeps training the movement; only a break lowers it, and the note says so.
 */
export function nextTarget(last: Performance, exerciseName: string, goal?: string, now = new Date()): Target {
  const equipment = detectEquipment(exerciseName);
  const [bottom, top] = repRange(goal);
  const unloaded = equipment === 'bodyweight' || last.weight <= 0;

  const days = daysSince(last.date, now);
  const factor = pauseFactor(days);
  if (factor < 1) {
    if (unloaded && last.weight <= 0) {
      return { weight: 0, reps: Math.max(1, Math.round(last.reps * factor)), rule: 'pause', note: pauseNote(days, factor, true) };
    }
    const weight = equipment === 'bodyweight' ? round2(Math.round((last.weight * factor) / 2.5) * 2.5) : roundLoad(last.weight * factor, equipment);
    return { weight, reps: Math.min(last.reps, top), rule: 'pause', note: pauseNote(days, factor, false) };
  }

  if (last.failure) return { weight: last.weight, reps: last.reps, rule: 'failure' };
  if (last.rpe !== undefined && last.rpe !== null && last.rpe >= 10) {
    return { weight: last.weight, reps: last.reps, rule: 'hold' };
  }
  // Bodyweight work progresses through reps; the belt is the athlete's call
  if (last.reps < top || unloaded) {
    return { weight: last.weight, reps: last.reps + 1, rule: 'reps' };
  }
  return { weight: nextStepUp(last.weight, equipment), reps: bottom, rule: 'load' };
}

/** Next load of the equipment's grid above this one: 12 → 14 kg, 15 → 16 kg (dumbbells), 42 → 42,5 kg (bar). */
export function nextStepUp(weight: number, equipment: Equipment): number {
  const step = LOAD_STEP[equipment];
  return round2(Math.floor(weight / step + 1e-9) * step + step);
}

/** A movement the athlete already did, to guess the load of a related one. */
export interface KnownLift {
  name: string;
  weight: number;
  reps: number;
}

const epley = (weight: number, reps: number) => weight * (1 + reps / 30);
const loadForReps = (oneRepMax: number, reps: number) => oneRepMax / (1 + reps / 30);

/** Related movements: the first one known gives the starting load, through its estimated 1RM. */
const RELATED_LIFTS: Array<{ target: (name: string) => boolean; from: Array<{ match: string; ratio: number }> }> = [
  {
    target: (n) => n.includes('deadlift') && !hasAny(n, ['romanian', 'roumain', 'stiff', 'single', 'sumo']),
    from: [
      { match: 'romanian deadlift', ratio: 1.2 },
      { match: 'squat (barbell)', ratio: 1.15 },
    ],
  },
  { target: (n) => n.includes('romanian deadlift'), from: [{ match: 'deadlift (barbell)', ratio: 0.8 }] },
  { target: (n) => n.includes('incline bench press (barbell)'), from: [{ match: 'bench press (barbell)', ratio: 0.85 }] },
  { target: (n) => n.includes('front squat'), from: [{ match: 'squat (barbell)', ratio: 0.8 }] },
];

/**
 * Ten-rep loads of an intermediate lifter of reference (75 kg, ~18 % body fat), the same base as
 * the calibration protocol: one dumbbell for dumbbell movements.
 */
const REFERENCE_10RM: Array<[string, number]> = [
  ['romanian deadlift', 50],
  ['deadlift', 70],
  ['front squat', 45],
  ['squat', 60],
  ['incline bench press (barbell)', 42.5],
  ['bench press (barbell)', 50],
  ['barbell row', 45],
  ['overhead press (barbell)', 30],
  ['overhead press (dumbbell)', 14],
  ['incline dumbbell press', 18],
  ['bicep curl (dumbbell)', 12],
  ['hammer curl', 12],
  ['lateral raise', 6],
  ['leg press', 100],
  ['leg extension', 35],
  ['leg curl', 30],
  ['lat pulldown', 45],
  ['seated cable row', 40],
  ['face pull', 15],
  ['tricep', 22.5],
  ['hip thrust', 60],
];

/** Starting load of an unknown movement for the reference lifter, at 10 reps. */
const DEFAULT_10RM: Record<Equipment, number> = { barbell: 30, dumbbell: 8, machine: 30, cable: 20, bodyweight: 0 };

/**
 * First session on a movement: a related lift already measured, else the reference load scaled to
 * the athlete (calibrationLoadFactor). Bodyweight movements start without a belt.
 */
export function startingTarget(exerciseName: string, goal: string | undefined, known: KnownLift[], factor: number): Target {
  const equipment = detectEquipment(exerciseName);
  const reps = START_REPS[(goal || 'BODYBUILDING').toUpperCase()] || START_REPS.BODYBUILDING;
  const note = 'Première fois sur ce mouvement : ajuste après la 1re série.';
  if (equipment === 'bodyweight') {
    return { weight: 0, reps: repRange(goal)[0], rule: 'start', note };
  }

  const name = normalize(exerciseName);
  const related = RELATED_LIFTS.find((r) => r.target(name));
  if (related) {
    const guesses = related.from
      .map(({ match, ratio }) => {
        const lift = known.find((k) => normalize(k.name).includes(match) && k.weight > 0 && k.reps > 0);
        return lift ? loadForReps(epley(lift.weight, lift.reps) * ratio, reps) : 0;
      })
      .filter((g) => g > 0);
    // The most careful guess when several lifts speak
    if (guesses.length > 0) return { weight: roundLoad(Math.min(...guesses), equipment), reps, rule: 'start', note };
  }

  const reference = REFERENCE_10RM.find(([match]) => name.includes(match))?.[1] ?? DEFAULT_10RM[equipment];
  const tenRepLoad = reference * (factor > 0 ? factor : 1);
  return { weight: roundLoad(loadForReps(epley(tenRepLoad, 10), reps), equipment), reps, rule: 'start', note };
}

/**
 * A load proposed by Atlas, kept within the same rules as the local engine: never under the last
 * load of a movement still trained, never more than maxIncrease above it, the break drop applied,
 * no belt on bodyweight work the athlete does without one, and a first load near startingTarget.
 */
export function guardProposal(
  proposed: { weight: number; reps: number },
  exerciseName: string,
  context: { goal?: string; last?: Performance | null; start: Target; now?: Date },
): { weight: number; reps: number; note?: string } {
  const equipment = detectEquipment(exerciseName);
  const reps = Math.min(Math.max(Math.round(Number(proposed.reps)) || context.start.reps, 1), 100);
  const asked = Number.isFinite(Number(proposed.weight)) ? Math.max(0, Number(proposed.weight)) : 0;
  const last = context.last;

  if (last) {
    const expected = nextTarget(last, exerciseName, context.goal, context.now);
    // After a break the drop is the rule, belt and bodyweight reps included
    if (expected.rule === 'pause') {
      return { weight: expected.weight, reps: last.weight <= 0 ? expected.reps : reps, note: expected.note };
    }
    // After a set to failure or an all-out session the load holds
    const holds = expected.rule === 'failure' || expected.rule === 'hold';
    if (equipment === 'bodyweight') {
      if (last.weight <= 0) return { weight: 0, reps };
      const lest = Math.min(Math.max(asked, last.weight), holds ? last.weight : last.weight + LOAD_STEP.bodyweight);
      return { weight: round2(Math.round(lest / 2.5) * 2.5), reps };
    }
    const upper = holds ? last.weight : last.weight + maxIncrease(last.weight, equipment);
    const weight = Math.min(Math.max(roundLoad(asked, equipment), last.weight), upper);
    return { weight: round2(weight), reps };
  }

  if (equipment === 'bodyweight') return { weight: 0, reps };
  const start = context.start.weight;
  // No load from Atlas: the starting load itself
  if (asked <= 0) return { weight: start, reps, note: context.start.note };
  if (start <= 0) return { weight: roundLoad(asked, equipment), reps, note: context.start.note };
  const weight = Math.min(Math.max(asked, start * 0.8), start * 1.2);
  return { weight: roundLoad(weight, equipment), reps, note: context.start.note };
}

/**
 * Every set Atlas planned for a movement. The heaviest one is guarded; the lighter ones (back-off
 * sets, pyramid) keep their share of it, so they are not pushed up to the top-set load.
 */
export function guardSets(
  sets: Array<{ weight: number; reps: number }>,
  exerciseName: string,
  context: { goal?: string; last?: Performance | null; start: Target; now?: Date },
): { sets: Array<{ weight: number; reps: number }>; note?: string } {
  const equipment = detectEquipment(exerciseName);
  const asked = sets.map((s) => (Number.isFinite(Number(s.weight)) ? Math.max(0, Number(s.weight)) : 0));
  const heaviest = Math.max(0, ...asked);
  const topIndex = asked.indexOf(heaviest);
  const top = guardProposal({ weight: heaviest, reps: sets[topIndex]?.reps }, exerciseName, context);
  return {
    note: top.note,
    sets: sets.map((s, i) => {
      const { reps } = guardProposal({ weight: heaviest, reps: s.reps }, exerciseName, context);
      if (i === topIndex || heaviest <= 0 || top.weight <= 0) return { weight: top.weight, reps };
      const share = asked[i] / heaviest;
      const weight = equipment === 'bodyweight' ? Math.round((top.weight * share) / 2.5) * 2.5 : roundLoad(top.weight * share, equipment);
      return { weight: round2(weight), reps };
    }),
  };
}

/** Whether the starting load of a movement can come from a related lift already measured. */
export const usesRelatedLifts = (exerciseName: string) => RELATED_LIFTS.some((r) => r.target(normalize(exerciseName)));
