import React, { useEffect, useState } from 'react';
import {
  AthleteProfileFields,
  EXPERIENCE_OPTIONS,
  toAthleteProfileValue,
  type AthleteProfileValue,
} from './AthleteProfileFields';
import { Icon } from './Icons';

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
  profile: any;
  onSaveProfile: (value: AthleteProfileValue) => Promise<void>;
}

const CalibrationProfile: React.FC<{
  profile: any;
  onSave: (value: AthleteProfileValue) => Promise<void>;
  defaultOpen: boolean;
}> = ({ profile, onSave, defaultOpen }) => {
  const [isEditing, setIsEditing] = useState(defaultOpen);
  const [value, setValue] = useState<AthleteProfileValue>(toAthleteProfileValue(profile));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setValue(toAthleteProfileValue(profile)), [profile]);

  const experience = EXPERIENCE_OPTIONS.find((o) => o.id === (profile?.experience || 'BEGINNER'));
  const summary = [
    profile?.weight ? `${profile.weight} kg` : null,
    profile?.height ? `${profile.height} cm` : null,
    experience ? `${experience.label} (${experience.detail.toLowerCase()})` : null,
    profile?.bodyFat ? `${profile.bodyFat} % body fat` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

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
        {!isEditing && (
          <button type="button" className="link-btn" onClick={() => setIsEditing(true)}>
            Modifier
          </button>
        )}
      </div>
      {isEditing && (
        <>
          <p className="calibration-profile-note">
            Les charges de base des séances test sont calculées à partir de ton poids, de ta masse maigre et de ton
            expérience.
          </p>
          <AthleteProfileFields value={value} onChange={setValue} idPrefix="calibration" />
          <div className="calibration-profile-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : 'Enregistrer et recalculer'}
            </button>
          </div>
        </>
      )}
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
  onSaveProfile,
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
                PROTOCOLE DE CALIBRATION ATHLÈTE
              </span>
              <span className="badge-pill is-jade">OBJECTIF : {status.goal}</span>
            </div>
            <h2 className="test-modal-title">Semaine Test d'Évaluation & Calibration</h2>
            <p className="test-modal-intro">
              3 séances stratégiques pour mesurer vos charges de référence, votre 1RM estimé et calibrer le moteur IA avant de lancer vos cycles de progression.
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
                ? '✓ Calibration terminée (100%) — Le Coach IA est activé !'
                : `Progression de la calibration : ${status.testWeekProgress} / ${status.totalSteps} séances validées (${progressPercent}%)`}
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

        <CalibrationProfile
          profile={profile}
          onSave={onSaveProfile}
          defaultOpen={!status.testWeekCompleted && status.testWeekProgress === 0}
        />

        {/* Recorded Benchmarks Grid (if any) */}
        {status.benchmarks && Object.keys(status.benchmarks).length > 0 && (
          <div className="test-benchmarks-summary">
            <div className="benchmarks-header">
              <Icon name="trophy" size={15} />
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
                    {isCompleted ? '✓ ' : ''}
                    {sess.dayName}
                    {isCurrent ? ' · en cours' : ''}
                  </div>
                  <div className="test-card-badge">{sess.badge}</div>
                </div>

                <div className="test-card-title-row">
                  <h3 className="test-session-title">{sess.name}</h3>
                  <span className="test-focus-tag">Focus : {sess.focus}</span>
                </div>

                <p className="test-session-goal">
                  <strong>Objectif de test :</strong> {sess.testingGoal}
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
                          <span className="test-ex-star" title="Benchmark principal">
                            ★{' '}
                          </span>
                        )}
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
                      className={isCurrent ? 'btn-primary' : 'btn-secondary'}
                      style={{ width: '100%' }}
                      onClick={() => onStartSession(sess.step)}
                      disabled={isStarting}
                    >
                      {isCurrent && !isStarting && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                      {isStarting
                        ? 'Lancement de la séance...'
                        : isCurrent
                        ? `Démarrer la Séance Test (Étape ${sess.step}/3)`
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
                Passer la phase de test et débloquer l'IA directement
              </button>
            ) : (
              <button
                className="btn-text-warning"
                onClick={onResetTestWeek}
                title="Réinitialise la calibration pour relancer une semaine de tests"
              >
                Relancer une Semaine de Test (Recalibration)
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
