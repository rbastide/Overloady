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
        <Icon name="minus" size={18} strokeWidth={2.4} />
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
        <Icon name="plus" size={18} strokeWidth={2.4} />
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

  return (
    <section className="glass-panel exercise-focus" aria-label={`Exercice en cours : ${exercise.name}`}>
      <header className="exercise-focus-head">
        <span className="exercise-tile" aria-hidden="true">
          <Icon name="dumbbell" size={28} />
        </span>
        <div className="exercise-focus-body">
          <div className="exercise-focus-meta">
            <span className="exercise-position">
              Exercice {position} / {total}
            </span>
            <span className="exercise-cat">{exercise.category || 'Général'}</span>
          </div>
          <h2 className="exercise-focus-title">{exercise.name}</h2>
          {stats && (
            <div className="exercise-history">
              <Icon name="history" size={15} />
              {stats.lastSet ? (
                <span>
                  Dernière séance :{' '}
                  <strong>
                    {formatKg(stats.lastSet.weight)} kg × {stats.lastSet.reps} reps
                  </strong>
                </span>
              ) : (
                <span>Première séance sur cet exercice</span>
              )}
            </div>
          )}
        </div>
        <div className="exercise-tools">
          <button type="button" className="icon-btn" onClick={onWarmup} title="Générer l'échauffement" aria-label="Générer l'échauffement">
            <Icon name="flame" size={19} />
          </button>
          <button type="button" className="icon-btn" onClick={onCalculator} title="Calculatrice de charge" aria-label="Calculatrice de charge">
            <Icon name="calculator" size={19} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            onClick={onRemove}
            title="Retirer l'exercice de la séance"
            aria-label="Retirer l'exercice de la séance"
          >
            <Icon name="trash" size={19} />
          </button>
        </div>
      </header>

      {exercise.progressiveTarget && (
        <div className="engine-banner">
          <span className="engine-icon" aria-hidden="true">
            <Icon name="target" size={22} />
          </span>
          <div className="engine-text">
            <div className="engine-kicker">
              <strong>Moteur Overloady</strong>
              <span>Surcharge progressive</span>
            </div>
            <p>{exercise.progressiveTarget}</p>
          </div>
        </div>
      )}

      <div className="set-table">
        <div className="set-row set-head" aria-hidden="true">
          <span>Série</span>
          <span>Charge (kg)</span>
          <span>Reps</span>
          <span>Valider</span>
          <span />
        </div>

        {exercise.sets.map((set, sIndex) => {
          const isActive = sIndex === activeSetIndex;
          const n = sIndex + 1;
          return (
            <div key={sIndex} className={`set-row${set.completed ? ' is-done' : ''}${isActive ? ' is-active' : ''}`}>
              <span className="set-index">{n}</span>
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
              <button
                type="button"
                className="set-check"
                onClick={() => onToggleSet(sIndex)}
                aria-pressed={set.completed}
                aria-label={set.completed ? `Annuler la validation de la série ${n}` : `Valider la série ${n}`}
                title={set.completed ? 'Annuler la validation' : 'Valider la série'}
              >
                <Icon name="check" size={isActive ? 26 : 20} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                className="set-remove"
                onClick={() => onRemoveSet(sIndex)}
                aria-label={`Supprimer la série ${n}`}
                title="Supprimer la série"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          );
        })}

        {exercise.sets.length === 0 && <p className="muted-note">Aucune série pour l'instant : ajoute la première.</p>}
      </div>

      <footer className="exercise-focus-foot">
        <div className="exercise-focus-foot-actions">
          <button type="button" className="btn-small" onClick={onAddSet}>
            <Icon name="plus" size={17} />
            Ajouter une série
          </button>
          {exercise.sets.length > 0 && !allDone && (
            <button type="button" className="btn-small" onClick={onCompleteAll}>
              <Icon name="checkCircle" size={17} />
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
