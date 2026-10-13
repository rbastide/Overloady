// Set types, picked from a sheet opened on the set being logged. Same rules as the API (set-type.ts):
// a warm-up counts in nothing, a drop set counts but never drives the next target, a set to
// failure counts and holds the load next time.

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normale',
  warmup: 'Échauffement',
  drop: 'Drop set',
  failure: 'Échec',
};

/** On the chip of the set being logged, where a phone row leaves little room. */
export const SET_TYPE_SHORT: Record<SetType, string> = {
  normal: 'Normale',
  warmup: 'Échauf.',
  drop: 'Drop set',
  failure: 'Échec',
};

/** Shown in place of the set number; a normal set keeps its number. */
export const SET_TYPE_MARKS: Record<Exclude<SetType, 'normal'>, string> = {
  warmup: 'É',
  drop: 'D',
  failure: 'X',
};

/** Sets saved before set types existed have none: they are normal ones. */
export const typeOf = (set: { type?: SetType | string | null }): SetType =>
  SET_TYPES.includes(set.type as SetType) ? (set.type as SetType) : 'normal';

/** The mark of a warm-up, drop or failure set; null on a normal one. */
export const markOf = (set: { type?: SetType | string | null }): string | null => {
  const type = typeOf(set);
  return type === 'normal' ? null : SET_TYPE_MARKS[type];
};

/** Work done: volume, records, estimated 1RM, charts. Everything but the warm-up. */
export const isWorkSet = (set: { type?: SetType | string | null }) => typeOf(set) !== 'warmup';

/** Drives the next targets: normal sets and sets to failure; a drop set is lighter by design. */
export const drivesTarget = (set: { type?: SetType | string | null }) => {
  const type = typeOf(set);
  return type === 'normal' || type === 'failure';
};
