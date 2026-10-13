import { useMemo } from 'react';
import { isWorkSet } from '../lib/setTypes';

const WEEKS = 12;
const DAY_MS = 24 * 3600 * 1000;
const ROW_LABELS = ['Lun', '', 'Mer', '', 'Ven', '', ''];

interface DaySummary {
  sessions: number;
  volume: number;
}

/** Local calendar day, so a late session stays on the day it was done. */
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const sessionVolume = (session: any) =>
  (session.exercises || []).reduce(
    (total: number, ex: any) =>
      total +
      (ex.sets || []).reduce(
        (v: number, s: any) => (s.completed && isWorkSet(s) ? v + (Number(s.weight) || 0) * (Number(s.reps) || 0) : v),
        0,
      ),
    0,
  );

/**
 * The last twelve weeks, one cell per day, filled by the volume lifted that day: regularity at a
 * glance. A bodyweight-only session still fills its cell, at the lightest level.
 */
export function ConsistencyHeatmap({ sessions }: { sessions: any[] }) {
  const { columns, months, maxVolume, total, thisWeek } = useMemo(() => {
    const byDay = new Map<string, DaySummary>();
    sessions.forEach((session) => {
      const key = dayKey(new Date(session.startedAt));
      const day = byDay.get(key) || { sessions: 0, volume: 0 };
      day.sessions += 1;
      day.volume += sessionVolume(session);
      byDay.set(key, day);
    });

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    // Weeks start on Monday; the last column is the current week
    const mondayOffset = (today.getDay() + 6) % 7;
    const firstDay = new Date(today.getTime() - (mondayOffset + (WEEKS - 1) * 7) * DAY_MS);

    const cols: { date: Date; summary?: DaySummary; isFuture: boolean; isToday: boolean }[][] = [];
    const monthLabels: (string | null)[] = [];
    let max = 0;
    let count = 0;
    let week = 0;
    for (let w = 0; w < WEEKS; w++) {
      const column = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstDay.getTime() + (w * 7 + d) * DAY_MS);
        const summary = byDay.get(dayKey(date));
        const isFuture = date.getTime() > today.getTime();
        if (summary && !isFuture) {
          max = Math.max(max, summary.volume);
          count += summary.sessions;
          if (w === WEEKS - 1) week += summary.sessions;
        }
        column.push({ date, summary, isFuture, isToday: dayKey(date) === dayKey(today) });
      }
      cols.push(column);
      // A month name above the first week that starts in it
      const monday = column[0].date;
      const previousMonday = w > 0 ? cols[w - 1][0].date : null;
      monthLabels.push(
        !previousMonday || previousMonday.getMonth() !== monday.getMonth()
          ? monday.toLocaleDateString('fr-FR', { month: 'short' })
          : null,
      );
    }
    return { columns: cols, months: monthLabels, maxVolume: max, total: count, thisWeek: week };
  }, [sessions]);

  const level = (summary?: DaySummary) => {
    if (!summary || summary.sessions === 0) return 0;
    if (maxVolume <= 0 || summary.volume <= 0) return 1;
    const ratio = summary.volume / maxVolume;
    return ratio > 0.66 ? 3 : ratio > 0.33 ? 2 : 1;
  };

  const describe = (date: Date, summary?: DaySummary) => {
    const day = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!summary) return `${day} : repos`;
    const sessionsLabel = `${summary.sessions} séance${summary.sessions > 1 ? 's' : ''}`;
    return `${day} : ${sessionsLabel}${summary.volume > 0 ? `, ${Math.round(summary.volume).toLocaleString('fr-FR')} kg` : ''}`;
  };

  return (
    <div className="heatmap">
      <p className="heatmap-summary">
        <strong>{total}</strong> séance{total > 1 ? 's' : ''} en {WEEKS} semaines
        <span aria-hidden="true">·</span>
        {thisWeek} cette semaine
      </p>

      <div className="heatmap-grid" role="img" aria-label={`Séances des ${WEEKS} dernières semaines : ${total} au total`}>
        <span className="heatmap-corner" aria-hidden="true" />
        {months.map((month, w) => (
          <span key={`m${w}`} className="heatmap-month" aria-hidden="true">
            {month}
          </span>
        ))}
        {ROW_LABELS.map((label, d) => (
          <div key={`r${d}`} className="heatmap-row">
            <span className="heatmap-day" aria-hidden="true">
              {label}
            </span>
            {columns.map((column, w) => {
              const cell = column[d];
              return (
                <span
                  key={w}
                  className={`heatmap-cell is-l${cell.isFuture ? 0 : level(cell.summary)}${cell.isFuture ? ' is-future' : ''}${cell.isToday ? ' is-today' : ''}`}
                  title={cell.isFuture ? undefined : describe(cell.date, cell.summary)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="heatmap-legend" aria-hidden="true">
        <span>Moins</span>
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className={`heatmap-cell is-l${l}`} />
        ))}
        <span>Plus</span>
      </div>
    </div>
  );
}
