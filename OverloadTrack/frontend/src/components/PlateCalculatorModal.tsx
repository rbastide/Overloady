import React, { useState } from 'react';

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultWeight?: number;
}

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({ isOpen, onClose, defaultWeight = 80 }) => {
  const [activeTab, setActiveTab] = useState<'1rm' | 'plates'>('1rm');

  // 1RM state
  const [weight1RM, setWeight1RM] = useState<number>(defaultWeight);
  const [reps1RM, setReps1RM] = useState<number>(5);

  // Plate state
  const [targetWeight, setTargetWeight] = useState<number>(defaultWeight);
  const [barWeight, setBarWeight] = useState<number>(20);

  if (!isOpen) return null;

  // 1RM Calculation (Epley formula: weight * (1 + reps / 30))
  const calculated1RM = reps1RM > 0 ? Math.round(weight1RM * (1 + reps1RM / 30) * 10) / 10 : weight1RM;

  const percentages = [
    { pct: 100, reps: '1 rep' },
    { pct: 95, reps: '2 reps' },
    { pct: 90, reps: '3-4 reps' },
    { pct: 85, reps: '5-6 reps' },
    { pct: 80, reps: '7-8 reps' },
    { pct: 75, reps: '9-10 reps' },
    { pct: 70, reps: '11-12 reps' },
  ];

  // Plate Calculation
  const availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25];
  const plateColors: Record<number, string> = {
    25: '#e63946',
    20: '#1d3557',
    15: '#e9c46a',
    10: '#2a9d8f',
    5: '#ffffff',
    2.5: '#495057',
    1.25: '#adb5bd',
  };

  const weightPerSide = Math.max(0, (targetWeight - barWeight) / 2);
  let remaining = weightPerSide;
  const sidePlates: number[] = [];

  for (const plate of availablePlates) {
    while (remaining >= plate - 0.01) {
      sidePlates.push(plate);
      remaining = Math.round((remaining - plate) * 100) / 100;
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <h2>🧮 Calculatrices Gym</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="tab-pill-container" style={{ marginBottom: '1.5rem' }}>
          <button 
            className={`tab-pill ${activeTab === '1rm' ? 'active' : ''}`}
            onClick={() => setActiveTab('1rm')}
          >
            Estimation 1RM
          </button>
          <button 
            className={`tab-pill ${activeTab === 'plates' ? 'active' : ''}`}
            onClick={() => setActiveTab('plates')}
          >
            Charge & Disques
          </button>
        </div>

        {activeTab === '1rm' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Charge levée (kg)</label>
                <input 
                  type="number" 
                  className="input-glass" 
                  value={weight1RM} 
                  onChange={(e) => setWeight1RM(Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Répétitions</label>
                <input 
                  type="number" 
                  className="input-glass" 
                  value={reps1RM} 
                  onChange={(e) => setReps1RM(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="highlight-box flex-center" style={{ flexDirection: 'column', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                1RM Estimé (Max 1 Répétition)
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-orange)' }}>
                {calculated1RM} <span style={{ fontSize: '1.25rem' }}>kg</span>
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>Pourcentages de travail</h4>
            <div className="table-wrapper">
              <table className="sets-table">
                <thead>
                  <tr>
                    <th>% 1RM</th>
                    <th>Charge</th>
                    <th>Reps recommandées</th>
                  </tr>
                </thead>
                <tbody>
                  {percentages.map((p) => (
                    <tr key={p.pct}>
                      <td><span className="badge-pill">{p.pct}%</span></td>
                      <td style={{ fontWeight: 600 }}>{Math.round((calculated1RM * p.pct) / 100 * 2) / 2} kg</td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.reps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Charge Totale Cible (kg)</label>
                <input 
                  type="number" 
                  step="0.5"
                  className="input-glass" 
                  value={targetWeight} 
                  onChange={(e) => setTargetWeight(Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Poids barre</label>
                <select 
                  className="input-glass" 
                  value={barWeight} 
                  onChange={(e) => setBarWeight(Number(e.target.value))}
                >
                  <option value={20}>20 kg (Olympique)</option>
                  <option value={15}>15 kg (Femme/Crossfit)</option>
                  <option value={10}>10 kg (Technique)</option>
                </select>
              </div>
            </div>

            <div className="highlight-box" style={{ padding: '1rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>À charger par côté de la barre :</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                {weightPerSide} kg
              </div>
            </div>

            {/* Visual Barbell */}
            <div className="barbell-container">
              <div className="barbell-collar">
                {sidePlates.map((plate, idx) => (
                  <div 
                    key={idx} 
                    className="barbell-plate"
                    style={{ 
                      backgroundColor: plateColors[plate] || '#ccc',
                      height: `${Math.min(100, Math.max(35, plate * 3.5))}px`,
                      color: plate === 5 ? '#000' : '#fff'
                    }}
                    title={`${plate} kg`}
                  >
                    <span>{plate}</span>
                  </div>
                ))}
                {sidePlates.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Barre à vide</div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h4>Détail des disques requis (par côté) :</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {sidePlates.length > 0 ? (
                  Array.from(new Set(sidePlates)).map((p) => {
                    const count = sidePlates.filter((x) => x === p).length;
                    return (
                      <span key={p} className="badge-plate" style={{ borderLeft: `4px solid ${plateColors[p]}` }}>
                        {count} × {p} kg
                      </span>
                    );
                  })
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aucun disque nécessaire</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
