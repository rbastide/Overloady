import { useRef, useState, type TouchEvent } from 'react';
import { Icon } from './Icons';
import { Stepper, TargetNote, type ActiveExercise, type ExerciseStats } from './ActiveExercise';
import { DEFAULT_STEP, detectEquipment, formatKg, loggingGuide } from '../lib/loadMath';
import { beatsRecord, resolveSetTarget } from '../lib/overload';

interface GymFocusProps {
  workout: ActiveExercise[];
  /** Exercise on screen. */
  index: number;
  stats?: ExerciseStats;
  goal?: string;
  onNavigate: (index: number) => void;
  onSetChange: (setIndex: number, field: 'weight' | 'reps', value: string) => void;
  onToggleSet: (setIndex: number) => void;
  onAddSet: () => void;
  onWarmup: () => void;
  onCalculator: () => void;
  /** Machine taken: swap the exercise on screen for an equivalent. */
  onReplace?: () => void;
}

// A horizontal swipe longer than this (px), and clearly more horizontal than vertical, changes exercise
const SWIPE_MIN = 56;

/**
 * Gym view: one exercise per screen, the set being performed in large figures, "Valider la série"
 * under the thumb. A swipe, the arrows or the dots move between exercises.
 */
export function GymFocus({
  workout,
  index,
  stats,
  goal,
  onNavigate,
  onSetChange,
  onToggleSet,
  onAddSet,
  onWarmup,
  onCalculator,
  onReplace,
}: GymFocusProps) {
  const exercise = workout[index];
  const total = workout.length;
  const equipment = detectEquipment(exercise.name);
  // Field labels say exactly what to note: one dumbbell, the belt only, reps per arm…
  const guide = loggingGuide(exercise.name);
  const setIndex = exercise.sets.findIndex((s) => !s.completed);
  const set = exercise.sets[setIndex];
  const n = setIndex + 1;
  const target = set ? resolveSetTarget(exercise, setIndex, stats, goal) : null;
  const previous = set ? stats?.previousSets[setIndex] : undefined;

  // What "Valider" records: the fields typed, the ghost targets for the others
  const weight = set ? Number(set.weight) || target?.weight || 0 : 0;
  const reps = set ? Number(set.reps) || target?.reps || 0 : 0;
  const recorded = reps > 0 ? (weight > 0 ? `${formatKg(weight)} kg × ${reps}` : `${reps} reps`) : null;

  const nextPending = workout.findIndex((ex, i) => i !== index && ex.sets.some((s) => !s.completed));

  // The new exercise slides in from the side it came from (state adjusted while rendering)
  const [shown, setShown] = useState<{ index: number; direction: 'next' | 'prev' | null }>({ index, direction: null });
  if (shown.index !== index) setShown({ index, direction: index > shown.index ? 'next' : 'prev' });
  const direction = shown.index !== index ? (index > shown.index ? 'next' : 'prev') : shown.direction;

  const go = (to: number) => {
    if (to >= 0 && to < total && to !== index) onNavigate(to);
  };

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? index + 1 : index - 1);
  };

  return (
    <section className="gym" aria-label={`Mode salle : ${exercise.name}`}>
      <header className="gym-head">
        <button
          type="button"
          className="gym-nav"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Exercice précédent"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="gym-head-text">
          <h2 className="gym-title">{exercise.name}</h2>
          <p className="gym-meta">
            Exercice {index + 1} sur {total}
            {exercise.category ? ` · ${exercise.category}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="gym-nav"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          aria-label="Exercice suivant"
        >
          <Icon name="chevronRight" size={20} />
        </button>
      </header>

      {total > 1 && (
        <div className="gym-dots" role="group" aria-label="Exercices de la séance">
          {workout.map((ex, i) => {
            const done = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
            return (
              <button
                key={ex.exerciseId + i}
                type="button"
                className={`gym-dot${i === index ? ' is-current' : ''}${done ? ' is-done' : ''}`}
                onClick={() => go(i)}
                aria-label={`Exercice ${i + 1} : ${ex.name}${done ? ', terminé' : ''}`}
                aria-current={i === index ? 'step' : undefined}
              />
            );
          })}
        </div>
      )}

      <div
        key={index}
        className={`gym-stage${direction ? ` from-${direction}` : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {set ? (
          <>
            <div className="gym-set-head">
              <span className="gym-set-label">
                Série {n} <span>sur {exercise.sets.length}</span>
              </span>
              <span className="gym-prev">
                {previous ? `Précédent ${formatKg(previous.weight)} kg × ${previous.reps}` : 'Pas de précédent'}
              </span>
            </div>
            <TargetNote exercise={exercise} setIndex={setIndex} stats={stats} goal={goal} compact />
            <div className="gym-field">
              <span className="gym-field-label">{guide.loadLabel}</span>
              <Stepper
                className="stepper-xl"
                value={set.weight}
                step={DEFAULT_STEP[equipment]}
                decimal
                ghost={target?.weight}
                label={`${guide.loadLabel}, série ${n}`}
                onChange={(v) => onSetChange(setIndex, 'weight', v)}
              />
            </div>
            <div className="gym-field">
              <span className="gym-field-label">{guide.repsLabel}</span>
              <Stepper
                className="stepper-xl"
                value={set.reps}
                step={1}
                ghost={target?.reps}
                label={`${guide.repsLabel}, série ${n}`}
                onChange={(v) => onSetChange(setIndex, 'reps', v)}
              />
            </div>
          </>
        ) : (
          <div className="gym-done">
            <Icon name="checkCircle" size={28} />
            <h3>{exercise.sets.length > 0 ? 'Exercice terminé' : 'Aucune série'}</h3>
            <p>
              {exercise.sets.length > 0
                ? nextPending !== -1
                  ? 'Passe au suivant, ou ajoute une série.'
                  : 'Toutes tes séries sont faites : note ton effort et termine la séance plus bas.'
                : 'Ajoute une première série pour commencer.'}
            </p>
          </div>
        )}

        {exercise.sets.length > 0 && (
          <ol className="gym-sets" aria-label="Séries de l'exercice">
            {exercise.sets.map((s, i) => {
              const record = beatsRecord(s, stats);
              return (
                <li
                  key={i}
                  className={`gym-set${s.completed ? ' is-done' : ''}${i === setIndex ? ' is-current' : ''}${record ? ' is-record' : ''}`}
                >
                  {record && <Icon name="trophy" size={11} />}
                  {s.completed ? `${formatKg(s.weight)}×${s.reps}` : i === setIndex ? 'En cours' : i + 1}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="gym-tools">
        <button type="button" className="text-action" onClick={onAddSet}>
          <Icon name="plus" size={15} />
          Série
        </button>
        <button type="button" className="text-action" onClick={onWarmup}>
          <Icon name="flame" size={15} />
          Échauffement
        </button>
        <button type="button" className="text-action" onClick={onCalculator}>
          <Icon name="calculator" size={15} />
          Calculatrice
        </button>
        {/* Only while sets are left: a finished exercise has nothing to hand over */}
        {onReplace && (set || exercise.sets.length === 0) && (
          <button type="button" className="text-action" onClick={onReplace}>
            <Icon name="swap" size={15} />
            Remplacer
          </button>
        )}
      </div>

      {(set || nextPending !== -1) && (
        <div className="gym-actions">
          {set ? (
            <button type="button" className="btn-primary gym-validate" onClick={() => onToggleSet(setIndex)}>
              <span>Valider la série</span>
              {recorded && <span className="gym-validate-detail">{recorded}</span>}
            </button>
          ) : (
            <button type="button" className="btn-primary gym-validate" onClick={() => go(nextPending)}>
              <span>Exercice suivant</span>
              <Icon name="arrowRight" size={18} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
