import { Icon } from './Icons';

interface PainNotesProps {
  /** Movements left out for a sensitive area: "Pas de fente : tu as signalé ton genou." */
  avoided?: string[] | null;
  /** Shown when the session keeps lighter single-joint work around the area. */
  prevention?: string | null;
}

/** What Atlas or the local engine changed for the athlete's pains, said plainly on the session card. */
export function PainNotes({ avoided, prevention }: PainNotesProps) {
  const lines = [...(avoided || []), ...(prevention ? [prevention] : [])];
  if (lines.length === 0) return null;
  return (
    <ul className="pain-notes" aria-label="Adapté à tes douleurs">
      {lines.map((line) => (
        <li key={line}>
          <Icon name="info" size={14} />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
