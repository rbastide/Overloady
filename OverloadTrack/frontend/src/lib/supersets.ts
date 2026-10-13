// Supersets: exercises in a row sharing a supersetId are done in rounds, one set of each, the rest
// only after the last one of the round. Ids that no longer group two neighbours are dropped.

interface Groupable {
  supersetId?: string | null;
}

/** A run of at least two neighbouring exercises with the same supersetId. */
export interface SupersetRun {
  start: number;
  end: number;
}

export const newSupersetId = () => `ss-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function supersetRuns(list: Groupable[]): SupersetRun[] {
  const runs: SupersetRun[] = [];
  let i = 0;
  while (i < list.length) {
    const id = list[i].supersetId;
    let end = i;
    while (id && end + 1 < list.length && list[end + 1].supersetId === id) end++;
    if (end > i) runs.push({ start: i, end });
    i = end + 1;
  }
  return runs;
}

/** The superset an exercise belongs to, null when it is done on its own. */
export const runOf = (list: Groupable[], index: number): SupersetRun | null =>
  supersetRuns(list).find((r) => index >= r.start && index <= r.end) ?? null;

/** "A1", "A2", "B1"…: the usual way to write supersets, null for an exercise on its own. */
export function supersetLabels(list: Groupable[]): (string | null)[] {
  const labels: (string | null)[] = list.map(() => null);
  supersetRuns(list).forEach((run, r) => {
    const letter = String.fromCharCode(65 + (r % 26));
    for (let i = run.start; i <= run.end; i++) labels[i] = `${letter}${i - run.start + 1}`;
  });
  return labels;
}

/** Keeps an id only on runs of two or more; a later run reusing an id gets its own. */
export function normalizeSupersets<T extends Groupable>(list: T[]): T[] {
  const out = list.map((item) => (item.supersetId ? { ...item, supersetId: undefined } : item));
  const seen = new Set<string>();
  for (const run of supersetRuns(list)) {
    const first = list[run.start].supersetId as string;
    const id = seen.has(first) ? newSupersetId() : first;
    seen.add(id);
    for (let j = run.start; j <= run.end; j++) out[j] = { ...list[j], supersetId: id };
  }
  return out;
}

/** One rendering segment: an exercise on its own, or the exercises of a superset. */
export interface Segment<T> {
  run: SupersetRun | null;
  items: { item: T; index: number }[];
}

export function segmentBySuperset<T extends Groupable>(list: T[]): Segment<T>[] {
  const runs = supersetRuns(list);
  const segments: Segment<T>[] = [];
  let i = 0;
  while (i < list.length) {
    const run = runs.find((r) => r.start === i);
    if (run) {
      segments.push({ run, items: list.slice(run.start, run.end + 1).map((item, k) => ({ item, index: run.start + k })) });
      i = run.end + 1;
    } else {
      segments.push({ run: null, items: [{ item: list[i], index: i }] });
      i++;
    }
  }
  return segments;
}

type RoundExercise = Groupable & { sets: { completed: boolean; type?: string }[] };

/**
 * The exercise of the superset to do next after `index`: the next one of the round with sets left,
 * else back to the first one with sets left (a new round). Null outside a superset.
 */
export function nextInSuperset(list: RoundExercise[], index: number): { next: number | null; endOfRound: boolean } | null {
  const run = runOf(list, index);
  if (!run) return null;
  const pending = (i: number) => list[i].sets.some((s) => !s.completed);
  for (let i = index + 1; i <= run.end; i++) if (pending(i)) return { next: i, endOfRound: false };
  for (let i = run.start; i <= run.end; i++) if (pending(i)) return { next: i, endOfRound: true };
  return { next: null, endOfRound: true };
}

/**
 * Where to go once set `setIndex` of exercise `index` is validated. Warm-ups are done before the
 * rounds start (null: the usual flow), and a drop set follows its set at once, without the partner.
 */
export function nextInRound(
  list: RoundExercise[],
  index: number,
  setIndex: number,
): { next: number | null; endOfRound: boolean } | null {
  const sets = list[index]?.sets ?? [];
  if (!runOf(list, index) || sets[setIndex]?.type === 'warmup') return null;
  const following = sets.find((s, k) => k > setIndex && !s.completed);
  if (following?.type === 'drop') return { next: index, endOfRound: false };
  return nextInSuperset(list, index);
}
