import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

interface RegenerateModalProps {
  isOpen: boolean;
  /** Title of the session currently proposed, the one the request changes. */
  sessionTitle?: string;
  onClose: () => void;
  /** Empty instructions: the coach simply proposes another session. */
  onSubmit: (instructions: string) => void;
}

const MAX_LENGTH = 500;
const SUGGESTIONS = [
  'Plus courte (45 min)',
  'Sans squat',
  'Plus légère aujourd’hui',
  'Seulement des haltères',
  'Ajoute des abdos',
  'Plus de volume',
];

/** Asks the AI coach for a new version of the proposed session, with what to change. */
export const RegenerateModal: React.FC<RegenerateModalProps> = ({ isOpen, sessionTitle, onClose, onSubmit }) => {
  const [instructions, setInstructions] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Latest handler, so the key listener isn't rebuilt (and the focus reset) at each parent render
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeHandler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const addSuggestion = (suggestion: string) => {
    setInstructions((text) => {
      const trimmed = text.trim();
      if (trimmed.toLowerCase().includes(suggestion.toLowerCase())) return text;
      return (trimmed ? `${trimmed.replace(/[.,;]$/, '')}, ${suggestion.toLowerCase()}` : suggestion).slice(0, MAX_LENGTH);
    });
    textareaRef.current?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(instructions.trim());
    setInstructions('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card regenerate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="regenerate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="regenerate-title">Modifier la séance</h2>
            <p>{sessionTitle ? `Le coach IA retravaille « ${sessionTitle} ».` : 'Le coach IA conçoit une nouvelle séance.'}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="regenerate-instructions">Qu'est-ce que tu veux changer ?</label>
            <textarea
              id="regenerate-instructions"
              ref={textareaRef}
              rows={4}
              maxLength={MAX_LENGTH}
              placeholder="Ex : remplace le développé couché par des pompes, j'ai mal au genou, pas plus de 4 exercices…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter sends, Enter alone keeps writing
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
            <span className="regenerate-count">
              {instructions.length}/{MAX_LENGTH}
            </span>
          </div>

          <div className="regenerate-suggestions" role="group" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} className="coach-chip" onClick={() => addSuggestion(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="confirm-dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              <Icon name="sparkle" size={16} />
              {instructions.trim() ? 'Appliquer' : 'Autre séance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
