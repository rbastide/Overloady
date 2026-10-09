import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { Icon } from './Icons';

export interface CoachExercise {
  exerciseId: string;
  name: string;
  category?: string;
  rest?: string;
  targetAdvice?: string;
  sets: { setNumber: number; weight: number; reps: number }[];
}

export interface CoachWorkout {
  title: string;
  focus: string;
  durationMin: number | null;
  notes: string;
  exercises: CoachExercise[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  workouts?: CoachWorkout[];
}

interface CoachChatProps {
  onStartWorkout: (workout: CoachWorkout) => Promise<void>;
  onSaveRoutine: (workout: CoachWorkout) => Promise<void>;
  onError: (text: string) => void;
}

const STORAGE_KEY = 'coachChat:v1';
const HISTORY_SENT = 12;
const SUGGESTIONS = [
  "Séance push d'1h",
  'Programme PPL sur 3 jours',
  'Séance jambes sans squat',
  'Full body 45 min haltères',
];

const loadMessages = (): ChatMessage[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

// The API only takes text: proposed sessions are summarised so the coach can modify them later.
const toApiMessage = (m: ChatMessage) => ({
  role: m.role,
  content: m.workouts?.length
    ? `${m.content}\n${m.workouts
        .map(
          (w) =>
            `${w.title} : ${w.exercises
              .map((ex) => `${ex.name} ${ex.sets.length}x${ex.sets[0]?.reps ?? ''} ${ex.sets[0]?.weight ?? 0}kg`)
              .join(', ')}`,
        )
        .join('\n')}`
    : m.content,
});

const formatSets = (ex: CoachExercise) => {
  const first = ex.sets[0];
  if (!first) return '';
  return `${ex.sets.length} × ${first.reps}${first.weight > 0 ? ` · ${first.weight} kg` : ''}`;
};

export const CoachChat: React.FC<CoachChatProps> = ({ onStartWorkout, onSaveRoutine, onError }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage unavailable (private mode): the conversation simply isn't kept.
    }
  }, [messages]);

  // Follow the conversation, but show a coach reply from its first line: the sessions can be long.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const last = list.lastElementChild as HTMLElement | null;
    const showReplyStart = !isThinking && messages[messages.length - 1]?.role === 'assistant' && last;
    list.scrollTo({ top: showReplyStart ? last.offsetTop - 16 : list.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isThinking) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setIsThinking(true);
    try {
      const res = await api.post('/workout/coach-chat', { messages: next.slice(-HISTORY_SENT).map(toApiMessage) });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.message, workouts: res.data.workouts || [] }]);
    } catch (err: any) {
      // Give the text back so the athlete can resend it.
      setMessages((prev) => prev.slice(0, -1));
      setDraft(content);
      onError(err.response?.data?.message || 'Atlas ne répond pas. Réessaie dans quelques secondes.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const runCardAction = async (key: string, action: () => Promise<void>) => {
    setBusyCard(key);
    try {
      await action();
    } finally {
      setBusyCard(null);
    }
  };

  return (
    <section className="coach-chat glass-panel">
      <header className="coach-head">
        <div className="coach-avatar">
          <Icon name="sparkle" size={20} />
        </div>
        <div className="coach-head-text">
          <h2>
            Atlas <span className="coach-head-tag">Ton coach IA</span>
          </h2>
          <p>Dis-moi ce que tu veux, je te programme la séance (ou tout un programme).</p>
        </div>
        {messages.length > 0 && (
          <button className="link-btn" onClick={() => setMessages([])} disabled={isThinking}>
            Nouvelle conversation
          </button>
        )}
      </header>

      <div className="coach-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="coach-empty">
            <p>Exemples de demandes :</p>
            <div className="coach-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="coach-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, mi) => (
          <div key={mi} className={`coach-msg coach-msg-${m.role}`}>
            <div className="coach-bubble">{m.content}</div>
            {m.workouts?.map((w, wi) => {
              const key = `${mi}-${wi}`;
              return (
                <article key={key} className="coach-workout">
                  <div className="coach-workout-head">
                    <h3>{w.title}</h3>
                    <span className="coach-workout-meta">
                      {[w.focus, w.durationMin && `${w.durationMin} min`].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {w.notes && <p className="coach-workout-notes">{w.notes}</p>}
                  <ol className="coach-exercises">
                    {w.exercises.map((ex, ei) => (
                      <li key={ei}>
                        <div className="coach-ex-line">
                          <span className="coach-ex-name">{ex.name}</span>
                          <span className="coach-ex-sets">{formatSets(ex)}</span>
                        </div>
                        {ex.targetAdvice && <span className="coach-ex-advice">{ex.targetAdvice}</span>}
                      </li>
                    ))}
                  </ol>
                  <div className="coach-workout-actions">
                    <button
                      className="btn-primary"
                      disabled={busyCard !== null}
                      onClick={() => runCardAction(`${key}-start`, () => onStartWorkout(w))}
                    >
                      <Icon name="play" size={16} />
                      {busyCard === `${key}-start` ? 'Lancement...' : 'Lancer cette séance'}
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busyCard !== null}
                      onClick={() => runCardAction(`${key}-save`, () => onSaveRoutine(w))}
                    >
                      <Icon name="save" size={16} />
                      {busyCard === `${key}-save` ? 'Enregistrement...' : 'Enregistrer en programme'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

        {isThinking && (
          <div className="coach-msg coach-msg-assistant">
            <div className="coach-bubble coach-thinking">
              <span className="coach-dots">
                <i />
                <i />
                <i />
              </span>
              Atlas prépare ta séance… (jusqu'à 1 min)
            </div>
          </div>
        )}
      </div>

      <form
        className="coach-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Dis à Atlas ce que tu veux travailler…"
          rows={1}
          maxLength={2000}
          disabled={isThinking}
        />
        <button type="submit" className="coach-send" disabled={isThinking || !draft.trim()} aria-label="Envoyer">
          <Icon name="send" size={18} />
        </button>
      </form>
    </section>
  );
};
