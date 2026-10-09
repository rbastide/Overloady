import React, { useEffect, useState } from 'react';
import api from '../api';
import { Icon } from './Icons';

interface ExerciseDetailModalProps {
  exerciseId: string | null;
  onClose: () => void;
  onAddToWorkout?: (exercise: any) => void;
  isWorkoutActive?: boolean;
}

export const ExerciseDetailModal: React.FC<ExerciseDetailModalProps> = ({
  exerciseId,
  onClose,
  onAddToWorkout,
  isWorkoutActive,
}) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!exerciseId) return;
    setLoading(true);
    api.get(`/workout/stats/${exerciseId}`)
      .then((res) => {
        setStats(res.data);
      })
      .catch((err) => {
        console.error('Failed to load stats', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [exerciseId]);

  if (!exerciseId) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h2>{stats?.exercise?.name || 'Détails Exercice'}</h2>
            <span className="badge-category">{stats?.exercise?.category || 'Général'}</span>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex-center" style={{ padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : stats ? (
          <div>
            {/* PR and Stats Grid */}
            <div className="dashboard-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="glass-panel stat-card" style={{ padding: '1rem' }}>
                <h3>Record Max (PR)</h3>
                <div className="value is-accent">
                  {stats.maxWeight > 0 ? `${stats.maxWeight} kg` : '-'}
                </div>
              </div>
              <div className="glass-panel stat-card" style={{ padding: '1rem' }}>
                <h3>1RM Estimé</h3>
                <div className="value is-jade">
                  {stats.maxEstimated1RM > 0 ? `${stats.maxEstimated1RM} kg` : '-'}
                </div>
              </div>
            </div>

            {/* Progressive Overload Recommendation */}
            <div className="engine-banner" style={{ marginBottom: '1.5rem' }}>
              <span className="engine-icon" aria-hidden="true">
                <Icon name="target" size={22} />
              </span>
              <div className="engine-text">
                <div className="engine-kicker">
                  <strong>Surcharge Progressive Recommandée</strong>
                </div>
                <p>{stats.recommendedOverload.reason}</p>
              </div>
            </div>

            {/* Past Performance History */}
            <h4>Historique des séances</h4>
            {stats.historyPoints && stats.historyPoints.length > 0 ? (
              <div className="table-wrapper" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table className="sets-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Max Levée</th>
                      <th>1RM</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.historyPoints.slice().reverse().map((pt: any, i: number) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)' }}>{pt.date}</td>
                        <td style={{ fontWeight: 600 }}>{pt.maxWeight} kg</td>
                        <td style={{ color: 'var(--jade-text)' }}>{pt.estimated1RM} kg</td>
                        <td>{pt.totalVolume} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Aucune séance enregistrée pour cet exercice pour le moment.
              </p>
            )}

            {isWorkoutActive && onAddToWorkout && (
              <button
                className="btn-primary"
                style={{ width: '100%', marginTop: '1.5rem' }}
                onClick={() => {
                  onAddToWorkout(stats.exercise);
                  onClose();
                }}
              >
                + Ajouter à la séance en cours
              </button>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Impossible de charger les données.</p>
        )}
      </div>
    </div>
  );
};
