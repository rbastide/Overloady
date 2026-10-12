import React from 'react';
import { Icon } from './Icons';
import { BAR_PLATES, DEFAULT_STEP, breakdownPlates, detectEquipment, formatKg } from '../lib/loadMath';

export interface ActiveSet {
  reps: number;
  weight: number;
  completed: boolean;
}

export interface ActiveExercise {
  exerciseId: string;
  name: string;
  category?: string;
  progressiveTarget?: string;
  sets: ActiveSet[];
}

/** Best marks on finished sessions, from /workout/stats/:exerciseId. */
export interface ExerciseStats {
  maxWeight: number;
  maxEstimated1RM: number;
  lastSet: { weight: number; reps: number } | null;
  /** Sets done on this exercise during the latest session, in logging order. */
  previousSets: { weight: number; reps: number }[];
}

interface StepperProps {
  value: number;
  step: number;
  label: string;
  decimal?: boolean;
  onChange: (value: string) => void;
}

// Broad -/+ targets for chalked hands: the set being performed is adjusted without the keyboard.
function Stepper({ value, step, label, decimal = false, onChange }: StepperProps) {
  const nudge = (direction: 1 | -1) => {
    const next = Math.max(0, Math.round((Number(value || 0) + direction * step) * 100) / 100);
    onChange(String(next));
  };

  return (
    <div className="stepper">
      <button type="button" onClick={() => nudge(-1)} aria-label={`${label} : -${formatKg(step)}`}>
        <Icon name="minus" size={14} strokeWidth={2.4} />
      </button>
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        step={decimal ? '0.5' : '1'}
        value={value || ''}
        placeholder="0"
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => nudge(1)} aria-label={`${label} : +${formatKg(step)}`}>
        <Icon name="plus" size={14} strokeWidth={2.4} />
      </button>
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
  const plateSet = exercise.sets[activeSetIndex] ?? exercise.sets[exercise.sets.length - 1];
  const plateHint =
    equipment === 'barbell' && plateSet ? describePlates(Number(plateSet.weight), barWeightFor(exercise.name)) : null;
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

      {exercise.progressiveTarget && (
        <div className="engine-line">
          <Icon name="target" size={15} />
          <span className="engine-label">Objectif</span>
          <p>{exercise.progressiveTarget}</p>
        </div>
      )}

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
          return (
            <div key={sIndex} className={`set-row${set.completed ? ' is-done' : ''}${isActive ? ' is-active' : ''}`}>
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
                    label={`Charge série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'weight', v)}
                  />
                ) : (
                  <input
                    className="set-input"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={set.weight || ''}
                    placeholder="0"
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
                    label={`Répétitions série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'reps', v)}
                  />
                ) : (
                  <input
                    className="set-input"
                    type="number"
                    inputMode="numeric"
                    value={set.reps || ''}
                    placeholder="0"
                    aria-label={`Répétitions série ${n}`}
                    onChange={(e) => onSetChange(sIndex, 'reps', e.target.value)}
                  />
                )}
              </div>
              <div className="set-status">
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
                    aria-label={`Valider la série ${n}`}
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
