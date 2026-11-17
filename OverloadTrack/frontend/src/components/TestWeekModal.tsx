import React from 'react';
import { EXPERIENCE_OPTIONS } from './AthleteProfileFields';
import { GlossaryTerm } from './Glossary';
import { Icon } from './Icons';
import { displayName } from '../lib/exerciseNames';

interface ExercisePlan {
  name: string;
  isKeyBenchmark: boolean;
  benchmarkMetric: string;
  defaultWeight: number;
  sets: number;
  reps: number;
  targetAdvice: string;
  reason: string;
}

interface TestSession {
  step: number;
  dayName: string;
  name: string;
  focus: string;
  badge: string;
  testingGoal: string;
  instructions: string[];
  exercises: ExercisePlan[];
  status: 'completed' | 'current' | 'upcoming';
}

interface TestWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: {
    testWeekCompleted: boolean;
    testWeekProgress: number;
    currentStep: number;
    totalSteps: number;
    sessions: TestSession[];
    benchmarks: Record<string, { maxWeight: number; bestReps: number; estimated1RM: number; sessionDate: string }>;
    canUnlockAi: boolean;
  } | null;
  onStartSession: (step: number) => void;
  onSkipTestWeek: () => void;
  onResetTestWeek: () => void;
  isStarting: boolean;
  profile: any;
  /** Closes the window and opens the Profil tab, where the athlete profile is edited. */
  onOpenProfile: () => void;
}

/** The profile the test loads come from, edited in the Profil tab only (one form, not two). */
const CalibrationProfile: React.FC<{ profile: any; onOpenProfile: () => void }> = ({ profile, onOpenProfile }) => {
  const experience = EXPERIENCE_OPTIONS.find((o) => o.id === (profile?.experience || 'BEGINNER'));
  const summary = [
    profile?.weight ? `${profile.weight} kg` : null,
    profile?.height ? `${profile.height} cm` : null,
    experience ? `${experience.label} (${experience.detail.toLowerCase()})` : null,
    profile?.bodyFat ? `${profile.bodyFat} % body fat` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="calibration-profile">
      <div className="calibration-profile-head">
        <div>
          <div className="calibration-profile-title">
            <Icon name="user" size={17} />
            Ton profil de calibration
          </div>
          <div className="calibration-profile-summary">{summary}</div>
        </div>
        <button type="button" className="link-btn" onClick={onOpenProfile}>
          Modifier dans le Profil
        </button>
      </div>
      <p className="calibration-profile-note">
        Les charges des séances test partent de ton poids, de ta masse maigre et de ton expérience. Elles sont
        recalculées dès que tu enregistres ton profil.
      </p>
    </div>
  );
};

export const TestWeekModal: React.FC<TestWeekModalProps> = ({
  isOpen,
  onClose,
  status,
  onStartSession,
  onSkipTestWeek,
  onResetTestWeek,
  isStarting,
  profile,
  onOpenProfile,
}) => {
  if (!isOpen || !status) return null;

  const progressPercent = Math.round((status.testWeekProgress / status.totalSteps) * 100);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content test-week-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '820px' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="test-modal-tags">
              <span className="badge-pill">
                <Icon name="flask" size={13} />
                Protocole de calibration
              </span>
            </div>
            <h2 className="test-modal-title">Semaine test</h2>
            <p className="test-modal-intro">
              {status.totalSteps} séances pour mesurer tes vraies charges. Sur chaque mouvement, monte jusqu’à une série dure, à RPE 8-9{' '}
              <GlossaryTerm term="rpe89" /> : il te reste 1 ou 2 reps en réserve <GlossaryTerm term="rir" />. Ensuite, Atlas
              prépare tes séances à partir de ces charges.
            </p>
          </div>
          <button className="btn-close-modal" onClick={onClose} title="Fermer" aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Global Progress Bar */}
        <div className="test-progress-bar-container">
          <div className="test-progress-head">
            <span>
              {status.testWeekCompleted
                ? 'Calibration terminée : Atlas prépare tes séances.'
                : `${status.testWeekProgress} séance${status.testWeekProgress > 1 ? 's' : ''} test sur ${status.totalSteps} faite${status.testWeekProgress > 1 ? 's' : ''}`}
            </span>
            <strong className={status.testWeekCompleted ? 'is-done' : ''}>{progressPercent}%</strong>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill${status.testWeekCompleted ? ' is-done' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <CalibrationProfile profile={profile} onOpenProfile={onOpenProfile} />

        {/* Recorded Benchmarks Grid (if any) */}
        {status.benchmarks && Object.keys(status.benchmarks).length > 0 && (
          <div className="test-benchmarks-summary">
            <div className="benchmarks-header">
              <Icon name="trophy" size={15} />
              <span>Tes charges mesurées</span>
            </div>
            <div className="benchmarks-cards-grid">
              {Object.entries(status.benchmarks).map(([name, data]) => (
                <div key={name} className="benchmark-card">
                  <div className="bench-name">{name}</div>
                  <div className="bench-1rm">
                    <strong>{data.estimated1RM} kg</strong>
                    <span className="bench-sub">
                      1RM estimé <GlossaryTerm term="1rm" />
                    </span>
                  </div>
                  <div className="bench-raw">
                    Série test : {data.maxWeight} kg × {data.bestReps} reps
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 Test Sessions Breakdown */}
        <div className="test-sessions-list">
          {status.sessions.map((sess) => {
            const isCompleted = sess.status === 'completed';
            const isCurrent = sess.status === 'current';

            return (
              <div
                key={sess.step}
                className={`test-session-card ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''}`}
              >
                <div className="test-card-top">
                  <div className="test-step-badge">
                    {isCompleted ? '✓ ' : ''}
                    {sess.dayName}
                    {isCurrent ? ' · en cours' : ''}
                  </div>
                  <div className="test-card-badge">{sess.badge}</div>
                </div>

                <div className="test-card-title-row">
                  <h3 className="test-session-title">{sess.name}</h3>
                  <span className="test-focus-tag">{sess.focus}</span>
                </div>

                <p className="test-session-goal">
                  <strong>Le but :</strong> {sess.testingGoal}
                </p>

                {/* Exercises Preview */}
                <div className="test-exercises-grid">
                  {sess.exercises.map((ex, idx) => (
                    <div
                      key={idx}
                      className={`test-exercise-pill ${ex.isKeyBenchmark ? 'key-benchmark' : ''}`}
                    >
                      <div className="test-ex-title">
                        {ex.isKeyBenchmark && (
                          <span className="test-ex-star" role="img" title="Mouvement de référence" aria-label="Mouvement de référence">
                            ★{' '}
                          </span>
                        )}
                        <span>{displayName(ex.name)}</span>
                      </div>
                      <div className="test-ex-details">
                        {ex.sets} séries × {ex.reps} reps · départ {ex.defaultWeight} kg
                      </div>
                      {ex.isKeyBenchmark && (
                        <div className="test-metric-tag">{ex.benchmarkMetric}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Instructions */}
                <div className="test-instructions-box">
                  <span className="inst-title">Consignes</span>
                  <ul>
                    {sess.instructions.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ul>
                </div>

                {/* Launch Action */}
                <div className="test-card-actions">
                  {isCompleted ? (
                    <div className="btn-test-completed">
                      <span>✓ Séance test faite</span>
                    </div>
                  ) : (
                    <button
                      className={isCurrent ? 'btn-primary' : 'btn-secondary'}
                      style={{ width: '100%' }}
                      onClick={() => onStartSession(sess.step)}
                      disabled={isStarting}
                    >
                      {isCurrent && !isStarting && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                      {isStarting
                        ? 'Lancement de la séance…'
                        : `Lancer la séance test ${sess.step} sur ${status.totalSteps}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            {!status.testWeekCompleted ? (
              <button
                className="btn-text-danger"
                onClick={onSkipTestWeek}
                title="Atlas prépare tes séances sans séance test"
              >
                Passer la semaine test
              </button>
            ) : (
              <button
                className="btn-text-warning"
                onClick={onResetTestWeek}
                title="Refaire les 3 séances test"
              >
                Refaire la semaine test
              </button>
            )}
          </div>

          <button className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
