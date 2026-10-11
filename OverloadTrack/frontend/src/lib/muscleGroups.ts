export const MUSCLE_GROUPS = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Abdominaux'];

/** Muscle groups in display order: the main ones first, then any other category of the library. */
export const muscleGroupsOf = (exercises: Array<{ category?: string }>) => {
  const extra = Array.from(new Set(exercises.map((ex) => ex.category || 'Général'))).filter(
    (cat) => !MUSCLE_GROUPS.includes(cat),
  );
  return [...MUSCLE_GROUPS, ...extra];
};
