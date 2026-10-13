import { SetType } from '@prisma/client';

const SET_TYPES = Object.values(SetType) as SetType[];

/** A set type sent by the client, or "normal" for anything else (older apps send none). */
export const parseSetType = (value: unknown): SetType =>
  SET_TYPES.includes(value as SetType) ? (value as SetType) : SetType.normal;

/**
 * Work done: counts in the volume, the records, the estimated 1RM, the charts and what Atlas
 * reads. Everything but the warm-up.
 */
export const isWorkSet = (set: { type?: SetType | null }) => set.type !== SetType.warmup;

/**
 * Drives the next session's targets: normal sets and sets taken to failure. A drop set is lighter
 * by design, so it would pull the next target down.
 */
export const drivesTarget = (set: { type?: SetType | null }) =>
  set.type !== SetType.warmup && set.type !== SetType.drop;
