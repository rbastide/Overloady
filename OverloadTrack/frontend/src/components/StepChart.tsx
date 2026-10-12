import { formatKg } from '../lib/loadMath';

export interface StepPoint {
  date: string;
  weight: number;
  reps: number;
}

const W = 320;
const H = 112;
const PAD_LEFT = 2;
const PAD_RIGHT = 52;
const PAD_TOP = 12;
const PAD_BOTTOM = 6;

/**
 * Progressive overload drawn as a staircase: one tread per session at its heaviest set, a riser
 * whenever the load moves. A dot marks each new best, the all-time best in sand.
 */
export function StepChart({ points, label }: { points: StepPoint[]; label: string }) {
  if (points.length === 0) return null;
  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min;
  const tread = (W - PAD_LEFT - PAD_RIGHT) / points.length;
  const y = (weight: number) =>
    span === 0 ? H / 2 : PAD_TOP + (1 - (weight - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const x = (i: number) => PAD_LEFT + i * tread;

  let line = `M${x(0)},${y(points[0].weight)}`;
  points.forEach((_, i) => {
    line += ` H${x(i + 1)}`;
    if (i + 1 < points.length) line += ` V${y(points[i + 1].weight)}`;
  });
  const area = `${line} V${H} H${x(0)} Z`;

  // New bests: the treads that climb above everything lifted before
  const bests: number[] = [];
  let best = -Infinity;
  points.forEach((p, i) => {
    if (p.weight > best) {
      if (i > 0) bests.push(i);
      best = p.weight;
    }
  });
  const recordIndex = weights.indexOf(max);
  const last = points[points.length - 1];

  return (
    <svg className="step-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path className="step-chart-area" d={area} />
      <path className="step-chart-line" d={line} />
      {bests.map((i) => (
        <circle
          key={i}
          className={`step-chart-best${i === recordIndex ? ' is-record' : ''}`}
          cx={x(i)}
          cy={y(points[i].weight)}
          r={i === recordIndex ? 3.5 : 2.5}
        >
          <title>{`${formatKg(points[i].weight)} kg × ${points[i].reps}`}</title>
        </circle>
      ))}
      <text className="step-chart-value" x={x(points.length) + 8} y={y(last.weight) + 4}>
        {formatKg(last.weight)} kg
      </text>
    </svg>
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
