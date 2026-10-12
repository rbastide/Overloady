import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

// Training words the app uses without assuming the athlete knows them
const TERMS = {
  rpe: {
    title: 'RPE, l’effort perçu',
    text: 'De 1 à 10, la difficulté ressentie. 10 : plus aucune rep possible. 8 : il t’en restait deux. Atlas s’en sert pour doser ta prochaine charge.',
  },
  '1rm': {
    title: '1RM, la charge maximale',
    text: 'Ce que tu pourrais soulever une seule fois. Overloady l’estime à partir de tes séries (formule d’Epley) : inutile de la tester.',
  },
  overload: {
    title: 'Surcharge progressive',
    text: 'Faire un peu plus que la dernière fois, une rep ou un peu de charge, pour que le muscle continue de s’adapter. L’app te propose chaque cible.',
  },
} as const;

type GlossaryTermId = keyof typeof TERMS;

const EDGE = 16;

/** A "?" next to a training word: tap it for a two-line definition. */
export function GlossaryTerm({ term }: { term: GlossaryTermId }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const { title, text } = TERMS[term];
  const id = `glossary-${term}`;

  // Keep the bubble inside the screen on phones
  useLayoutEffect(() => {
    if (!open || !bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - EDGE);
    const overflowLeft = EDGE - rect.left;
    setShift(overflowRight > 0 ? -overflowRight : overflowLeft > 0 ? overflowLeft : 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShift(0);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <span className="glossary" ref={wrapRef}>
      <button
        type="button"
        className="glossary-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Définition : ${title}`}
        onClick={() => {
          setShift(0);
          setOpen((o) => !o);
        }}
      >
        <Icon name="info" size={14} />
      </button>
      {open && (
        <span
          id={id}
          ref={bubbleRef}
          className="glossary-bubble"
          role="note"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          <strong>{title}</strong>
          <span>{text}</span>
        </span>
      )}
    </span>
  );
}
