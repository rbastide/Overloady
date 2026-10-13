import { useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { SET_TYPE_LABELS, SET_TYPE_MARKS, SET_TYPES, type SetType } from '../lib/setTypes';

// What each type does to the numbers, in the athlete's words
const SET_TYPE_HELP: Record<SetType, string> = {
  normal: 'Compte dans le volume, les records et la progression.',
  warmup: 'Ne compte nulle part : ni volume, ni records, ni prochaine cible.',
  drop: 'Compte dans le volume, sans changer la prochaine cible.',
  failure: 'Compte partout. La prochaine fois : même charge, mêmes reps.',
};

interface SetTypeSheetProps {
  /** 1-based number of the set being typed; null when closed. */
  setNumber: number | null;
  current: SetType;
  onPick: (type: SetType) => void;
  onClose: () => void;
}

/** The four set types, named and explained: the athlete picks one instead of cycling blind. */
export function SetTypeSheet({ setNumber, current, onPick, onClose }: SetTypeSheetProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  });

  const isOpen = setNumber !== null;
  useEffect(() => {
    if (!isOpen) return;
    currentRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeHandler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (setNumber === null) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card set-type-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-type-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="set-type-title">Type de la série {setNumber}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="set-type-options" role="radiogroup" aria-labelledby="set-type-title">
          {SET_TYPES.map((type) => {
            const selected = type === current;
            return (
              <button
                key={type}
                ref={selected ? currentRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`set-type-option${selected ? ' is-selected' : ''}`}
                onClick={() => onPick(type)}
              >
                <span className={`set-type-mark is-${type}`} aria-hidden="true">
                  {type === 'normal' ? setNumber : SET_TYPE_MARKS[type]}
                </span>
                <span className="set-type-text">
                  <span className="set-type-name">{SET_TYPE_LABELS[type]}</span>
                  <span className="set-type-help">{SET_TYPE_HELP[type]}</span>
                </span>
                {selected && <Icon name="check" size={16} strokeWidth={2.6} className="set-type-check" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
