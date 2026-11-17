import { frenchName } from '../lib/exerciseNames';

interface ExerciseNameProps {
  /** The stored (English) name. */
  name?: string | null;
  /** Hide the English subtitle where space is short. */
  compact?: boolean;
}

/** An exercise name as the athlete reads it: French first, the English original underneath. */
export function ExerciseName({ name, compact = false }: ExerciseNameProps) {
  const french = frenchName(name);
  if (!french) return <>{name || 'Exercice'}</>;
  return (
    <>
      {french}
      {!compact && (
        <span className="exercise-name-en" lang="en">
          {name}
        </span>
      )}
    </>
  );
}
