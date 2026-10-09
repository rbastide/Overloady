import { useState } from 'react';
import { Icon } from './Icons';
import { formatKg } from '../lib/loadMath';
import type { ActiveExercise, ExerciseStats } from './ActiveExercise';

// Same Epley formula as the API's exercise stats, so both 1RM figures can be compared.
const estimate1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30) * 10) / 10;

/** Personal record of the focused exercise, and whether today's sets beat it. */
export function RecordCard({ exercise, stats }: { exercise: ActiveExercise; stats?: ExerciseStats }) {
  const best = exercise.sets
    .filter((s) => s.completed && s.weight > 0 && s.reps > 0)
    .reduce<{ weight: number; reps: number } | null>(
      (top, s) => (!top || s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps) ? s : top),
      null,
    );

  const kicker = (label: string) => (
    <div className="record-kicker">
      <span className="record-kicker-icon">
        <Icon name="trophy" size={18} />
      </span>
      <span>{label}</span>
    </div>
  );

  if (!stats) {
    return (
      <section className="glass-panel record-card">
        {kicker('Record personnel')}
        <div className="record-exercise">{exercise.name}</div>
        <p className="record-sub">Chargement de ton historique…</p>
      </section>
    );
  }

  const hasHistory = stats.maxWeight > 0;
  const isNewRecord = !!best && best.weight > stats.maxWeight;

  if (best && isNewRecord) {
    const oneRepMax = estimate1RM(best.weight, best.reps);
    const gain = Math.round(((best.weight - stats.maxWeight) / Math.max(stats.maxWeight, 1)) * 1000) / 10;
    return (
      <section className="glass-panel record-card is-new">
        {kicker(hasHistory ? 'Nouveau record personnel !' : 'Premier record établi')}
        <div className="record-exercise">{exercise.name}</div>
        <div className="record-value">
          {formatKg(best.weight)} kg × {best.reps} reps
        </div>
        <p className="record-sub">
          {hasHistory ? (
            <>
              Ancien record : {formatKg(stats.maxWeight)} kg. 1RM estimé : <strong>{formatKg(oneRepMax)} kg</strong>
              {oneRepMax > stats.maxEstimated1RM && ` (+${formatKg(Math.round((oneRepMax - stats.maxEstimated1RM) * 10) / 10)} kg)`}.
            </>
          ) : (
            <>
              1RM estimé : <strong>{formatKg(oneRepMax)} kg</strong>. C'est ta référence pour les prochaines séances.
            </>
          )}
        </p>
        {hasHistory && (
          <div className="record-foot">
            <Icon name="trendingUp" size={16} />+{formatKg(gain)}% de charge
          </div>
        )}
      </section>
    );
  }

  if (!hasHistory) {
    return (
      <section className="glass-panel record-card">
        {kicker('Record personnel')}
        <div className="record-exercise">{exercise.name}</div>
        <div className="record-value">À établir</div>
        <p className="record-sub">Ta première série validée deviendra ta référence sur cet exercice.</p>
      </section>
    );
  }

  return (
    <section className="glass-panel record-card">
      {kicker('Record personnel')}
      <div className="record-exercise">{exercise.name}</div>
      <div className="record-value">{formatKg(stats.maxWeight)} kg</div>
      <p className="record-sub">
        1RM estimé : <strong>{formatKg(stats.maxEstimated1RM)} kg</strong>
      </p>
      <div className={`record-foot${best ? '' : ' is-muted'}`}>
        {best ? (
          best.weight === stats.maxWeight ? (
            <>
              <Icon name="checkCircle" size={16} />
              Record égalé aujourd'hui
            </>
          ) : (
            <>
              <Icon name="target" size={16} />
              Meilleure série du jour : {formatKg(best.weight)} kg × {best.reps}
            </>
          )
        ) : (
          <>Une série au-dessus de {formatKg(stats.maxWeight)} kg et c'est un nouveau record.</>
        )}
      </div>
    </section>
  );
}

// Validated categorical slots (see --series-* in components.css); the tail folds into "Autres".
const SLOT_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
const OTHER_COLOR = 'var(--series-other)';
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 1.6; // ≈ 2px of card surface between segments

interface Segment {
  label: string;
  sets: number;
  color: string;
}

/** Planned sets per muscle group for the running session. */
export function MuscleFocusCard({ exercises }: { exercises: ActiveExercise[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Colors follow the order groups enter the session, so they never swap while it fills up.
  const groups: { name: string; sets: number }[] = [];
  exercises.forEach((ex) => {
    const name = ex.category || 'Général';
    const group = groups.find((g) => g.name === name);
    if (group) group.sets += ex.sets.length;
    else groups.push({ name, sets: ex.sets.length });
  });
  const tail = groups.slice(SLOT_COLORS.length);
  const segments: Segment[] = [
    ...groups.slice(0, SLOT_COLORS.length).map((g, i) => ({ label: g.name, sets: g.sets, color: SLOT_COLORS[i] })),
    ...(tail.length > 0
      ? [{ label: tail.length === 1 ? tail[0].name : 'Autres', sets: tail.reduce((n, g) => n + g.sets, 0), color: OTHER_COLOR }]
      : []),
  ].filter((s) => s.sets > 0);
  const total = segments.reduce((n, s) => n + s.sets, 0);
  const percent = (sets: number) => Math.round((sets / Math.max(total, 1)) * 100);
  const focused = hovered !== null ? segments[hovered] : null;

  let offset = 0;
  const gap = segments.length > 1 ? SEGMENT_GAP : 0;

  return (
    <section className="glass-panel focus-card">
      <div className="focus-card-head">
        <div>
          <span className="eyebrow">Séries prévues par groupe</span>
          <h3>Groupes musculaires</h3>
        </div>
        <Icon name="donut" size={22} />
      </div>

      {total === 0 ? (
        <p className="focus-empty">Ajoute des exercices pour voir la répartition de ta séance.</p>
      ) : (
        <div className="focus-body">
          <div className="focus-chart">
            <svg viewBox="0 0 100 100" role="img" aria-label={`Séries prévues par groupe musculaire, ${total} au total`}>
              {segments.map((s, i) => {
                const length = (s.sets / total) * CIRCUMFERENCE;
                const dash = Math.max(length - gap, 0.01);
                const circle = (
                  <circle
                    key={s.label}
                    className="focus-segment"
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="12"
                    strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                    strokeDashoffset={-offset}
                    opacity={hovered === null || hovered === i ? 1 : 0.3}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{`${s.label} : ${s.sets} séries (${percent(s.sets)}%)`}</title>
                  </circle>
                );
                offset += length;
                return circle;
              })}
            </svg>
            <div className="focus-center" aria-hidden="true">
              <strong>{focused ? `${percent(focused.sets)}%` : total}</strong>
              <span>{focused ? focused.label : 'séries'}</span>
            </div>
          </div>

          <ul className="focus-legend">
            {segments.map((s, i) => (
              <li
                key={s.label}
                className={`focus-legend-item${hovered === i ? ' is-hovered' : ''}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="focus-swatch" style={{ background: s.color }} aria-hidden="true" />
                <span className="focus-legend-name">{s.label}</span>
                <span className="focus-legend-value">
                  {s.sets} · {percent(s.sets)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
