import React, { useEffect, useState } from 'react';
import api from '../api';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'prs' | 'badges'>('overview');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/workout/analytics');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '300px' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!data) {
    return <p style={{ color: 'var(--text-muted)' }}>Impossible de charger les données analytiques.</p>;
  }

  const { totalVolume, totalSessions, muscleDistribution, personalRecords, weeklyTrends, achievements } = data;

  // Find max volume in weekly trends for scaling SVG bars
  const maxWeeklyVol = weeklyTrends.length > 0
    ? Math.max(...weeklyTrends.map((w: any) => w.volume), 1000)
    : 1000;

  return (
    <div>
      <div className="header flex-between">
        <div>
          <h1>Analytique & Records Personnels</h1>
          <p>Mesurez votre progression globale, votre équilibre musculaire et vos trophées.</p>
        </div>
        <button className="btn-secondary" onClick={fetchAnalytics}>
          🔄 Actualiser
        </button>
      </div>

      {/* KPI Stats */}
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <h3>Volume Total à Vie</h3>
          <div className="value" style={{ color: 'var(--accent-orange)' }}>
            {totalVolume.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg</span>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Séances Enregistrées</h3>
          <div className="value" style={{ color: 'var(--accent-green)' }}>
            {totalSessions} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>séances</span>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Records Personnels (PRs)</h3>
          <div className="value" style={{ color: 'var(--accent-purple)' }}>
            {personalRecords.length} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>exercices</span>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Trophées Débloqués</h3>
          <div className="value">
            {achievements.filter((a: any) => a.unlocked).length} / {achievements.length}
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="tab-pill-container" style={{ marginBottom: '2rem' }}>
        <button
          className={`tab-pill ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          📊 Équilibre & Tendances
        </button>
        <button
          className={`tab-pill ${activeSubTab === 'prs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('prs')}
        >
          🏆 Mur des Records ({personalRecords.length})
        </button>
        <button
          className={`tab-pill ${activeSubTab === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('badges')}
        >
          🎖️ Trophées & Badges
        </button>
      </div>

      {/* TAB 1: OVERVIEW & MUSCLE BALANCE */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Muscle Distribution */}
          <div className="glass-panel">
            <h3 style={{ marginBottom: '1.25rem' }}>💪 Répartition du Volume par Muscle</h3>
            {muscleDistribution.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {muscleDistribution.map((item: any) => (
                  <div key={item.category}>
                    <div className="flex-between" style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600 }}>{item.category}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong>{item.volume.toLocaleString()} kg</strong> ({item.percentage}%) • {item.sets} séries
                      </span>
                    </div>
                    <div className="timer-progress-track" style={{ height: '8px', margin: 0 }}>
                      <div
                        className="timer-progress-bar"
                        style={{
                          width: `${item.percentage}%`,
                          background: item.category === 'Pectoraux'
                            ? 'linear-gradient(90deg, #ff5e3a, #ff2a5f)'
                            : item.category === 'Dos'
                            ? 'linear-gradient(90deg, #9d4edd, #5a189a)'
                            : item.category === 'Jambes'
                            ? 'linear-gradient(90deg, #20c997, #05f1af)'
                            : item.category === 'Épaules'
                            ? 'linear-gradient(90deg, #3a86ff, #00b4d8)'
                            : 'linear-gradient(90deg, #ffb703, #fb8500)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Complétez votre premier entraînement pour voir la répartition.</p>
            )}
          </div>

          {/* Weekly Volume SVG Chart */}
          <div className="glass-panel">
            <h3 style={{ marginBottom: '1rem' }}>📈 Évolution des Volumes (Dernières Semaines)</h3>
            {weeklyTrends.length > 0 ? (
              <div>
                <svg viewBox="0 0 400 200" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                  {/* Grid lines */}
                  <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
                  <line x1="40" y1="80" x2="380" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
                  <line x1="40" y1="140" x2="380" y2="140" stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
                  <line x1="40" y1="160" x2="380" y2="160" stroke="rgba(255,255,255,0.2)" />

                  {weeklyTrends.map((w: any, idx: number) => {
                    const barWidth = Math.min(35, 300 / weeklyTrends.length);
                    const x = 50 + idx * ((340 - 50) / Math.max(1, weeklyTrends.length - 1 || 1)) - barWidth / 2;
                    const barHeight = Math.max(8, (w.volume / maxWeeklyVol) * 130);
                    const y = 160 - barHeight;

                    return (
                      <g key={idx}>
                        {/* Bar */}
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="6"
                          fill="url(#barGradient)"
                          style={{ transition: 'all 0.3s ease' }}
                        />
                        {/* Value label */}
                        <text
                          x={x + barWidth / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fill="var(--text-muted)"
                          fontSize="9"
                          fontWeight="600"
                        >
                          {w.volume > 1000 ? `${(w.volume / 1000).toFixed(1)}t` : `${w.volume}k`}
                        </text>
                        {/* X label */}
                        <text
                          x={x + barWidth / 2}
                          y="175"
                          textAnchor="middle"
                          fill="var(--text-muted)"
                          fontSize="10"
                        >
                          {w.label}
                        </text>
                      </g>
                    );
                  })}

                  <defs>
                    <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent-orange)" />
                      <stop offset="100%" stopColor="#ff2a5f" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Volume total cumulé par semaine d'entraînement
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Aucune donnée hebdomadaire disponible.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PERSONAL RECORDS HALL OF FAME */}
      {activeSubTab === 'prs' && (
        <div>
          <div className="routine-grid">
            {personalRecords.map((pr: any) => (
              <div key={pr.exerciseId} className="glass-panel" style={{ borderLeft: '4px solid var(--accent-orange)' }}>
                <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                  <span className="badge-category">{pr.category}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pr.date}</span>
                </div>

                <h3 style={{ margin: '0.25rem 0 0.75rem 0' }}>{pr.exerciseName}</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Charge Max (PR)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-orange)' }}>
                      {pr.maxWeight} kg
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      × {pr.bestSet.reps} reps
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1RM Estimé</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-purple)' }}>
                      {pr.max1RM} kg
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Potentiel max
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {personalRecords.length === 0 && (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
              <span style={{ fontSize: '2.5rem' }}>🏆</span>
              <h3 style={{ marginTop: '0.5rem' }}>Aucun record enregistré pour le moment</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Complétez des séances avec des séries validées pour alimenter votre Mur des Records !
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACHIEVEMENTS & TROPHIES */}
      {activeSubTab === 'badges' && (
        <div className="routine-grid">
          {achievements.map((badge: any) => (
            <div
              key={badge.id}
              className="glass-panel"
              style={{
                opacity: badge.unlocked ? 1 : 0.6,
                border: badge.unlocked ? '1px solid var(--accent-green)' : 'var(--glass-border)',
                background: badge.unlocked
                  ? 'linear-gradient(135deg, rgba(32, 201, 151, 0.08), rgba(18, 24, 38, 0.8))'
                  : 'var(--bg-card)',
              }}
            >
              <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, color: badge.unlocked ? 'var(--text-main)' : 'var(--text-muted)' }}>
                  {badge.title}
                </h3>
                <span style={{ fontSize: '1.25rem' }}>{badge.unlocked ? '🔓' : '🔒'}</span>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', minHeight: '38px' }}>
                {badge.description}
              </p>

              <div className="flex-between" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: badge.unlocked ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {badge.unlocked ? '✓ Débloqué' : 'En progression'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{badge.progress}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
