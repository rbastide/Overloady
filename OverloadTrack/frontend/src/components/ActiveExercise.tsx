import React from 'react';
import { Icon } from './Icons';
import { BAR_PLATES, DEFAULT_STEP, breakdownPlates, detectEquipment, formatKg, loggingGuide } from '../lib/loadMath';
import { beatsRecord, explainTarget, previousFor, resolveSetTarget, type PlanSource, type SetTarget } from '../lib/overload';
import { SET_TYPE_LABELS, SET_TYPE_MARKS, SET_TYPE_SHORT, typeOf, type SetType } from '../lib/setTypes';

export interface ActiveSet {
  reps: number;
  weight: number;
  completed: boolean;
  /** Planned by the coach or the protocol: shown as a ghost value until the athlete types. */
  target?: SetTarget;
  /** Absent on normal sets, and on every set of a draft saved before set types existed. */
  type?: SetType;
}

export interface ActiveExercise {
  exerciseId: string;
  name: string;
  category?: string;
  progressiveTarget?: string;
  /** Who planned the targets of the sets; none when they come from the last performance. */
  source?: PlanSource;
  sets: ActiveSet[];
  /** Shared with the neighbouring exercises done in the same superset; absent on older drafts. */
  supersetId?: string;
}

/** Best marks on finished sessions, from /workout/stats/:exerciseId. */
export interface ExerciseStats {
  maxWeight: number;
  maxEstimated1RM: number;
  lastSet: { weight: number; reps: number } | null;
  /** Work sets done on this exercise during the latest session, in logging order (no warm-up nor drop set). */
  previousSets: { weight: number; reps: number; type?: SetType }[];
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
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => nudge(1)} aria-label={`${label} : +${formatKg(step)}`}>
        <Icon name="plus" size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

interface TargetNoteProps {
  exercise: ActiveExercise;
  setIndex: number;
  stats?: ExerciseStats;
  goal?: string;
  /** The coach's advice for the exercise (rep range, rest, cue), under the note. */
  advice?: string;
  /** What to write down for this kind of movement ("Haltères : note le poids d'un seul haltère…"). */
  rule?: string;
  compact?: boolean;
}

/** Margin note: who set the target of the set, the gap with last time and why, then how to log it. */
export function TargetNote({ exercise, setIndex, stats, goal, advice, rule, compact = false }: TargetNoteProps) {
  const note = setIndex >= 0 ? explainTarget(exercise, setIndex, stats, goal) : null;
  if (!note && !advice && !rule) return null;
  // "Haltères : note le poids…": the kind of movement leads, the instruction follows
  const ruleSplit = rule ? rule.indexOf(' : ') : -1;
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
      {rule && (
        <p className="target-note-rule">
          {ruleSplit > 0 ? (
            <>
              <strong>{rule.slice(0, ruleSplit)}</strong>
              {rule.slice(ruleSplit)}
            </>
          ) : (
            rule
          )}
        </p>
      )}
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
  /** Opens the set type sheet (normal, warm-up, drop set, failure) for one set. */
  onEditSetType: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setIndex: number) => void;
  onCompleteAll: () => void;
  onWarmup: () => void;
  onCalculator: () => void;
  /** Machine taken: swap for an equivalent. Absent once every set is done. */
  onReplace?: () => void;
  onRemove: () => void;
  /** "A1" and the other exercises of its superset, when it is in one. */
  superset?: { label: string; partners: string[] };
  /** Name of the exercise "Superset avec le suivant" would link to. */
  nextName?: string;
  onLinkNext?: () => void;
  onUnlink?: () => void;
}

export function ActiveExerciseCard({
  exercise,
  position,
  total,
  stats,
  goal,
  onSetChange,
  onToggleSet,
  onEditSetType,
  onAddSet,
  onRemoveSet,
  onCompleteAll,
  onWarmup,
  onCalculator,
  onReplace,
  onRemove,
  superset,
  nextName,
  onLinkNext,
  onUnlink,
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
  // What the load and reps fields mean for this movement (one dumbbell, reps per arm…)
  const guide = loggingGuide(exercise.name);

  return (
    <section className="exercise-focus" aria-label={`Exercice en cours : ${exercise.name}`}>
      <header className="exercise-focus-head">
        <div className="exercise-focus-body">
          <h2 className="exercise-focus-title">{exercise.name}</h2>
          {superset && (
            <p className="exercise-superset">
              <Icon name="link" size={13} />
              <span>
                Superset {superset.label} avec {superset.partners.join(', ')}
              </span>
            </p>
          )}
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
          {onReplace && !allDone && (
            <button
              type="button"
              className="icon-btn"
              onClick={onReplace}
              title="Remplacer l'exercice (machine prise)"
              aria-label="Remplacer l'exercice par un équivalent"
            >
              <Icon name="swap" size={18} />
            </button>
          )}
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
        rule={guide.rule}
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
          <span>{guide.loadHeader}</span>
          <span>{guide.repsHeader}</span>
          <span>Statut</span>
        </div>

        {exercise.sets.map((set, sIndex) => {
          const isActive = sIndex === activeSetIndex;
          const n = sIndex + 1;
          const type = typeOf(set);
          const previous = previousFor(exercise, sIndex, stats);
          // Ghost values only on sets still to do: a validated set shows what was lifted
          const target = set.completed ? null : targets[sIndex];
          const record = beatsRecord(set, stats);
          return (
            <div
              key={sIndex}
              className={`set-row${set.completed ? ' is-done' : ''}${isActive ? ' is-active' : ''}${record ? ' is-record' : ''}${
                type !== 'normal' ? ` is-${type}` : ''
              }`}
            >
              <div className="set-label">
                <button
                  type="button"
                  className="set-index"
                  onClick={() => onEditSetType(sIndex)}
                  aria-label={`Série ${n}, ${SET_TYPE_LABELS[type].toLowerCase()} : changer le type`}
                  title={`${SET_TYPE_LABELS[type]} · changer le type`}
                >
                  {type === 'normal' ? n : SET_TYPE_MARKS[type]}
                </button>
                {/* The set being logged shows its type in words, so changing it needs no hunting */}
                {isActive && (
                  <button
                    type="button"
                    className="set-type-chip"
                    onClick={() => onEditSetType(sIndex)}
                    aria-label={`Type de la série ${n} : ${SET_TYPE_LABELS[type].toLowerCase()}. Changer`}
                  >
                    <span>{SET_TYPE_SHORT[type]}</span>
                    <Icon name="chevronDown" size={13} strokeWidth={2.4} />
                  </button>
                )}
              </div>
              <span className="set-prev">
                {/* Phones: the active set leaves the columns, so its previous value says what it is */}
                {isActive && <span className="set-prev-label">Préc. </span>}
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
                {/* Phones: the steppers of the active set move to their own line, labelled */}
                {isActive && (
                  <span className="set-cell-label" aria-hidden="true">
                    {guide.loadHeader}
                  </span>
                )}
                {isActive ? (
                  <Stepper
                    value={set.weight}
                    step={DEFAULT_STEP[equipment]}
                    decimal
                    ghost={target?.weight}
                    label={`${guide.loadLabel}, série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'weight', v)}
                  />
                ) : (
                  <input
                    className={`set-input${target ? ' has-ghost' : ''}`}
                    autoComplete="off"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={set.weight || ''}
                    placeholder={target ? formatKg(target.weight) : '0'}
                    aria-label={`${guide.loadLabel}, série ${n}`}
                    onChange={(e) => onSetChange(sIndex, 'weight', e.target.value)}
                  />
                )}
              </div>
              <div className="set-cell">
                {isActive && (
                  <span className="set-cell-label" aria-hidden="true">
                    {guide.repsHeader}
                  </span>
                )}
                {isActive ? (
                  <Stepper
                    value={set.reps}
                    step={1}
                    ghost={target?.reps}
                    label={`${guide.repsLabel}, série ${n}`}
                    onChange={(v) => onSetChange(sIndex, 'reps', v)}
                  />
                ) : (
                  <input
                    className={`set-input${target ? ' has-ghost' : ''}`}
                    autoComplete="off"
                    type="number"
                    inputMode="numeric"
                    value={set.reps || ''}
                    placeholder={target ? String(target.reps) : '0'}
                    aria-label={`${guide.repsLabel}, série ${n}`}
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
          {onLinkNext && (
            <button type="button" className="text-action" onClick={onLinkNext} title={nextName ? `Enchaîner avec ${nextName}` : undefined}>
              <Icon name="link" size={15} />
              Superset avec le suivant
            </button>
          )}
          {onUnlink && (
            <button type="button" className="text-action" onClick={onUnlink}>
              <Icon name="close" size={15} />
              Retirer du superset
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
