import { useEffect, useMemo, useRef } from 'react';
import { Icon } from './Icons';
import { ExercisePicker } from './ExercisePicker';
import type { ActiveExercise } from './ActiveExercise';

interface ReplaceExerciseModalProps {
  /** The exercise whose machine is taken; null when closed. */
  exercise: ActiveExercise | null;
  library: any[];
  /** Exercises of the session: a replacement is never one already planned. */
  sessionIds: string[];
  onPick: (exercise: any) => void;
  onClose: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** "La machine est prise": swap the exercise for an equivalent of the same muscle group. */
export function ReplaceExerciseModal({ exercise, library, sessionIds, onPick, onClose }: ReplaceExerciseModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Stable across the parent's per-second renders (session timer), so the library isn't refiltered
  const sessionKey = sessionIds.join('|');
  const excludeIds = useMemo(() => (sessionKey ? sessionKey.split('|') : []), [sessionKey]);
  // Latest handler, so the key listener survives the parent re-rendering
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  });

  const isOpen = exercise !== null;
  useEffect(() => {
    if (!isOpen) return;
    // Not the search field: on a phone it would raise the keyboard over the equivalents
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeHandler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!exercise) return null;

  const done = exercise.sets.filter((s) => s.completed).length;
  const planned = exercise.sets.length || 3;
  const group = exercise.category || 'Général';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card replace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-modal-title"
        aria-describedby="replace-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="replace-modal-title">Remplacer {exercise.name}</h2>
            <p id="replace-modal-desc">
              {plural(planned, 'série')} à faire, avec sa propre cible.
              {done > 0 && ` Tes ${plural(done, 'série')} ${done > 1 ? 'validées seront supprimées' : 'validée sera supprimée'}.`}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        <ExercisePicker
          exercises={library}
          selectedIds={[]}
          excludeIds={excludeIds}
          initialGroup={group}
          pickIcon="swap"
          onPick={onPick}
        />
      </div>
    </div>
  );
}
