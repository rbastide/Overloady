import React, { useEffect, useMemo, useState } from 'react';
import {
  BAR_PLATES,
  DEFAULT_STEP,
  EQUIPMENT_LABELS,
  REP_TARGETS,
  REP_ZONES,
  breakdownPlates,
  detectEquipment,
  detectKind,
  estimateOneRepMax,
  formatKg,
  loadForReps,
  roundToStep,
  type Equipment,
  type MovementKind,
} from '../lib/loadMath';
import { Icon } from './Icons';

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: any[];
  /** Movement pre-selected when opened from an exercise of the session. */
  initialExerciseName?: string | null;
  defaultWeight?: number;
  defaultReps?: number;
  /** Athlete body weight, needed for bodyweight movements (dips, pull-ups...). */
  bodyWeight?: number;
}

const BELT_PLATES = [20, 15, 10, 5, 2.5, 1.25];
const PLATE_COLORS: Record<number, string> = {
  25: '#e63946',
  20: '#1d4ed8',
  15: '#e9c46a',
  10: '#2a9d8f',
  5: '#f8fafc',
  2.5: '#495057',
  1.25: '#adb5bd',
};
const BARS = [
  { weight: 20, label: '20 kg (olympique)' },
  { weight: 15, label: '15 kg' },
  { weight: 10, label: '10 kg (EZ / technique)' },
  { weight: 0, label: 'Sans barre (presse, machine à disques)' },
];
const STEPS = [0.5, 1, 1.25, 2, 2.5, 5];
const SUGGESTION_LIMIT = 8;
const DEFAULT_BODY_WEIGHT = 75;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const LOAD_LABELS: Record<Equipment, string> = {
  barbell: 'Charge totale (kg)',
  dumbbell: 'Poids par haltère (kg)',
  machine: 'Charge machine (kg)',
  cable: 'Charge poulie (kg)',
  bodyweight: 'Lest ajouté (kg)',
};

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  isOpen,
  onClose,
  exercises,
  initialExerciseName,
  defaultWeight,
  defaultReps,
  bodyWeight,
}) => {
  const [tab, setTab] = useState<'estimate' | 'load'>('estimate');
  const [exerciseName, setExerciseName] = useState('');
  const [query, setQuery] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [kind, setKind] = useState<MovementKind>('compound');
  const [step, setStep] = useState(DEFAULT_STEP.barbell);
  const [weight, setWeight] = useState(80);
  const [reps, setReps] = useState(5);
  const [target, setTarget] = useState(80);
  const [barWeight, setBarWeight] = useState(20);

  const athleteWeight = bodyWeight && bodyWeight > 0 ? bodyWeight : DEFAULT_BODY_WEIGHT;

  const applyExercise = (name: string, fallbackWeight?: number) => {
    const detectedEquipment = name ? detectEquipment(name) : 'barbell';
    setExerciseName(name);
    setQuery('');
    setIsPicking(false);
    setEquipment(detectedEquipment);
    setKind(name ? detectKind(name) : 'compound');
    setBarWeight(/ez|technique/.test(normalize(name)) ? 10 : 20);
    // Dumbbell racks sometimes go by half kilos (4.5 kg...): keep the athlete's own increment.
    const w = fallbackWeight ?? weight;
    setStep(detectedEquipment === 'dumbbell' && !Number.isInteger(w) ? 0.5 : DEFAULT_STEP[detectedEquipment]);
  };

  // Reset to the movement and set the modal was opened with.
  useEffect(() => {
    if (!isOpen) return;
    const name = initialExerciseName || '';
    const equip = name ? detectEquipment(name) : 'barbell';
    const startWeight = defaultWeight ?? (equip === 'bodyweight' ? 0 : 80);
    setTab('estimate');
    setWeight(startWeight);
    setTarget(startWeight);
    setReps(defaultReps && defaultReps > 0 ? defaultReps : name && detectKind(name) === 'isolation' ? 12 : 5);
    applyExercise(name, startWeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialExerciseName, defaultWeight, defaultReps]);

  const suggestions = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const matches = exercises.filter((ex) => normalize(ex.name).includes(q));
    return [...matches.filter((ex) => ex.source !== 'wger'), ...matches.filter((ex) => ex.source === 'wger')].slice(
      0,
      SUGGESTION_LIMIT,
    );
  }, [exercises, query]);

  if (!isOpen) return null;

  const isBodyweight = equipment === 'bodyweight';
  // For bodyweight movements the athlete moves their own weight plus the belt.
  const movedLoad = isBodyweight ? athleteWeight + weight : weight;
  const oneRepMax = estimateOneRepMax(movedLoad, reps);

  const toDisplayedLoad = (moved: number) => {
    const raw = isBodyweight ? moved - athleteWeight : moved;
    const rounded = roundToStep(raw, step);
    return equipment === 'barbell' ? Math.max(rounded, barWeight) : rounded;
  };

  const describeLoad = (load: number) => {
    if (isBodyweight) {
      if (load > 0) return `+${formatKg(load)} kg de lest`;
      if (load < 0) return `${formatKg(-load)} kg d'assistance`;
      return 'Poids du corps';
    }
    if (equipment === 'dumbbell') return `${formatKg(load)} kg / haltère`;
    return `${formatKg(Math.max(load, 0))} kg`;
  };

  const rows = REP_TARGETS[kind].map((r) => ({
    reps: r,
    // The athlete's own set is shown as typed, not re-rounded.
    load: r === reps ? weight : toDisplayedLoad(loadForReps(oneRepMax, r)),
    zone: REP_ZONES[kind].find((z) => z.reps.includes(r))?.label || '',
  }));

  const openLoad = (load: number) => {
    setTarget(load);
    setTab('load');
  };

  const handleWeightChange = (value: number) => {
    setWeight(value);
    // A 4.5 kg dumbbell means the rack goes by half kilos.
    if (equipment === 'dumbbell' && !Number.isInteger(value) && step >= 1) setStep(0.5);
  };

  const handleRepsChange = (value: number) => setReps(Math.min(Math.max(Math.round(value) || 1, 1), 50));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card calc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Calculatrice de charge</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Movement */}
        <div className="form-group calc-exercise">
          <label>Mouvement</label>
          {exerciseName && !isPicking ? (
            <button type="button" className="calc-exercise-current" onClick={() => setIsPicking(true)}>
              <span>{exerciseName}</span>
              <span className="calc-exercise-change">Changer</span>
            </button>
          ) : (
            <div className="calc-exercise-search">
              <input
                type="search"
                className="input-glass"
                placeholder="Rechercher un exercice (ex : développé, élévations…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus={isPicking}
              />
              {suggestions.length > 0 && (
                <div className="calc-suggestions">
                  {suggestions.map((ex) => (
                    <button type="button" key={ex.id} onClick={() => applyExercise(ex.name)}>
                      <span>{ex.name}</span>
                      <span className="calc-suggestion-cat">{ex.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="calc-chips" role="group" aria-label="Matériel">
            {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((eq) => (
              <button
                type="button"
                key={eq}
                className={`calc-chip ${equipment === eq ? 'active' : ''}`}
                onClick={() => {
                  setEquipment(eq);
                  setStep(DEFAULT_STEP[eq]);
                }}
              >
                {EQUIPMENT_LABELS[eq]}
              </button>
            ))}
          </div>
          <div className="calc-chips" role="group" aria-label="Type de mouvement">
            <button
              type="button"
              className={`calc-chip ${kind === 'compound' ? 'active' : ''}`}
              onClick={() => setKind('compound')}
            >
              Polyarticulaire
            </button>
            <button
              type="button"
              className={`calc-chip ${kind === 'isolation' ? 'active' : ''}`}
              onClick={() => setKind('isolation')}
            >
              Isolation
            </button>
          </div>
        </div>

        <div className="tab-pill-container" style={{ marginBottom: '1.25rem' }}>
          <button className={`tab-pill ${tab === 'estimate' ? 'active' : ''}`} onClick={() => setTab('estimate')}>
            Charges de travail
          </button>
          <button
            className={`tab-pill ${tab === 'load' ? 'active' : ''}`}
            onClick={() => {
              setTarget(weight);
              setTab('load');
            }}
          >
            {equipment === 'barbell' ? 'Disques' : 'Chargement'}
          </button>
        </div>

        {tab === 'estimate' ? (
          <div>
            <div className="calc-inputs">
              <div className="form-group" style={{ margin: 0 }}>
                <label>{LOAD_LABELS[equipment]}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  className="input-glass"
                  value={weight}
                  onChange={(e) => handleWeightChange(Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Répétitions</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-glass"
                  value={reps}
                  onChange={(e) => handleRepsChange(Number(e.target.value))}
                />
              </div>
            </div>

            {isBodyweight && (
              <p className="calc-note">
                Calcul basé sur ton poids de corps ({formatKg(athleteWeight)} kg
                {bodyWeight ? '' : ', à renseigner dans ton profil'}) + le lest.
              </p>
            )}

            <div className="highlight-box calc-headline">
              {kind === 'compound' ? (
                <>
                  <div className="calc-headline-label">1RM estimé</div>
                  <div className="calc-headline-value">
                    {describeLoad(toDisplayedLoad(oneRepMax))}
                  </div>
                  {isBodyweight && (
                    <div className="calc-headline-sub">Soit {formatKg(Math.round(oneRepMax))} kg déplacés au total</div>
                  )}
                </>
              ) : (
                <>
                  <div className="calc-headline-label">Exercice d'isolation</div>
                  <div className="calc-headline-text">
                    Un max sur 1 rep n'a pas de sens ici : travaille entre 6 et 20 reps et progresse en reps avant
                    d'augmenter la charge.
                  </div>
                </>
              )}
            </div>

            {reps > 20 && (
              <p className="calc-note">Au-delà de 20 reps, les estimations deviennent approximatives.</p>
            )}

            <div className="calc-table-head">
              <h4>Charge selon les reps</h4>
              <label className="calc-step">
                Arrondi
                <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
                  {STEPS.map((s) => (
                    <option key={s} value={s}>
                      {formatKg(s)} kg
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="calc-rows">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.reps}
                  className={`calc-row ${row.reps === reps ? 'current' : ''}`}
                  onClick={() => openLoad(row.load)}
                  title="Voir comment charger"
                >
                  <span className="calc-row-reps">
                    {row.reps} rep{row.reps > 1 ? 's' : ''}
                  </span>
                  <span className="calc-row-load">{describeLoad(row.load)}</span>
                  <span className="calc-row-zone">{row.reps === reps ? 'Ta série' : row.zone}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <LoadView
            equipment={equipment}
            target={target}
            onTargetChange={setTarget}
            barWeight={barWeight}
            onBarWeightChange={setBarWeight}
            step={step}
          />
        )}
      </div>
    </div>
  );
};

interface LoadViewProps {
  equipment: Equipment;
  target: number;
  onTargetChange: (value: number) => void;
  barWeight: number;
  onBarWeightChange: (value: number) => void;
  step: number;
}

const PlateStack: React.FC<{ plates: number[] }> = ({ plates }) => (
  <div className="barbell-container">
    <div className="barbell-collar">
      {plates.map((plate, idx) => (
        <div
          key={idx}
          className="barbell-plate"
          style={{
            backgroundColor: PLATE_COLORS[plate] || '#ccc',
            height: `${Math.min(100, Math.max(35, plate * 3.5))}px`,
            color: plate === 5 ? '#000' : '#fff',
          }}
          title={`${formatKg(plate)} kg`}
        >
          <span>{formatKg(plate)}</span>
        </div>
      ))}
      {plates.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aucun disque</div>}
    </div>
  </div>
);

const PlateSummary: React.FC<{ plates: number[] }> = ({ plates }) => (
  <div className="calc-plate-badges">
    {Array.from(new Set(plates)).map((p) => (
      <span key={p} className="badge-plate" style={{ borderLeft: `4px solid ${PLATE_COLORS[p]}` }}>
        {plates.filter((x) => x === p).length} × {formatKg(p)} kg
      </span>
    ))}
  </div>
);

const LoadView: React.FC<LoadViewProps> = ({ equipment, target, onTargetChange, barWeight, onBarWeightChange, step }) => {
  const targetInput = (label: string) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        className="input-glass"
        value={target}
        onChange={(e) => onTargetChange(Number(e.target.value))}
      />
    </div>
  );

  if (equipment === 'barbell') {
    const perSide = Math.max(0, (target - barWeight) / 2);
    const { plates, leftover } = breakdownPlates(perSide, BAR_PLATES);
    return (
      <div>
        <div className="calc-inputs">
          {targetInput('Charge totale (kg)')}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Barre</label>
            <select className="input-glass" value={barWeight} onChange={(e) => onBarWeightChange(Number(e.target.value))}>
              {BARS.map((b) => (
                <option key={b.weight} value={b.weight}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="highlight-box calc-headline">
          <div className="calc-headline-label">À charger de chaque côté</div>
          <div className="calc-headline-value">{formatKg(perSide)} kg</div>
          {target < barWeight && <div className="calc-headline-sub">La barre seule pèse déjà {barWeight} kg.</div>}
          {leftover > 0 && (
            <div className="calc-headline-sub">Impossible au disque près : il manque {formatKg(leftover)} kg par côté.</div>
          )}
        </div>
        <PlateStack plates={plates} />
        <PlateSummary plates={plates} />
      </div>
    );
  }

  if (equipment === 'bodyweight') {
    const { plates } = breakdownPlates(Math.max(target, 0), BELT_PLATES);
    return (
      <div>
        <div className="calc-inputs calc-inputs-single">{targetInput('Lest (kg, négatif = assistance)')}</div>
        <div className="highlight-box calc-headline">
          {target > 0 ? (
            <>
              <div className="calc-headline-label">Sur la ceinture de lest</div>
              <div className="calc-headline-value">{formatKg(target)} kg</div>
            </>
          ) : target < 0 ? (
            <>
              <div className="calc-headline-label">Assistance (élastique ou machine)</div>
              <div className="calc-headline-value">{formatKg(-target)} kg</div>
            </>
          ) : (
            <>
              <div className="calc-headline-label">Aucun lest</div>
              <div className="calc-headline-value">Poids du corps</div>
            </>
          )}
        </div>
        {target > 0 && <PlateSummary plates={plates} />}
      </div>
    );
  }

  // Dumbbells and stacks: show the nearest weights you can actually pick.
  const center = Math.max(roundToStep(target, step), step);
  const options = [center - step, center, center + step].filter((v) => v > 0);
  const isDumbbell = equipment === 'dumbbell';
  return (
    <div>
      <div className="calc-inputs calc-inputs-single">
        {targetInput(isDumbbell ? 'Poids par haltère (kg)' : 'Charge visée (kg)')}
      </div>
      <div className="highlight-box calc-headline">
        <div className="calc-headline-label">
          {isDumbbell ? 'Prends deux haltères de' : equipment === 'cable' ? 'Goupille de la poulie sur' : 'Goupille de la pile sur'}
        </div>
        <div className="calc-headline-value">{formatKg(center)} kg</div>
        {isDumbbell && <div className="calc-headline-sub">Soit {formatKg(center * 2)} kg au total</div>}
      </div>
      <div className="calc-neighbours">
        {options.map((v) => (
          <button
            type="button"
            key={v}
            className={`calc-chip ${v === center ? 'active' : ''}`}
            onClick={() => onTargetChange(v)}
          >
            {formatKg(v)} kg
          </button>
        ))}
      </div>
      <p className="calc-note">
        {isDumbbell
          ? `Les haltères vont de ${formatKg(step)} en ${formatKg(step)} kg : si le saut est trop gros, garde la charge et ajoute des reps.`
          : 'Chaque machine a sa propre pile : vise le cran le plus proche et ajuste avec les reps.'}
      </p>
    </div>
  );
};
