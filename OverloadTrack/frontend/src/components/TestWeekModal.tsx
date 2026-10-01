import React from 'react';

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
    goal: string;
    sessions: TestSession[];
    benchmarks: Record<string, { maxWeight: number; bestReps: number; estimated1RM: number; sessionDate: string }>;
    canUnlockAi: boolean;
  } | null;
  onStartSession: (step: number) => void;
  onSkipTestWeek: () => void;
  onResetTestWeek: () => void;
  isStarting: boolean;
}

export const TestWeekModal: React.FC<TestWeekModalProps> = ({
  isOpen,
  onClose,
  status,
  onStartSession,
  onSkipTestWeek,
  onResetTestWeek,
  isStarting,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.4rem' }}>🧪</span>
              <span className="badge-pill" style={{ color: 'var(--accent-cyan)', borderColor: 'rgba(0, 240, 255, 0.4)' }}>
                PROTOCOLE DE CALIBRATION ATHLÈTE
              </span>
              <span className="badge-pill" style={{ color: 'var(--accent-volt)', borderColor: 'rgba(204, 255, 0, 0.4)' }}>
                OBJECTIF : {status.goal}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>
              Semaine Test d'Évaluation & Calibration
            </h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.4 }}>
              3 séances stratégiques pour mesurer vos charges de référence, votre 1RM estimé et calibrer le moteur IA avant de lancer vos cycles de progression.
            </p>
          </div>
          <button className="btn-close-modal" onClick={onClose} title="Fermer">✕</button>
        </div>

        {/* Global Progress Bar */}
        <div className="test-progress-bar-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {status.testWeekCompleted
                ? '✅ Calibration terminée (100%) — Le Coach IA est activé !'
                : `Progression de la calibration : ${status.testWeekProgress} / ${status.totalSteps} séances validées (${progressPercent}%)`}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: status.testWeekCompleted ? 'var(--accent-emerald)' : 'var(--accent-cyan)' }}>
              {progressPercent}%
            </span>
          </div>
          <div className="progress-track" style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              className="progress-fill"
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: status.testWeekCompleted
                  ? 'linear-gradient(90deg, var(--accent-emerald) 0%, var(--accent-volt) 100%)'
                  : 'linear-gradient(90deg, var(--accent-cyan) 0%, var(--accent-volt) 100%)',
                boxShadow: '0 0 12px rgba(0, 240, 255, 0.5)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Recorded Benchmarks Grid (if any) */}
        {status.benchmarks && Object.keys(status.benchmarks).length > 0 && (
          <div className="test-benchmarks-summary">
            <div className="benchmarks-header">
              <span>⚡</span>
              <span>Vos Records & Benchmarks Actuels Enregistrés</span>
            </div>
            <div className="benchmarks-cards-grid">
              {Object.entries(status.benchmarks).map(([name, data]) => (
                <div key={name} className="benchmark-card">
                  <div className="bench-name">{name}</div>
                  <div className="bench-1rm">
                    <strong>{data.estimated1RM} kg</strong>
                    <span className="bench-sub">1RM estimé</span>
                  </div>
                  <div className="bench-raw">
                    Charge testée : {data.maxWeight} kg × {data.bestReps} reps
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
                    {isCompleted ? '✅' : isCurrent ? '⚡' : '🔒'} {sess.dayName}
                  </div>
                  <div className="test-card-badge">{sess.badge}</div>
                </div>

                <div className="test-card-title-row">
                  <h3 className="test-session-title">{sess.name}</h3>
                  <span className="test-focus-tag">Focus : {sess.focus}</span>
                </div>

                <p className="test-session-goal">
                  🎯 <strong>Objectif de test :</strong> {sess.testingGoal}
                </p>

                {/* Exercises Preview */}
                <div className="test-exercises-grid">
                  {sess.exercises.map((ex, idx) => (
                    <div
                      key={idx}
                      className={`test-exercise-pill ${ex.isKeyBenchmark ? 'key-benchmark' : ''}`}
                    >
                      <div className="test-ex-title">
                        {ex.isKeyBenchmark && <span title="Benchmark principal" style={{ color: 'var(--accent-volt)' }}>⭐ </span>}
                        <span>{ex.name}</span>
                      </div>
                      <div className="test-ex-details">
                        {ex.sets} séries × {ex.reps} reps • Base {ex.defaultWeight}kg
                      </div>
                      {ex.isKeyBenchmark && (
                        <div className="test-metric-tag">{ex.benchmarkMetric}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Instructions */}
                <div className="test-instructions-box">
                  <span className="inst-title">Consignes du protocole :</span>
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
                      <span>✓ Séance test validée</span>
                    </div>
                  ) : (
                    <button
                      className={isCurrent ? 'btn-volt' : 'btn-glass'}
                      style={{ width: '100%' }}
                      onClick={() => onStartSession(sess.step)}
                      disabled={isStarting}
                    >
                      {isStarting
                        ? 'Lancement de la séance...'
                        : isCurrent
                        ? `▶ Démarrer la Séance Test (Étape ${sess.step}/3)`
                        : `Lancer le Test ${sess.dayName}`}
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
                title="Débloque directement le coach IA sans effectuer les tests"
              >
                ⏩ Passer la phase de test et débloquer l'IA directement
              </button>
            ) : (
              <button
                className="btn-text-warning"
                onClick={onResetTestWeek}
                title="Réinitialise la calibration pour relancer une semaine de tests"
              >
                🔄 Relancer une Semaine de Test (Recalibration)
              </button>
            )}
          </div>

          <button className="btn-glass" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
