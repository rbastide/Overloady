import React, { useState, useEffect } from 'react';
import api from './api';
import './App.css';
import { RestTimer } from './components/RestTimer';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { AddExerciseModal } from './components/AddExerciseModal';
import { RoutineModal } from './components/RoutineModal';
import { ToastContainer, type ToastMessage } from './components/Toast';

interface ActiveSet {
  reps: number;
  weight: number;
  completed: boolean;
}

interface ActiveExercise {
  exerciseId: string;
  name: string;
  category?: string;
  progressiveTarget?: string;
  sets: ActiveSet[];
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logger' | 'routines' | 'history' | 'exercises' | 'profile'>('dashboard');

  // Core Data
  const [profile, setProfile] = useState<any>({});
  const [exercises, setExercises] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>({});

  // Active Workout Session
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeRoutineName, setActiveRoutineName] = useState<string | null>(null);
  const [workout, setWorkout] = useState<ActiveExercise[]>([]);
  const [sessionRpe, setSessionRpe] = useState<number>(7);
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Rest Timer State
  const [showRestTimer, setShowRestTimer] = useState<boolean>(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState<number | null>(null);
  const [autoRestEnabled, setAutoRestEnabled] = useState<boolean>(true);

  // Modals
  const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
  const [plateCalcDefaultWeight, setPlateCalcDefaultWeight] = useState(80);
  const [selectedExerciseIdForModal, setSelectedExerciseIdForModal] = useState<string | null>(null);
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(false);
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);

  // Exercise Library Filters
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Expanded History cards
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Workout duration clock
  useEffect(() => {
    let interval: any = null;
    if (activeSessionId && workoutStartTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - workoutStartTime.getTime()) / 1000));
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [activeSessionId, workoutStartTime]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  const fetchData = async () => {
    try {
      const [profileRes, exercisesRes, historyRes, routinesRes, statsRes] = await Promise.all([
        api.get('/profile').catch(() => ({ data: {} })),
        api.get('/exercises').catch(() => ({ data: [] })),
        api.get('/workout/history').catch(() => ({ data: [] })),
        api.get('/routines').catch(() => ({ data: [] })),
        api.get('/workout/dashboard-stats').catch(() => ({ data: {} })),
      ]);
      setProfile(profileRes.data);
      setExercises(exercisesRes.data);
      setHistory(historyRes.data);
      setRoutines(routinesRes.data);
      setDashboardStats(statsRes.data);
    } catch (err) {
      console.error(err);
      if ((err as any).response?.status === 401) {
        handleLogout();
      }
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const res = await api.post(endpoint, { email, password });
      localStorage.setItem('token', res.data.access_token);
      setIsAuthenticated(true);
      showToast(isLoginMode ? 'Connexion réussie !' : 'Compte créé avec succès !');
    } catch (err: any) {
      setAuthError(err.response?.data?.message || "Échec de l'authentification");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setActiveSessionId(null);
    setWorkout([]);
  };

  // Start Blank Workout
  const startNewWorkout = async () => {
    try {
      const res = await api.post('/workout/start', {});
      setActiveSessionId(res.data.id);
      setActiveRoutineName(null);
      setWorkout([]);
      setSessionNotes('');
      setSessionRpe(7);
      setWorkoutStartTime(new Date());
      setActiveTab('logger');
      showToast('Nouvelle séance libre démarrée !', 'info');
    } catch (err: any) {
      showToast("Impossible de démarrer la séance", 'error');
    }
  };

  // Start from Routine
  const startRoutineWorkout = async (routine: any) => {
    try {
      const res = await api.post('/workout/start', { routineId: routine.id });
      setActiveSessionId(res.data.id);
      setActiveRoutineName(routine.name);
      setSessionNotes(`Programme: ${routine.name}`);
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      // Preload exercises with progressive targets
      const prefilledExercises: ActiveExercise[] = (res.data.exercises || []).map((exLog: any) => ({
        exerciseId: exLog.exerciseId,
        name: exLog.exercise?.name || 'Exercice',
        category: exLog.exercise?.category,
        sets: (exLog.sets || []).map((s: any) => ({
          weight: s.weight,
          reps: s.reps,
          completed: false,
        })),
      }));

      setWorkout(prefilledExercises);
      setActiveTab('logger');
      showToast(`Programme "${routine.name}" lancé !`, 'success');
    } catch (err) {
      showToast('Erreur lors du lancement de la routine', 'error');
    }
  };

  // Add Exercise to Active Session
  const addExerciseToSession = async (exercise: any) => {
    // Fetch progressive target recommendation for this exercise
    let target = 'Objectif : 20kg × 10 reps';
    try {
      const statsRes = await api.get(`/workout/stats/${exercise.id}`);
      if (statsRes.data?.recommendedOverload?.reason) {
        target = statsRes.data.recommendedOverload.reason;
      }
    } catch (e) {
      // ignore
    }

    setWorkout([
      ...workout,
      {
        exerciseId: exercise.id,
        name: exercise.name,
        category: exercise.category,
        progressiveTarget: target,
        sets: [
          { weight: 20, reps: 10, completed: false },
          { weight: 20, reps: 10, completed: false },
          { weight: 20, reps: 10, completed: false },
        ],
      },
    ]);
    showToast(`${exercise.name} ajouté à la séance`);
  };

  const removeExerciseFromSession = (index: number) => {
    const updated = [...workout];
    updated.splice(index, 1);
    setWorkout(updated);
  };

  const addSet = (exerciseIndex: number) => {
    const updated = [...workout];
    const prevSet = updated[exerciseIndex].sets[updated[exerciseIndex].sets.length - 1];
    const weight = prevSet ? prevSet.weight : 20;
    const reps = prevSet ? prevSet.reps : 10;
    updated[exerciseIndex].sets.push({ weight, reps, completed: false });
    setWorkout(updated);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const updated = [...workout];
    updated[exerciseIndex].sets.splice(setIndex, 1);
    setWorkout(updated);
  };

  const updateSet = (eIndex: number, sIndex: number, field: 'reps' | 'weight', value: string) => {
    const updated = [...workout];
    updated[eIndex].sets[sIndex][field] = Number(value) || 0;
    setWorkout(updated);
  };

  const toggleSetCompleted = (eIndex: number, sIndex: number) => {
    const updated = [...workout];
    const currentVal = updated[eIndex].sets[sIndex].completed;
    updated[eIndex].sets[sIndex].completed = !currentVal;
    setWorkout(updated);

    if (!currentVal && autoRestEnabled) {
      setShowRestTimer(true);
      setRestTimerSeconds(90);
    }
  };

  // Finish and Save Workout
  const finishWorkout = async () => {
    if (!activeSessionId) return;

    if (workout.length === 0) {
      if (!window.confirm('Votre séance ne contient aucun exercice. Voulez-vous quand même la terminer ?')) {
        return;
      }
    }

    try {
      await api.post('/workout/finish', {
        sessionId: activeSessionId,
        rpe: sessionRpe,
        notes: sessionNotes,
        exercises: workout.map((ex) => ({
          exerciseId: ex.exerciseId,
          sets: ex.sets.map((s) => ({
            reps: Number(s.reps) || 0,
            weight: Number(s.weight) || 0,
            completed: Boolean(s.completed),
          })),
        })),
      });

      showToast('Séance enregistrée avec succès ! 💪', 'success');
      setActiveSessionId(null);
      setActiveRoutineName(null);
      setWorkout([]);
      setWorkoutStartTime(null);
      setShowRestTimer(false);
      setActiveTab('history');
      fetchData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Erreur lors de l'enregistrement", 'error');
    }
  };

  // Delete Workout Session
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette séance de votre historique ?')) {
      return;
    }
    try {
      await api.delete(`/workout/session/${sessionId}`);
      showToast('Séance supprimée', 'info');
      fetchData();
    } catch (err) {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  // Delete Routine
  const handleDeleteRoutine = async (routineId: string) => {
    if (!window.confirm('Supprimer ce programme ?')) return;
    try {
      await api.delete(`/routines/${routineId}`);
      showToast('Programme supprimé', 'info');
      fetchData();
    } catch (err) {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  // Save Profile
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/profile', {
        height: Number(profile.height),
        weight: Number(profile.weight),
      });
      showToast('Profil mis à jour !', 'success');
    } catch (err) {
      showToast('Erreur lors de la sauvegarde du profil', 'error');
    }
  };

  // Open Plate Calculator for specific weight
  const openPlateCalculatorWithWeight = (weight: number) => {
    setPlateCalcDefaultWeight(weight || 80);
    setIsPlateCalcOpen(true);
  };

  // Formatter for elapsed time
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`;
    }
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Filter exercises
  const filteredExercises = exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(exerciseSearch.toLowerCase());
    const matchCategory = selectedCategory === 'Tous' || ex.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const allCategories = ['Tous', ...Array.from(new Set(exercises.map((e) => e.category || 'Général')))];

  // Calculate BMI
  const heightM = profile.height ? profile.height / 100 : 0;
  const bmi = heightM > 0 && profile.weight ? Math.round((profile.weight / (heightM * heightM)) * 10) / 10 : null;

  // Render Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <div className="glass-panel auth-card">
          <div className="logo">
            <span>O</span>verloady
          </div>
          <p>
            {isLoginMode
              ? 'Heureux de vous revoir ! Connectez-vous pour suivre votre progression.'
              : 'Créez votre compte pour suivre votre surcharge progressive.'}
          </p>

          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label>Adresse Email</label>
              <input
                type="email"
                className="input-glass"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@exemple.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password"
                className="input-glass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {authError && (
              <div style={{ color: '#ff2a5f', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn-neon" style={{ width: '100%', marginTop: '0.5rem' }}>
              {isLoginMode ? 'Se Connecter' : "S'inscrire"}
            </button>
          </form>

          <div className="auth-toggle">
            {isLoginMode ? "Vous n'avez pas encore de compte ?" : 'Vous possédez déjà un compte ?'}
            <span onClick={() => setIsLoginMode(!isLoginMode)}>
              {isLoginMode ? "S'inscrire" : 'Se Connecter'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const renderNavItems = (isMobile = false) => {
    const items = [
      { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
      { id: 'logger', label: 'Séance en direct', icon: '🏋️', badge: activeSessionId ? 'En cours' : undefined },
      { id: 'routines', label: 'Programmes', icon: '📋' },
      { id: 'history', label: 'Historique', icon: '📅' },
      { id: 'exercises', label: 'Exercices', icon: '💪' },
      { id: 'profile', label: 'Profil', icon: '👤' },
    ];

    if (isMobile) {
      return items.map((item) => (
        <div
          key={item.id}
          className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => setActiveTab(item.id as any)}
        >
          <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ));
    }

    return items.map((item) => (
      <div
        key={item.id}
        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
        onClick={() => setActiveTab(item.id as any)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {item.badge && <span className="nav-badge">{item.badge}</span>}
      </div>
    ));
  };

  return (
    <div className="app-container">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Sidebar for Desktop */}
      <aside className="sidebar">
        <div className="logo">
          <span>O</span>verloady
        </div>
        <nav className="nav-links">{renderNavItems()}</nav>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            className="btn-secondary"
            style={{ width: '100%', fontSize: '0.85rem' }}
            onClick={() => setIsPlateCalcOpen(true)}
          >
            🧮 Calculateur 1RM / Disques
          </button>
          <button
            className="btn-icon"
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              color: '#ff5e5e',
            }}
            onClick={handleLogout}
          >
            <span>🚪</span> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* ================= TAB 1: DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Bienvenue, {profile.user?.email?.split('@')[0]} ! 👋</h1>
                <p>Suivez votre surcharge progressive et vos records personnels.</p>
              </div>
              <button className="btn-secondary" onClick={() => setIsPlateCalcOpen(true)}>
                🧮 Calculatrices Gym
              </button>
            </div>

            {/* Dashboard Stats Grid */}
            <div className="dashboard-grid">
              <div className="glass-panel stat-card">
                <h3>Séances cette semaine</h3>
                <div className="value" style={{ color: 'var(--accent-orange)' }}>
                  {dashboardStats.workoutsThisWeek ?? 0}{' '}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 7j</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <h3>Volume soulevé (7j)</h3>
                <div className="value" style={{ color: 'var(--accent-green)' }}>
                  {dashboardStats.weekVolume ? `${dashboardStats.weekVolume.toLocaleString()}` : '0'}{' '}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <h3>Poids actuel</h3>
                <div className="value" style={{ color: 'var(--accent-purple)' }}>
                  {profile.weight || '--'}{' '}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <h3>Indice IMC</h3>
                <div className="value">
                  {bmi || '--'}{' '}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {bmi ? (bmi < 25 ? '(Normal)' : '(Surpoids)') : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>⚡ Actions Rapides</h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn-neon" onClick={startNewWorkout}>
                  + Démarrer une séance libre
                </button>
                <button className="btn-secondary" onClick={() => setIsRoutineModalOpen(true)}>
                  + Créer un nouveau programme
                </button>
                <button className="btn-secondary" onClick={() => setActiveTab('exercises')}>
                  💪 Parcourir les exercices
                </button>
              </div>
            </div>

            {/* Routines Grid Preview */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="flex-between" style={{ marginBottom: '1rem' }}>
                <h2>Vos Programmes d'entraînement ({routines.length})</h2>
                <button
                  className="btn-small"
                  onClick={() => setIsRoutineModalOpen(true)}
                  style={{ color: 'var(--accent-orange)' }}
                >
                  + Ajouter
                </button>
              </div>

              {routines.length > 0 ? (
                <div className="routine-grid">
                  {routines.slice(0, 3).map((rt) => (
                    <div key={rt.id} className="glass-panel routine-card">
                      <div>
                        <h3>{rt.name}</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                          {rt.exercises?.length || 0} exercices inclus
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
                          {(rt.exercises || []).slice(0, 4).map((ex: any) => (
                            <span key={ex.id} className="badge-category" style={{ fontSize: '0.7rem' }}>
                              {ex.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn-neon"
                        style={{ width: '100%', fontSize: '0.9rem', padding: '0.6rem' }}
                        onClick={() => startRoutineWorkout(rt)}
                      >
                        ▶ Lancer ce programme
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Vous n'avez pas encore configuré de programme (Push, Pull, Legs, Full Body...).
                  </p>
                  <button className="btn-secondary" onClick={() => setIsRoutineModalOpen(true)}>
                    Créer mon premier programme
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: WORKOUT LOGGER ================= */}
        {activeTab === 'logger' && (
          <div>
            <div className="header flex-between">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <h1>{activeSessionId ? (activeRoutineName || 'Séance en direct') : 'Aucune séance active'}</h1>
                  {activeSessionId && (
                    <div className="workout-timer-chip">
                      <span>⏱️</span> {formatDuration(elapsedSeconds)}
                    </div>
                  )}
                </div>
                <p>
                  {activeSessionId
                    ? 'Saisissez vos charges et répétitions. Cochez chaque série pour déclencher le repos.'
                    : 'Démarrez une nouvelle séance pour commencer à enregistrer vos performances.'}
                </p>
              </div>

              {activeSessionId ? (
                <button className="btn-neon" onClick={finishWorkout}>
                  ✓ Terminer et Enregistrer
                </button>
              ) : (
                <button className="btn-neon" onClick={startNewWorkout}>
                  + Démarrer une séance
                </button>
              )}
            </div>

            {activeSessionId ? (
              <div className="workout-logger">
                {/* Rest Timer */}
                {showRestTimer && (
                  <RestTimer
                    autoStartSeconds={restTimerSeconds}
                    onClose={() => setShowRestTimer(false)}
                  />
                )}

                {!showRestTimer && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-small" onClick={() => setShowRestTimer(true)}>
                      ⏱️ Ouvrir le chronomètre de repos
                    </button>
                  </div>
                )}

                {/* Workout Exercises */}
                {workout.map((exercise, eIndex) => (
                  <div key={exercise.exerciseId + eIndex} className="glass-panel exercise-group">
                    <div className="exercise-header">
                      <div>
                        <h3>{exercise.name}</h3>
                        <span className="badge-category" style={{ fontSize: '0.75rem' }}>
                          {exercise.category || 'Général'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-icon"
                          title="Calculer les disques"
                          onClick={() => {
                            const lastSetWeight = exercise.sets[0]?.weight || 80;
                            openPlateCalculatorWithWeight(lastSetWeight);
                          }}
                        >
                          🧮
                        </button>
                        <button
                          className="btn-icon"
                          title="Supprimer cet exercice"
                          onClick={() => removeExerciseFromSession(eIndex)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {exercise.progressiveTarget && (
                      <div className="overload-target-chip">
                        <span>🎯</span> {exercise.progressiveTarget}
                      </div>
                    )}

                    <table className="sets-table">
                      <thead>
                        <tr>
                          <th style={{ width: '45px' }}>Série</th>
                          <th>Charge (kg)</th>
                          <th>Reps</th>
                          <th style={{ width: '50px', textAlign: 'center' }}>Validé</th>
                          <th style={{ width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {exercise.sets.map((set, sIndex) => (
                          <tr key={sIndex}>
                            <td>
                              <span className="set-number">{sIndex + 1}</span>
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.5"
                                className="input-glass"
                                value={set.weight || ''}
                                placeholder="0"
                                onChange={(e) => updateSet(eIndex, sIndex, 'weight', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="input-glass"
                                value={set.reps || ''}
                                placeholder="0"
                                onChange={(e) => updateSet(eIndex, sIndex, 'reps', e.target.value)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className={`btn-check-set ${set.completed ? 'completed' : ''}`}
                                onClick={() => toggleSetCompleted(eIndex, sIndex)}
                                title="Marquer comme validé"
                              >
                                ✓
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn-icon"
                                style={{ padding: '0.2rem', color: '#ff5e5e' }}
                                onClick={() => removeSet(eIndex, sIndex)}
                                title="Supprimer la série"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ marginTop: '0.75rem' }}>
                      <button className="btn-small" onClick={() => addSet(eIndex)}>
                        + Ajouter une série
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Exercise Dropdown */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ marginBottom: '0.75rem' }}>+ Ajouter un exercice à la séance :</h4>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <select
                      className="input-glass"
                      style={{ flex: 1, minWidth: '220px', textAlign: 'left' }}
                      onChange={(e) => {
                        const ex = exercises.find((x) => x.id === e.target.value);
                        if (ex) addExerciseToSession(ex);
                        e.target.value = '';
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choisir un exercice parmi la bibliothèque...
                      </option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} [{ex.category || 'Général'}]
                        </option>
                      ))}
                    </select>

                    <button className="btn-secondary" onClick={() => setIsAddExerciseOpen(true)}>
                      + Créer exercice personnalisé
                    </button>
                  </div>
                </div>

                {/* Session Feedback & Notes */}
                <div className="glass-panel">
                  <div className="form-group">
                    <label>RPE de la séance (Effort perçu de 1 à 10) : {sessionRpe}/10</label>
                    <div className="rpe-selector">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`rpe-btn ${sessionRpe === num ? 'active' : ''}`}
                          onClick={() => setSessionRpe(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Notes de séance (sensations, forme, courbatures...)</label>
                    <input
                      type="text"
                      className="input-glass"
                      placeholder="Ex: Excellente séance, bonne congestion, barre facile à 80kg..."
                      value={sessionNotes}
                      onChange={(e) => setSessionNotes(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  className="btn-neon"
                  style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                  onClick={finishWorkout}
                >
                  ✓ Terminer et Enregistrer la séance
                </button>
              </div>
            ) : (
              <div className="glass-panel flex-center" style={{ flexDirection: 'column', padding: '4rem 2rem', textAlign: 'center' }}>
                <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏋️‍♂️</span>
                <h2>Aucun entraînement en cours</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>
                  Prêt à repousser vos limites ? Démarrez une séance libre ou lancez un programme personnalisé.
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn-neon" onClick={startNewWorkout}>
                    Démarrer une séance libre
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveTab('routines')}>
                    Choisir un programme
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: ROUTINES ================= */}
        {activeTab === 'routines' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Programmes d'entraînement</h1>
                <p>Structurez vos cycles (Push, Pull, Legs, Upper, Lower) pour optimiser vos gains.</p>
              </div>
              <button className="btn-neon" onClick={() => setIsRoutineModalOpen(true)}>
                + Nouveau Programme
              </button>
            </div>

            <div className="routine-grid">
              {routines.map((rt) => (
                <div key={rt.id} className="glass-panel routine-card">
                  <div>
                    <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0 }}>{rt.name}</h3>
                      <button
                        className="btn-icon"
                        style={{ color: '#ff5e5e' }}
                        onClick={() => handleDeleteRoutine(rt.id)}
                        title="Supprimer la routine"
                      >
                        🗑️
                      </button>
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {rt.exercises?.length || 0} exercices
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                      {(rt.exercises || []).map((ex: any) => (
                        <div
                          key={ex.id}
                          className="flex-between"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                          }}
                        >
                          <span>{ex.name}</span>
                          <span className="badge-category" style={{ fontSize: '0.65rem' }}>
                            {ex.category || 'Général'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    className="btn-neon"
                    style={{ width: '100%' }}
                    onClick={() => startRoutineWorkout(rt)}
                  >
                    ▶ Lancer l'entraînement
                  </button>
                </div>
              ))}
            </div>

            {routines.length === 0 && (
              <div className="glass-panel flex-center" style={{ flexDirection: 'column', padding: '3rem', textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</span>
                <h3>Aucun programme créé pour le moment</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Créez des routines personnalisées pour pré-remplir automatiquement vos séances et appliquer la surcharge progressive.
                </p>
                <button className="btn-neon" onClick={() => setIsRoutineModalOpen(true)}>
                  + Créer mon premier programme
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: HISTORY ================= */}
        {activeTab === 'history' && (
          <div>
            <div className="header">
              <h1>Historique des Entraînements</h1>
              <p>Consultez vos séances passées, le volume soulevé et vos séries validées.</p>
            </div>

            {history.map((session) => {
              const isExpanded = expandedHistoryId === session.id;
              let sessionVolume = 0;
              (session.exercises || []).forEach((ex: any) => {
                (ex.sets || []).forEach((s: any) => {
                  if (s.completed) sessionVolume += (s.weight || 0) * (s.reps || 0);
                });
              });

              return (
                <div key={session.id} className="glass-panel" style={{ marginBottom: '1.25rem' }}>
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h3 style={{ color: 'var(--accent-orange)', margin: 0 }}>
                        {session.routine ? session.routine.name : 'Séance Libre'} —{' '}
                        {new Date(session.startedAt).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </h3>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <span>RPE: <strong>{session.rpe}/10</strong></span>
                        <span>Volume: <strong>{sessionVolume.toLocaleString()} kg</strong></span>
                        <span>Exercices: <strong>{session.exercises?.length || 0}</strong></span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-small"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : session.id)}
                      >
                        {isExpanded ? 'Masquer détails' : 'Voir détails'}
                      </button>
                      <button
                        className="btn-icon"
                        style={{ color: '#ff5e5e' }}
                        onClick={() => handleDeleteSession(session.id)}
                        title="Supprimer la séance"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {session.notes && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                      "{session.notes}"
                    </div>
                  )}

                  {/* Expanded Exercise and Sets view */}
                  {isExpanded && (
                    <div style={{ marginTop: '1.25rem', borderTop: 'var(--glass-border)', paddingTop: '1rem' }}>
                      {session.exercises?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {session.exercises.map((exLog: any) => (
                            <div key={exLog.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                <strong>{exLog.exercise?.name || 'Exercice'}</strong>
                                <span className="badge-category" style={{ fontSize: '0.7rem' }}>
                                  {exLog.exercise?.category || 'Général'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {exLog.sets?.map((st: any, idx: number) => (
                                  <span
                                    key={st.id || idx}
                                    style={{
                                      background: st.completed ? 'rgba(32,201,151,0.15)' : 'rgba(255,255,255,0.05)',
                                      border: st.completed ? '1px solid var(--accent-green)' : '1px solid rgba(255,255,255,0.1)',
                                      color: st.completed ? 'var(--accent-green)' : 'var(--text-muted)',
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    S{idx + 1}: {st.weight}kg × {st.reps} {st.completed ? '✓' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          Aucun exercice n'a été consigné dans cette séance.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {history.length === 0 && (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>Aucune séance passée enregistrée.</p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: EXERCISES ================= */}
        {activeTab === 'exercises' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Bibliothèque d'Exercices</h1>
                <p>Consultez vos records personnels, l'historique et la surcharge progressive suggérée.</p>
              </div>
              <button className="btn-neon" onClick={() => setIsAddExerciseOpen(true)}>
                + Nouvel Exercice
              </button>
            </div>

            {/* Category Filter Bar */}
            <div className="filter-bar">
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                className="input-glass"
                placeholder="🔍 Rechercher un exercice par nom..."
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                style={{ textAlign: 'left' }}
              />
            </div>

            {/* Exercise List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {filteredExercises.map((ex) => (
                <div
                  key={ex.id}
                  className="glass-panel exercise-card"
                  style={{ cursor: 'pointer', transition: 'transform 0.2s', padding: '1.25rem' }}
                  onClick={() => setSelectedExerciseIdForModal(ex.id)}
                >
                  <div className="flex-between">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.35rem' }}>
                        {ex.name}
                      </div>
                      <span className="badge-category">{ex.category || 'Général'}</span>
                    </div>
                    <span style={{ fontSize: '1.25rem', color: 'var(--accent-orange)' }}>📈</span>
                  </div>
                </div>
              ))}
            </div>

            {filteredExercises.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
                Aucun exercice trouvé correspondant à vos critères.
              </p>
            )}
          </div>
        )}

        {/* ================= TAB 6: PROFILE ================= */}
        {activeTab === 'profile' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Votre Profil</h1>
                <p>Gérez vos mensurations, vos préférences d'entraînement et vos options.</p>
              </div>
              <button className="btn-secondary" onClick={handleLogout}>
                🚪 Déconnexion
              </button>
            </div>

            <div className="glass-panel" style={{ maxWidth: '600px' }}>
              <form onSubmit={saveProfile}>
                <div className="form-group">
                  <label>Email du compte</label>
                  <input type="email" value={profile.user?.email || ''} readOnly disabled style={{ opacity: 0.7 }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Taille (cm)</label>
                    <input
                      type="number"
                      className="input-glass"
                      value={profile.height || ''}
                      onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Poids corporel (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input-glass"
                      value={profile.weight || ''}
                      onChange={(e) => setProfile({ ...profile, weight: e.target.value })}
                    />
                  </div>
                </div>

                {bmi && (
                  <div className="highlight-box" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Indice de Masse Corporelle (IMC)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                      {bmi} kg/m²{' '}
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        {bmi < 18.5
                          ? '(Insuffisance pondérale)'
                          : bmi < 25
                          ? '(Corpulence normale)'
                          : bmi < 30
                          ? '(Surpoids)'
                          : '(Obésité)'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoRestEnabled}
                      onChange={(e) => setAutoRestEnabled(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <span>Démarrer automatiquement le chronomètre de repos après chaque série validée (✓)</span>
                  </label>
                </div>

                <button type="submit" className="btn-neon" style={{ width: '100%' }}>
                  Enregistrer les modifications
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="mobile-nav">{renderNavItems(true)}</nav>

      {/* Modals */}
      <PlateCalculatorModal
        isOpen={isPlateCalcOpen}
        onClose={() => setIsPlateCalcOpen(false)}
        defaultWeight={plateCalcDefaultWeight}
      />

      <ExerciseDetailModal
        exerciseId={selectedExerciseIdForModal}
        onClose={() => setSelectedExerciseIdForModal(null)}
        isWorkoutActive={!!activeSessionId}
        onAddToWorkout={(ex) => addExerciseToSession(ex)}
      />

      <AddExerciseModal
        isOpen={isAddExerciseOpen}
        onClose={() => setIsAddExerciseOpen(false)}
        onSuccess={(newEx) => {
          setExercises([...exercises, newEx]);
          showToast(`Exercice "${newEx.name}" créé avec succès !`);
        }}
      />

      <RoutineModal
        isOpen={isRoutineModalOpen}
        onClose={() => setIsRoutineModalOpen(false)}
        exercises={exercises}
        onSuccess={(newRoutine) => {
          setRoutines([...routines, newRoutine]);
          showToast(`Programme "${newRoutine.name}" enregistré !`);
        }}
      />
    </div>
  );
}

export default App;
