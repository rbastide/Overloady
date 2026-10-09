import React, { useEffect, useState } from 'react';
import api from '../api';
import { Icon } from './Icons';

const formatVolume = (volume: number) =>
  volume >= 1000 ? `${(volume / 1000).toFixed(1).replace('.', ',')} t` : `${volume} kg`;

// Bar with rounded top corners only: the data end is rounded, the baseline stays square.
const barPath = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
};

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
    return <p className="muted-note">Impossible de charger les données analytiques.</p>;
  }

  const { totalVolume, totalSessions, muscleDistribution, personalRecords, weeklyTrends, achievements } = data;

  // Find max volume in weekly trends for scaling SVG bars
  const maxWeeklyVol = weeklyTrends.length > 0
    ? Math.max(...weeklyTrends.map((w: any) => w.volume), 1000)
    : 1000;
  // Direct labels on the latest week and the best one only; the others are in the tooltips.
  const bestWeekIndex = weeklyTrends.reduce(
    (best: number, w: any, idx: number) => (w.volume > (weeklyTrends[best]?.volume ?? -1) ? idx : best),
    0,
  );
  const lastWeekIndex = weeklyTrends.length - 1;

  return (
    <div>
      <div className="header flex-between">
        <div>
          <h1>Analytique & Records Personnels</h1>
          <p>Mesurez votre progression globale, votre équilibre musculaire et vos trophées.</p>
        </div>
        <button className="btn-secondary" onClick={fetchAnalytics}>
          <Icon name="refresh" size={18} />
          Actualiser
        </button>
      </div>

      {/* KPI Stats */}
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <h3>Volume Total à Vie</h3>
          <div className="value">
            {totalVolume.toLocaleString()} <small>kg</small>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Séances Enregistrées</h3>
          <div className="value">
            {totalSessions} <small>séances</small>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Records Personnels (PRs)</h3>
          <div className="value is-accent">
            {personalRecords.length} <small>exercices</small>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <h3>Trophées Débloqués</h3>
          <div className="value is-jade">
            {achievements.filter((a: any) => a.unlocked).length} <small>/ {achievements.length}</small>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="tab-pill-container" style={{ marginBottom: '2rem' }}>
        <button
          className={`tab-pill ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          Équilibre & Tendances
        </button>
        <button
          className={`tab-pill ${activeSubTab === 'prs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('prs')}
        >
          Mur des Records ({personalRecords.length})
        </button>
        <button
          className={`tab-pill ${activeSubTab === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('badges')}
        >
          Trophées & Badges
        </button>
      </div>

      {/* TAB 1: OVERVIEW & MUSCLE BALANCE */}
      {activeSubTab === 'overview' && (
        <div className="analytics-grid">
          {/* Muscle Distribution */}
          <div className="glass-panel">
            <h3 className="panel-title">
              <Icon name="dumbbell" size={20} />
              Répartition du Volume par Muscle
            </h3>
            {muscleDistribution.length > 0 ? (
              <div className="muscle-bars">
                {muscleDistribution.map((item: any) => (
                  <div key={item.category}>
                    <div className="muscle-bar-head">
                      <span>{item.category}</span>
                      <span>
                        <strong>{item.volume.toLocaleString()} kg</strong> ({item.percentage}%) • {item.sets} séries
                      </span>
                    </div>
                    <div className="meter-track">
                      <div className="meter-fill" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-note">Complétez votre premier entraînement pour voir la répartition.</p>
            )}
          </div>

          {/* Weekly Volume SVG Chart */}
          <div className="glass-panel">
            <h3 className="panel-title">
              <Icon name="chart" size={20} />
              Évolution des Volumes (Dernières Semaines)
            </h3>
            {weeklyTrends.length > 0 ? (
              <div>
                <svg className="chart-svg" viewBox="0 0 400 200" role="img" aria-label="Volume total par semaine">
                  <defs>
                    <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#e5a93c" />
                      <stop offset="100%" stopColor="#e5a93c" stopOpacity="0.18" />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  <line x1="40" y1="30" x2="380" y2="30" stroke="rgba(246,243,237,0.06)" />
                  <line x1="40" y1="95" x2="380" y2="95" stroke="rgba(246,243,237,0.06)" />
                  <line x1="40" y1="160" x2="380" y2="160" stroke="rgba(246,243,237,0.18)" />

                  {weeklyTrends.map((w: any, idx: number) => {
                    const barWidth = Math.min(35, 300 / weeklyTrends.length);
                    const x = 50 + idx * ((340 - 50) / Math.max(1, weeklyTrends.length - 1 || 1)) - barWidth / 2;
                    const barHeight = Math.max(8, (w.volume / maxWeeklyVol) * 130);
                    const y = 160 - barHeight;
                    const showLabel = idx === lastWeekIndex || idx === bestWeekIndex;

                    return (
                      <g key={idx} className="chart-bar-group">
                        <title>{`${w.label} : ${formatVolume(w.volume)}`}</title>
                        <path className="chart-bar" d={barPath(x, y, barWidth, barHeight, 4)} fill="url(#barGradient)" />
                        {showLabel && (
                          <text
                            x={x + barWidth / 2}
                            y={y - 6}
                            textAnchor="middle"
                            fill="var(--text-secondary)"
                            fontSize="9"
                            fontWeight="600"
                          >
                            {formatVolume(w.volume)}
                          </text>
                        )}
                        <text x={x + barWidth / 2} y="175" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                          {w.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="chart-caption">Volume total cumulé par semaine d'entraînement</div>
              </div>
            ) : (
              <p className="muted-note">Aucune donnée hebdomadaire disponible.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PERSONAL RECORDS HALL OF FAME */}
      {activeSubTab === 'prs' && (
        <div>
          <div className="routine-grid">
            {personalRecords.map((pr: any) => (
              <div key={pr.exerciseId} className="glass-panel pr-card">
                <div className="pr-card-head">
                  <span className="badge-category">{pr.category}</span>
                  <span>{pr.date}</span>
                </div>

                <h3>{pr.exerciseName}</h3>

                <div className="pr-card-values">
                  <div>
                    <div className="pr-card-label">Charge Max (PR)</div>
                    <div className="pr-card-value is-accent">{pr.maxWeight} kg</div>
                    <div className="pr-card-sub">× {pr.bestSet.reps} reps</div>
                  </div>

                  <div>
                    <div className="pr-card-label">1RM Estimé</div>
                    <div className="pr-card-value is-jade">{pr.max1RM} kg</div>
                    <div className="pr-card-sub">Potentiel max</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {personalRecords.length === 0 && (
            <div className="glass-panel empty-panel">
              <span className="empty-panel-icon">
                <Icon name="trophy" size={26} />
              </span>
              <h3>Aucun record enregistré pour le moment</h3>
              <p>Complétez des séances avec des séries validées pour alimenter votre Mur des Records !</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACHIEVEMENTS & TROPHIES */}
      {activeSubTab === 'badges' && (
        <div className="routine-grid">
          {achievements.map((badge: any) => (
            <div key={badge.id} className={`glass-panel badge-card ${badge.unlocked ? 'is-unlocked' : 'is-locked'}`}>
              <div className="badge-card-head">
                <h3>{badge.title}</h3>
                <Icon name={badge.unlocked ? 'trophy' : 'lock'} size={20} />
              </div>

              <p>{badge.description}</p>

              <div className="badge-card-foot">
                <span>{badge.unlocked ? '✓ Débloqué' : 'En progression'}</span>
                <span>{badge.progress}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
