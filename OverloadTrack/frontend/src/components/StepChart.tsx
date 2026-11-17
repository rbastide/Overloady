import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatKg } from '../lib/loadMath';
import { describeChange, formatShortDate } from '../lib/overload';

export interface StepPoint {
  date: string;
  weight: number;
  reps: number;
}

const W = 320;
const H = 150;
const PAD_LEFT = 34;
const PAD_RIGHT = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const TICK_STEPS = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 250];

/**
 * Load axis rounded to plain steps, with room above and below: a 2,5 kg change reads as one
 * small step, not as a cliff from the top of the chart to its floor.
 */
function loadAxis(weights: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = Math.max((max - min) * 0.25, max * 0.08, 2.5);
  for (const step of TICK_STEPS) {
    const lo = Math.max(0, Math.floor((min - pad) / step) * step);
    const hi = Math.ceil((max + pad) / step) * step;
    if ((hi - lo) / step <= 4) return { lo, hi, step };
  }
  const step = 500;
  return { lo: Math.max(0, Math.floor(min / step) * step), hi: Math.ceil((max + 1) / step) * step, step };
}

/**
 * Progressive overload drawn as a staircase: one tread per session at its heaviest set, a riser
 * whenever the load moves, a load axis on the left. Touching or dragging along the chart reads the
 * tread under the finger (the last one by default); a dot marks each new best, the all-time best in sand.
 */
export function StepChart({ points, label }: { points: StepPoint[]; label: string }) {
  const [selected, setSelected] = useState(points.length - 1);
  if (points.length === 0) return null;
  const current = Math.min(selected, points.length - 1);

  const weights = points.map((p) => p.weight);
  const { lo, hi, step } = loadAxis(weights);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const tread = (W - PAD_LEFT - PAD_RIGHT) / points.length;
  const y = (weight: number) => PAD_TOP + (1 - (weight - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
  const x = (i: number) => PAD_LEFT + i * tread;

  let line = `M${x(0)},${y(points[0].weight)}`;
  points.forEach((_, i) => {
    line += ` H${x(i + 1)}`;
    if (i + 1 < points.length) line += ` V${y(points[i + 1].weight)}`;
  });
  const area = `${line} V${H - PAD_BOTTOM} H${x(0)} Z`;

  // New bests: the treads that climb above everything lifted before
  const bests: number[] = [];
  let best = -Infinity;
  points.forEach((p, i) => {
    if (p.weight > best) {
      if (i > 0) bests.push(i);
      best = p.weight;
    }
  });
  const recordIndex = weights.indexOf(Math.max(...weights));

  // The tread under the pointer, from its position along the chart
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const vx = ((event.clientX - box.left) / box.width) * W;
    setSelected(Math.min(points.length - 1, Math.max(0, Math.floor((vx - PAD_LEFT) / tread))));
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: points.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setSelected(Math.min(points.length - 1, Math.max(0, moves[event.key])));
  };

  const point = points[current];
  // What the tread changed from the one before, always signed so it never rests on colour alone
  const previous = points[current - 1];
  const gap = previous ? describeChange(previous, point) : { label: 'Départ', tone: 'same' };
  const cx = x(current) + tread / 2;

  return (
    <div className="step-chart-wrap">
      <p className="step-chart-readout" aria-live="polite">
        <span className="step-chart-date">{formatShortDate(point.date)}</span>
        <span className="step-chart-load">
          {formatKg(point.weight)} kg × {point.reps}
        </span>
        <span className={`step-chart-gap is-${gap.tone}`}>{gap.label}</span>
      </p>
      <svg
        className="step-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={current + 1}
        aria-valuetext={`${formatShortDate(point.date)} : ${formatKg(point.weight)} kg × ${point.reps}, ${gap.label}`}
        onPointerDown={pick}
        onPointerMove={(event) => {
          // A mouse reads on hover; a finger reads while it is down, so a vertical scroll stays a scroll
          if (event.pointerType === 'mouse' || event.buttons > 0) pick(event);
        }}
        onKeyDown={onKeyDown}
      >
        {ticks.map((tick) => (
          <g key={tick} className="step-chart-tick">
            <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y(tick)} y2={y(tick)} />
            <text x={PAD_LEFT - 6} y={y(tick) + 3.5} textAnchor="end">
              {formatKg(tick)}
            </text>
          </g>
        ))}
        <path className="step-chart-area" d={area} />
        <path className="step-chart-line" d={line} />
        <line className="step-chart-guide" x1={cx} x2={cx} y1={PAD_TOP} y2={H - PAD_BOTTOM} />
        {bests.map((i) => (
          <circle
            key={i}
            className={`step-chart-best${i === recordIndex ? ' is-record' : ''}`}
            cx={x(i)}
            cy={y(points[i].weight)}
            r={4}
          />
        ))}
        <circle className="step-chart-focus" cx={cx} cy={y(point.weight)} r={5} />
      </svg>
    </div>
  );
}

/** The staircase as a small mark, for empty states and the session recap. */
export function StepMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="step-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M4 34H13V25H22V16H31V7H36" />
    </svg>
  );
}
