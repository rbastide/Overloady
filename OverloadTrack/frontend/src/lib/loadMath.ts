// Load maths for the gym calculator: what a weight means depends on the movement.
// 100 kg × 5 on a barbell bench and 4.5 kg × 15 on dumbbell lateral raises call for
// different estimates, rounding and loading instructions.

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
export type MovementKind = 'compound' | 'isolation';

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barre',
  dumbbell: 'Haltères',
  machine: 'Machine',
  cable: 'Poulie',
  bodyweight: 'Poids du corps',
};

/** Olympic plates (kg), heaviest first. */
export const BAR_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Default rounding step (kg) for each equipment: the smallest jump you can really make. */
export const DEFAULT_STEP: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 1,
  machine: 5,
  cable: 2.5,
  bodyweight: 2.5,
};

const normalize = (text: string) =>
  text
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

export function detectKind(exerciseName: string): MovementKind {
  const name = normalize(exerciseName);
  const isolation = [
    'raise', 'elevation', 'fly', 'flye', 'ecarte', 'curl', 'extension', 'pushdown', 'kickback', 'pec deck',
    'butterfly', 'face pull', 'shrug', 'calf', 'mollet', 'crunch', 'pullover', 'wrist', 'poignet', 'adduct',
    'abduct', 'leg raise', 'oiseau', 'reverse fly', 'plank', 'gainage',
  ];
  return hasAny(name, isolation) ? 'isolation' : 'compound';
}

/**
 * Estimated one-rep max. Epley under 10 reps, Brzycki-Epley average beyond (less optimistic),
 * clamped at 30 reps where any formula stops meaning much.
 */
export function estimateOneRepMax(load: number, reps: number): number {
  if (load <= 0 || reps <= 0) return 0;
  if (reps === 1) return load;
  const r = Math.min(reps, 30);
  const epley = load * (1 + r / 30);
  if (r <= 10) return epley;
  const brzycki = (load * 36) / (37 - r);
  return (epley + brzycki) / 2;
}

/** Load you can move for `reps` reps given a one-rep max (inverse of estimateOneRepMax). */
export function loadForReps(oneRepMax: number, reps: number): number {
  if (oneRepMax <= 0) return 0;
  if (reps <= 1) return oneRepMax;
  // Invert numerically so the table stays consistent with the estimate above.
  let low = 0;
  let high = oneRepMax;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (estimateOneRepMax(mid, reps) > oneRepMax) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

export const roundToStep = (value: number, step: number) => Math.round(value / step) * step;

/** French number format: 4.5 -> "4,5", 1.25 -> "1,25". */
export const formatKg = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

/** Greedy plate breakdown for one side (or the whole belt), heaviest first. */
export function breakdownPlates(weight: number, plates: number[]): { plates: number[]; leftover: number } {
  let remaining = Math.round(weight * 100) / 100;
  const used: number[] = [];
  for (const plate of plates) {
    while (remaining >= plate - 0.001) {
      used.push(plate);
      remaining = Math.round((remaining - plate) * 100) / 100;
    }
  }
  return { plates: used, leftover: remaining };
}

/** Rep targets shown in the table: heavy work for compounds, pump ranges for isolation. */
export const REP_TARGETS: Record<MovementKind, number[]> = {
  compound: [1, 2, 3, 5, 6, 8, 10, 12],
  isolation: [6, 8, 10, 12, 15, 20],
};

export const REP_ZONES: Record<MovementKind, { reps: number[]; label: string }[]> = {
  compound: [
    { reps: [1, 2, 3], label: 'Force max' },
    { reps: [5, 6], label: 'Force' },
    { reps: [8, 10, 12], label: 'Hypertrophie' },
  ],
  isolation: [
    { reps: [6, 8], label: 'Lourd' },
    { reps: [10, 12], label: 'Hypertrophie' },
    { reps: [15, 20], label: 'Congestion' },
  ],
};
