import React, { useState, useEffect } from 'react';
import api from '../api';

interface WarmupSet {
  setNumber: number;
  weight: number;
  reps: number;
  label: string;
}

interface WarmupModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  targetWeight: number;
  onApplyWarmup: (warmupSets: Array<{ weight: number; reps: number; completed: boolean }>) => void;
}

export const WarmupModal: React.FC<WarmupModalProps> = ({
  isOpen,
  onClose,
  exerciseName,
  targetWeight,
  onApplyWarmup,
}) => {
  const [workingWeight, setWorkingWeight] = useState(targetWeight || 80);
  const [barWeight, setBarWeight] = useState(20);
  const [warmupSets, setWarmupSets] = useState<WarmupSet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (targetWeight > 0) {
      setWorkingWeight(targetWeight);
    }
  }, [targetWeight]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.post('/workout/warmup', { targetWeight: workingWeight, barWeight })
      .then((res) => {
        setWarmupSets(res.data);
      })
      .catch((err) => {
        console.error('Failed to load warmup', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, workingWeight, barWeight]);

  if (!isOpen) return null;

  const handleApply = () => {
    const formatted = warmupSets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      completed: false,
    }));
    onApplyWarmup(formatted);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h2>🔥 Protocole d'Échauffement</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{exerciseName}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Charge de travail cible (kg)</label>
            <input
              type="number"
              step="2.5"
              className="input-glass"
              value={workingWeight}
              onChange={(e) => setWorkingWeight(Math.max(10, Number(e.target.value)))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Poids barre (kg)</label>
            <select
              className="input-glass"
              value={barWeight}
              onChange={(e) => setBarWeight(Number(e.target.value))}
            >
              <option value={20}>20 kg</option>
              <option value={15}>15 kg</option>
              <option value={10}>10 kg</option>
              <option value={0}>Haltères (0)</option>
            </select>
          </div>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Ce protocole active le système nerveux central et prépare les articulations sans générer de fatigue résiduelle avant vos séries effectives.
        </p>

        {loading ? (
          <div className="flex-center" style={{ padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
            <table className="sets-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Étape</th>
                  <th>Charge</th>
                  <th>Reps</th>
                  <th>Objectif</th>
                </tr>
              </thead>
              <tbody>
                {warmupSets.map((s, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className="badge-pill" style={{ background: 'rgba(255, 94, 58, 0.2)' }}>
                        #{s.setNumber}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-orange)' }}>
                      {s.weight} kg
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.reps}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          className="btn-neon"
          style={{ width: '100%' }}
          onClick={handleApply}
          disabled={warmupSets.length === 0}
        >
          ⚡ Injecter l'échauffement dans la séance
        </button>
      </div>
    </div>
  );
};
