import React from 'react';
import { Icon } from './Icons';
import { BAR_PLATES, DEFAULT_STEP, breakdownPlates, detectEquipment, formatKg } from '../lib/loadMath';
import { explainTarget, resolveSetTarget, type PlanSource, type SetTarget } from '../lib/overload';

export interface ActiveSet {
  reps: number;
  weight: number;
  completed: boolean;
  /** Planned by the coach or the protocol: shown as a ghost value until the athlete types. */
  target?: SetTarget;
}

export interface ActiveExercise {
  exerciseId: string;
  name: string;
  category?: string;
  progressiveTarget?: string;
  /** Who planned the targets of the sets; none when they come from the last performance. */
  source?: PlanSource;
  sets: ActiveSet[];
}

/** Best marks on finished sessions, from /workout/stats/:exerciseId. */
export interface ExerciseStats {
  maxWeight: number;
  maxEstimated1RM: number;
  lastSet: { weight: number; reps: number } | null;
  /** Sets done on this exercise during the latest session, in logging order. */
  previousSets: { weight: number; reps: number }[];
  /** Session RPE of that latest session. */
  lastRpe?: number | null;
}

interface StepperProps {
  value: number;
  step: number;
  label: string;
  decimal?: boolean;
  /** Target shown in the empty field, and the starting point of the -/+ buttons. */
  ghost?: number;
  /** Size variant, e.g. the large steppers of the gym view. */
  className?: string;
  onChange: (value: string) => void;
}

// Broad -/+ targets for chalked hands: the set being performed is adjusted without the keyboard.
export function Stepper({ value, step, label, decimal = false, ghost, className, onChange }: StepperProps) {
  const nudge = (direction: 1 | -1) => {
    const base = Number(value) || ghost || 0;
    const next = Math.max(0, Math.round((base + direction * step) * 100) / 100);
    onChange(String(next));
  };

  return (
    <div className={`stepper${className ? ` ${className}` : ''}`}>
      <button type="button" onClick={() => nudge(-1)} aria-label={`${label} : -${formatKg(step)}`}>
        <Icon name="minus" size={14} strokeWidth={2.4} />
      </button>
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        step={decimal ? '0.5' : '1'}
        value={value || ''}
        placeholder={ghost !== undefined ? formatKg(ghost) : '0'}
        className={ghost !== undefined ? 'has-ghost' : undefined}
        aria-label={ghost !== undefined ? `${label}, objectif ${formatKg(ghost)}` : label}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => nudge(1)} aria-label={`${label} : +${formatKg(step)}`}>
        <Icon name="plus" size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/**
 * Record live: a validated set heavier than the best ever lifted on this exercise.
 * Not on a first session, where every set would be one.
 */
export const beatsRecord = (set: ActiveSet, stats?: ExerciseStats) =>
  !!stats && stats.maxWeight > 0 && set.completed && set.weight > stats.maxWeight;

interface TargetNoteProps {
  exercise: ActiveExercise;
  setIndex: number;
  stats?: ExerciseStats;
  goal?: string;
  /** The coach's advice for the exercise (rep range, rest, cue), under the note. */
  advice?: string;
  compact?: boolean;
}

/** Margin note: who set the target of the set, the gap with last time and why. */
export function TargetNote({ exercise, setIndex, stats, goal, advice, compact = false }: TargetNoteProps) {
  const note = setIndex >= 0 ? explainTarget(exercise, setIndex, stats, goal) : null;
  if (!note && !advice) return null;
  return (
    <div className={`target-note${compact ? ' is-compact' : ''}`}>
      {note && (
        <p className="target-note-main">
          <span className={`source-dot is-${note.source}`} aria-hidden="true" />
          <strong>{note.who}</strong>
          {note.gap && (
            <>
              {' · '}
              <span className={`target-note-gap is-${note.gap.tone}`}>{note.gap.label}</span>
            </>
          )}
          {` : ${note.why}`}
        </p>
      )}
      {advice && <p className="target-note-advice">{advice}</p>}
    </div>
  );
}

// Same EZ / technique bar detection as the load calculator.
const barWeightFor = (exerciseName: string) => (/\bez\b|technique/i.test(exerciseName) ? 10 : 20);

function describePlates(weight: number, barWeight: number): React.ReactNode {
  if (weight === barWeight) return <>Barre seule : <strong>{barWeight} kg</strong></>;
  if (weight < barWeight) return null;
  const { plates, leftover } = breakdownPlates((weight - barWeight) / 2, BAR_PLATES);
  if (leftover > 0 || plates.length === 0) return null;
  return (
    <>
      Par côté (barre {barWeight} kg) : <strong>{plates.map(formatKg).join(' + ')} kg</strong>
    </>
  );
}

interface ActiveExerciseCardProps {
  exercise: ActiveExercise;
  /** 1-based position in the session. */
  position: number;
  total: number;
  stats?: ExerciseStats;
  /** Training goal: sets the rep range of the progression. */
  goal?: string;
  onSetChange: (setIndex: number, field: 'weight' | 'reps', value: string) => void;
  onToggleSet: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setIndex: number) => void;
  onCompleteAll: () => void;
  onWarmup: () => void;
  onCalculator: () => void;
  onRemove: () => void;
}

export function ActiveExerciseCard({
  exercise,
  position,
  total,
  stats,
  goal,
  onSetChange,
  onToggleSet,
  onAddSet,
  onRemoveSet,
  onCompleteAll,
  onWarmup,
  onCalculator,
  onRemove,
}: ActiveExerciseCardProps) {
  const equipment = detectEquipment(exercise.name);
  // The first set not validated yet is the one being performed: it gets the steppers.
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);
  const allDone = exercise.sets.length > 0 && activeSetIndex === -1;
  const targets = exercise.sets.map((_, i) => resolveSetTarget(exercise, i, stats, goal));
  const plateIndex = activeSetIndex !== -1 ? activeSetIndex : exercise.sets.length - 1;
  const plateSet = exercise.sets[plateIndex];
  const plateWeight = plateSet ? Number(plateSet.weight) || targets[plateIndex]?.weight || 0 : 0;
  const plateHint = equipment === 'barbell' && plateWeight > 0 ? describePlates(plateWeight, barWeightFor(exercise.name)) : null;
  const previousSets = stats?.previousSets ?? [];

  return (
    <section className="exercise-focus" aria-label={`Exercice en cours : ${exercise.name}`}>
      <header className="exercise-focus-head">
        <div className="exercise-focus-body">
          <h2 className="exercise-focus-title">{exercise.name}</h2>
          <div className="exercise-focus-meta">
            <span>
              Exercice {position} sur {total}
            </span>
            {/* Each separator travels with its item, so a wrapped line never ends on a dangling "•" */}
            {exercise.category && (
              <span className="meta-item">
                <span className="meta-sep" aria-hidden="true">•</span>
                {exercise.category}
              </span>
            )}
            {stats && (
              <span className={`meta-item${stats.lastSet ? ' exercise-last' : ''}`}>
                <span className="meta-sep" aria-hidden="true">•</span>
                {stats.lastSet
                  ? `Dernier passage : ${formatKg(stats.lastSet.weight)} kg × ${stats.lastSet.reps}`
                  : 'Première séance'}
              </span>
            )}
          </div>
        </div>
        <div className="exercise-tools">
          <button type="button" className="icon-btn" onClick={onWarmup} title="Générer l'échauffement" aria-label="Générer l'échauffement">
            <Icon name="flame" size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={onCalculator} title="Calculatrice de charge" aria-label="Calculatrice de charge">
            <Icon name="calculator" size={18} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            onClick={onRemove}
            title="Retirer l'exercice de la séance"
            aria-label="Retirer l'exercice de la séance"
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </header>

      <TargetNote
        exercise={exercise}
        setIndex={activeSetIndex}
        stats={stats}
        goal={goal}
        advice={exercise.progressiveTarget}
      />

      <div className="set-table">
        <div className="set-row set-head" aria-hidden="true">
          <span>
            <span className="label-long">Série</span>
            <span className="label-short">#</span>
          </span>
          <span>
            <span className="label-long">Précédent</span>
            <span className="label-short">Préc.</span>
          </span>
          <span>Charge (kg)</span>
          <span>Reps</span>
          <span>Statut</span>
        </div>

        {exercise.sets.map((set, sIndex) => {
          const isActive = sIndex === activeSetIndex;
          const n = sIndex + 1;
          const previous = previousSets[sIndex];
          // Ghost values only on sets still to do: a validated set shows what was lifted
          const target = set.completed ? null : targets[sIndex];
          const record = beatsRecord(set, stats);
          return (
            <div
              key={sIndex}
              className={`set-row${set.completed ? ' is-done' : ''}${isActive ? ' is-active' : ''}${record ? ' is-record' : ''}`}
            >
              <div className="set-label">
                <span className="set-index">{n}</span>
              </div>
              <span className="set-prev">
                {previous ? (
                  <>
                    {formatKg(previous.weight)}
                    <span className="set-prev-unit"> kg</span> × {previous.reps}
                  </>
                ) : (
                  '—'
                )}
              </span>
              <div className="set-cell">
                {isActive ? (
                  <Stepper
                    value={set.weight}
                    step={DEFAULT_STEP[equipment]}
                    decimal
                    ghost={target?.weight}
                    label={`Charge série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'weight', v)}
                  />
                ) : (
                  <input
                    className={`set-input${target ? ' has-ghost' : ''}`}
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={set.weight || ''}
                    placeholder={target ? formatKg(target.weight) : '0'}
                    aria-label={`Charge série ${n}`}
                    onChange={(e) => onSetChange(sIndex, 'weight', e.target.value)}
                  />
                )}
              </div>
              <div className="set-cell">
                {isActive ? (
                  <Stepper
                    value={set.reps}
                    step={1}
                    ghost={target?.reps}
                    label={`Répétitions série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'reps', v)}
                  />
                ) : (
                  <input
                    className={`set-input${target ? ' has-ghost' : ''}`}
                    type="number"
                    inputMode="numeric"
                    value={set.reps || ''}
                    placeholder={target ? String(target.reps) : '0'}
                    aria-label={`Répétitions série ${n}`}
                    onChange={(e) => onSetChange(sIndex, 'reps', e.target.value)}
                  />
                )}
              </div>
              <div className="set-status">
                {record && (
                  <span className="set-record" title={`Ancien record : ${formatKg(stats!.maxWeight)} kg`}>
                    <Icon name="trophy" size={12} />
                    <span>Record</span>
                  </span>
                )}
                <button
                  type="button"
                  className="set-remove"
                  onClick={() => onRemoveSet(sIndex)}
                  aria-label={`Supprimer la série ${n}`}
                  title="Supprimer la série"
                >
                  <Icon name="close" size={13} />
                </button>
                {isActive ? (
                  <button
                    type="button"
                    className="set-validate"
                    onClick={() => onToggleSet(sIndex)}
                    aria-label={
                      target && !(set.weight > 0 && set.reps > 0)
                        ? `Valider la série ${n} : ${formatKg(set.weight || target.weight)} kg × ${set.reps || target.reps}`
                        : `Valider la série ${n}`
                    }
                  >
                    <span>Valider</span>
                    <Icon name="check" size={16} strokeWidth={2.6} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="set-check"
                    onClick={() => onToggleSet(sIndex)}
                    aria-pressed={set.completed}
                    aria-label={set.completed ? `Annuler la validation de la série ${n}` : `Valider la série ${n}`}
                    title={set.completed ? 'Annuler la validation' : 'Valider la série'}
                  >
                    {set.completed ? <Icon name="check" size={15} strokeWidth={2.6} /> : <span className="set-check-dot" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {exercise.sets.length === 0 && <p className="muted-note">Aucune série pour l'instant : ajoute la première.</p>}
      </div>

      <footer className="exercise-focus-foot">
        <div className="exercise-focus-foot-actions">
          <button type="button" className="text-action" onClick={onAddSet}>
            <Icon name="plus" size={15} />
            Ajouter une série
          </button>
          {exercise.sets.length > 0 && !allDone && (
            <button type="button" className="text-action" onClick={onCompleteAll}>
              <Icon name="checkCircle" size={15} />
              Tout valider
            </button>
          )}
        </div>
        {plateHint && (
          <button type="button" className="plate-hint" onClick={onCalculator} title="Ouvrir la calculatrice de charge">
            <span>{plateHint}</span>
          </button>
        )}
      </footer>
    </section>
  );
}
