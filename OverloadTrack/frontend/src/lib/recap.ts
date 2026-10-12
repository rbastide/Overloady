// End-of-session recap as an image in story format (1080 × 1920): volume, records, total time,
// drawn on a canvas in the app's own palette so it can be shared rather than pasted as text.
import { formatKg } from './loadMath';

export interface RecapRecord {
  name: string;
  weight: number;
  reps: number;
  previous: number;
}

export interface SessionRecap {
  title: string;
  /** "Lundi 12 octobre" */
  date: string;
  /** Minutes, null when the session has no end time. */
  durationMin: number | null;
  volume: number;
  sets: number;
  exercises: { name: string; best: { weight: number; reps: number } | null }[];
  records: RecapRecord[];
}

const doneSets = (exLog: any) =>
  (exLog.sets || []).filter((s: any) => s.completed && Number(s.reps) > 0) as { weight: number; reps: number }[];

const heaviest = (sets: { weight: number; reps: number }[]) =>
  sets.reduce<{ weight: number; reps: number } | null>(
    (top, s) => (!top || s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps) ? s : top),
    null,
  );

/** Summary of a finished session; records are counted against the sessions before it. */
export function buildRecap(session: any, history: any[]): SessionRecap {
  const startedAt = new Date(session.startedAt);
  const endedAt = session.endedAt ? new Date(session.endedAt) : null;
  const earlier = history.filter((s) => s.id !== session.id && new Date(s.startedAt) < startedAt);

  let volume = 0;
  let sets = 0;
  const exercises: SessionRecap['exercises'] = [];
  const records: RecapRecord[] = [];

  (session.exercises || []).forEach((exLog: any) => {
    const done = doneSets(exLog);
    sets += done.length;
    volume += done.reduce((v, s) => v + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
    const best = heaviest(done.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })));
    const name = exLog.exercise?.name || 'Exercice';
    exercises.push({ name, best });

    if (!best || best.weight <= 0) return;
    const previous = earlier.reduce((max: number, s: any) => {
      (s.exercises || [])
        .filter((e: any) => e.exerciseId === exLog.exerciseId)
        .forEach((e: any) => doneSets(e).forEach((set) => (max = Math.max(max, Number(set.weight) || 0))));
      return max;
    }, 0);
    if (previous > 0 && best.weight > previous) records.push({ name, ...best, previous });
  });

  const date = startedAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    title: session.title || session.routine?.name || 'Séance libre',
    date: date.charAt(0).toUpperCase() + date.slice(1),
    durationMin: endedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null,
    volume: Math.round(volume),
    sets,
    exercises,
    records,
  };
}

export const formatRecapDuration = (minutes: number | null) => {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m < 10 ? '0' : ''}${m}`;
};

// The palette of DESIGN.md: slate canvas, ink, sage for progress, sand for records
const C = {
  canvas: '#0f1216',
  card: '#181c21',
  line: '#252a32',
  ink: '#e0e2ea',
  inkSecondary: '#c9ced6',
  muted: '#9aa1a9',
  dim: '#6b737c',
  sage: '#7ca99a',
  sageText: '#a2d0c0',
  sand: '#d4a373',
  sandText: '#f0bd8b',
};
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const W = 1080;
const H = 1920;
const X = 96;
const CONTENT_W = W - X * 2;

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
};

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

/** Draws the recap; resolves once the web fonts are ready so the image uses Inter. */
export async function drawRecap(canvas: HTMLCanvasElement, recap: SessionRecap) {
  try {
    await Promise.all([document.fonts.load(`600 80px ${SANS}`), document.fonts.load(`400 36px ${SANS}`)]);
  } catch {
    // Fonts unavailable: the system sans stands in.
  }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.canvas;
  ctx.fillRect(0, 0, W, H);

  // Brand: the sage dot and the name, nothing louder
  ctx.fillStyle = C.sage;
  ctx.beginPath();
  ctx.arc(X + 10, 146, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText('Overloady', X + 36, 160);

  // Title and date
  ctx.font = `600 80px ${SANS}`;
  const titleLines = wrap(ctx, recap.title, CONTENT_W, 2);
  let y = 330;
  titleLines.forEach((line) => {
    ctx.fillStyle = C.ink;
    ctx.fillText(line, X, y);
    y += 92;
  });
  ctx.font = `400 38px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(recap.date, X, y + 4);
  y += 86;

  // Key figures split by hairlines: the volume on its own line, then time and sets side by side
  const hairline = () => {
    ctx.fillStyle = C.line;
    ctx.fillRect(X, y, CONTENT_W, 2);
  };
  const figure = (label: string, value: string, unit: string, x: number, size: number) => {
    ctx.font = `500 34px ${SANS}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(label, x, y + 70);
    ctx.font = `600 ${size}px ${SANS}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(value, x, y + 70 + size);
    if (unit) {
      const valueWidth = ctx.measureText(value).width;
      ctx.font = `500 40px ${SANS}`;
      ctx.fillStyle = C.muted;
      ctx.fillText(unit, x + valueWidth + 16, y + 70 + size);
    }
  };
  hairline();
  figure('Volume', recap.volume.toLocaleString('fr-FR').replace(/ /g, ' '), 'kg', X, 116);
  y += 230;
  hairline();
  figure('Durée', formatRecapDuration(recap.durationMin), '', X, 96);
  figure('Séries validées', String(recap.sets), '', X + CONTENT_W / 2, 96);
  ctx.fillStyle = C.line;
  ctx.fillRect(X + CONTENT_W / 2 - 32, y + 28, 2, 160);
  y += 218;
  hairline();
  y += 82;

  // Records in sand, else the best set of each exercise
  const rows = recap.records.length > 0
    ? recap.records.map((r) => ({ name: r.name, value: `${formatKg(r.weight)} kg × ${r.reps}` }))
    : recap.exercises
        .filter((e) => e.best)
        .map((e) => ({
          name: e.name,
          value: e.best!.weight > 0 ? `${formatKg(e.best!.weight)} kg × ${e.best!.reps}` : `${e.best!.reps} reps`,
        }));
  const maxRows = 4;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillStyle = recap.records.length > 0 ? C.sandText : C.muted;
  ctx.fillText(
    recap.records.length > 0
      ? `${recap.records.length} record${recap.records.length > 1 ? 's' : ''} battu${recap.records.length > 1 ? 's' : ''}`
      : 'Meilleures séries',
    X,
    y,
  );
  y += 74;
  rows.slice(0, maxRows).forEach((row) => {
    ctx.font = `600 40px ${SANS}`;
    const valueWidth = ctx.measureText(row.value).width;
    ctx.fillStyle = recap.records.length > 0 ? C.sandText : C.ink;
    ctx.textAlign = 'right';
    ctx.fillText(row.value, X + CONTENT_W, y);
    ctx.textAlign = 'left';
    ctx.font = `400 40px ${SANS}`;
    ctx.fillStyle = C.inkSecondary;
    ctx.fillText(fitText(ctx, row.name, CONTENT_W - valueWidth - 40), X, y);
    y += 66;
  });
  if (rows.length > maxRows) {
    ctx.font = `400 32px ${SANS}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`et ${rows.length - maxRows} de plus`, X, y);
  }

  // Signature: the staircase of progressive overload
  const base = 1790;
  const steps = 5;
  const stepW = CONTENT_W / steps;
  const stepH = 44;
  const stairs = new Path2D();
  stairs.moveTo(X, base);
  for (let i = 0; i < steps; i++) {
    stairs.lineTo(X + stepW * (i + 1), base - stepH * i);
    if (i < steps - 1) stairs.lineTo(X + stepW * (i + 1), base - stepH * (i + 1));
  }
  const under = new Path2D(stairs);
  under.lineTo(X + CONTENT_W, base);
  under.closePath();
  ctx.fillStyle = 'rgba(124, 169, 154, 0.08)';
  ctx.fill(under);
  ctx.strokeStyle = C.sage;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(stairs);

  ctx.font = `400 30px ${SANS}`;
  ctx.fillStyle = C.dim;
  ctx.fillText('Surcharge progressive · coach Atlas', X, 1862);
}

/** Shares the image through the phone's share sheet, or downloads it where sharing files is not possible. */
export async function shareRecapImage(canvas: HTMLCanvasElement, recap: SessionRecap): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image indisponible');
  const fileName = `overloady-${recap.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seance'}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: recap.title });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Share sheet refused: fall back to the download below
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
