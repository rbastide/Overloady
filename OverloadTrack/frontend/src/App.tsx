import React, { useState, useEffect } from 'react';
import api from './api';
import './App.css';
import { RestTimer } from './components/RestTimer';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { AddExerciseModal } from './components/AddExerciseModal';
import { RoutineModal } from './components/RoutineModal';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { WarmupModal } from './components/WarmupModal';
import { AnalyticsView } from './components/AnalyticsView';

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

const GOAL_OPTIONS = [
  {
    id: 'FORCE',
    name: 'Force & Puissance',
    icon: '🔴',
    badge: '3-5 reps • 80-87% 1RM',
    rest: 'Repos 3-4 min',
    desc: 'Charges maximales sur les mouvements polyarticulaires pour bâtir une force pure sans compromis.',
    className: 'goal-force',
  },
  {
    id: 'BODYBUILDING',
    name: 'Bodybuilding (Hypertrophie)',
    icon: '🟣',
    badge: '8-12 reps • 70-75% 1RM',
    rest: 'Repos 75-90s',
    desc: 'Volume optimisé pour stimuler la croissance musculaire, le recrutement et la congestion.',
    className: 'goal-bodybuilding',
  },
  {
    id: 'ENDURANCE',
    name: 'Endurance Musculaire',
    icon: '🟢',
    badge: '15-20 reps • 50-60% 1RM',
    rest: 'Repos 30-45s',
    desc: 'Séries longues et intensité métabolique pour développer votre résistance et votre tonicité.',
    className: 'goal-endurance',
  },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupGoal, setSignupGoal] = useState<'FORCE' | 'BODYBUILDING' | 'ENDURANCE'>('BODYBUILDING');
  const [authError, setAuthError] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logger' | 'analytics' | 'routines' | 'history' | 'exercises' | 'profile'>('dashboard');

  // Core Data
  const [profile, setProfile] = useState<any>({});
  const [exercises, setExercises] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>({});
  const [nextRecommendation, setNextRecommendation] = useState<any>(null);
  const [isStartingRec, setIsStartingRec] = useState<boolean>(false);
  const [isRegeneratingAi, setIsRegeneratingAi] = useState<boolean>(false);
  const [showAiExercisesPreview, setShowAiExercisesPreview] = useState<boolean>(true);

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

  // Warmup Modal state
  const [warmupModalData, setWarmupModalData] = useState<{
    isOpen: boolean;
    exerciseIndex: number;
    exerciseName: string;
    targetWeight: number;
  }>({
    isOpen: false,
    exerciseIndex: -1,
    exerciseName: '',
    targetWeight: 80,
  });

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
      const [profileRes, exercisesRes, historyRes, routinesRes, statsRes, recRes] = await Promise.all([
        api.get('/profile').catch(() => ({ data: {} })),
        api.get('/exercises').catch(() => ({ data: [] })),
        api.get('/workout/history').catch(() => ({ data: [] })),
        api.get('/routines').catch(() => ({ data: [] })),
        api.get('/workout/dashboard-stats').catch(() => ({ data: {} })),
        api.get('/workout/next-recommendation').catch(() => ({ data: null })),
      ]);
      setProfile(profileRes.data);
      setExercises(exercisesRes.data);
      setHistory(historyRes.data);
      setRoutines(routinesRes.data);
      setDashboardStats(statsRes.data);
      setNextRecommendation(recRes.data);
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
      const payload = isLoginMode
        ? { email, password }
        : { email, password, goal: signupGoal };
      const res = await api.post(endpoint, payload);
      localStorage.setItem('token', res.data.access_token);
      setIsAuthenticated(true);
      showToast(isLoginMode ? 'Connexion réussie !' : 'Compte créé avec succès ! Bienvenue sur Overloady.');
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

  // Regenerate with AI Coach
  const regenerateAiRecommendation = async () => {
    setIsRegeneratingAi(true);
    try {
      showToast('⚡ Le Coach IA conçoit une nouvelle séance optimisée...', 'info');
      const res = await api.post('/workout/regenerate-recommendation');
      setNextRecommendation(res.data);
      if (res.data?.aiGenerated) {
        showToast(`✨ Séance "${res.data.title}" générée par le Coach IA !`, 'success');
      } else {
        showToast(`Séance réajustée selon votre surcharge progressive !`, 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Erreur lors de la consultation du Coach IA', 'error');
    } finally {
      setIsRegeneratingAi(false);
    }
  };

  // Start Adaptive Recommended Workout
  const startRecommendedWorkout = async () => {
    if (!nextRecommendation) return;
    setIsStartingRec(true);
    try {
      const res = await api.post('/workout/start-recommended', { customRec: nextRecommendation });
      setActiveSessionId(res.data.id);
      setActiveRoutineName(nextRecommendation.title);
      setSessionNotes(res.data.notes || `Séance Recommandée : ${nextRecommendation.title}`);
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      const prefilledExercises: ActiveExercise[] = (res.data.exercises || []).map((exLog: any, idx: number) => {
        const matchingRecEx =
          nextRecommendation.exercises?.[idx] ||
          nextRecommendation.exercises?.find((re: any) => re.exerciseId === exLog.exerciseId);
        return {
          exerciseId: exLog.exerciseId,
          name: exLog.exercise?.name || matchingRecEx?.name || 'Exercice',
          category: exLog.exercise?.category || matchingRecEx?.category,
          progressiveTarget:
            matchingRecEx?.targetAdvice ||
            `${nextRecommendation.goalDetails?.label || ''} : ${nextRecommendation.goalDetails?.repTarget || ''}`,
          sets: (exLog.sets || []).map((s: any) => ({
            weight: s.weight,
            reps: s.reps,
            completed: false,
          })),
        };
      });

      setWorkout(prefilledExercises);
      setActiveTab('logger');
      showToast(`Séance "${nextRecommendation.title}" démarrée ! Bon entraînement !`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || "Impossible de démarrer la séance recommandée", 'error');
    } finally {
      setIsStartingRec(false);
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
        goal: profile.goal || 'BODYBUILDING',
      });
      showToast('Profil et programme mis à jour !', 'success');
      const recRes = await api.get('/workout/next-recommendation').catch(() => ({ data: null }));
      if (recRes?.data) {
        setNextRecommendation(recRes.data);
      }
    } catch (err) {
      showToast('Erreur lors de la sauvegarde du profil', 'error');
    }
  };

  // Open Warmup Modal for an exercise in active workout
  const openWarmupForExercise = (eIndex: number) => {
    const ex = workout[eIndex];
    const targetWeight = ex.sets[0]?.weight || 80;
    setWarmupModalData({
      isOpen: true,
      exerciseIndex: eIndex,
      exerciseName: ex.name,
      targetWeight,
    });
  };

  const handleApplyWarmupSets = (warmupSets: Array<{ weight: number; reps: number; completed: boolean }>) => {
    if (warmupModalData.exerciseIndex < 0) return;
    const updated = [...workout];
    const currentSets = updated[warmupModalData.exerciseIndex].sets;
    updated[warmupModalData.exerciseIndex].sets = [...warmupSets, ...currentSets];
    setWorkout(updated);
    showToast("Séries d'échauffement ajoutées à la séance ! 🔥", 'success');
  };

  // Export workout history to CSV
  const exportHistoryCSV = () => {
    if (history.length === 0) {
      showToast('Aucun historique à exporter', 'info');
      return;
    }

    const headers = ['Date', 'Programme', 'RPE', 'Notes', 'Exercice', 'Categorie', 'Serie', 'Poids_kg', 'Reps', 'Valide'];
    const rows: string[] = [headers.join(';')];

    history.forEach((session) => {
      const dateStr = new Date(session.startedAt).toISOString().split('T')[0];
      const routineName = (session.routine?.name || 'Séance libre').replace(/;/g, ',');
      const notes = (session.notes || '').replace(/;/g, ',').replace(/\n/g, ' ');

      (session.exercises || []).forEach((exLog: any) => {
        const exName = (exLog.exercise?.name || 'Exercice').replace(/;/g, ',');
        const cat = (exLog.exercise?.category || 'Général').replace(/;/g, ',');

        (exLog.sets || []).forEach((st: any, idx: number) => {
          rows.push([
            dateStr,
            routineName,
            session.rpe,
            `"${notes}"`,
            exName,
            cat,
            idx + 1,
            st.weight,
            st.reps,
            st.completed ? 'Oui' : 'Non',
          ].join(';'));
        });
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `overloady_historique_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Historique exporté en CSV ! 📥');
  };

  // Share session summary to clipboard
  const shareSession = (session: any) => {
    const dateStr = new Date(session.startedAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const routineName = session.routine?.name || 'Séance Libre';
    let totalVol = 0;
    const lines: string[] = [
      `🏋️ Overloady — ${routineName} (${dateStr})`,
      `⏱️ RPE : ${session.rpe}/10`,
    ];

    if (session.notes) {
      lines.push(`📝 Notes : "${session.notes}"`);
    }

    lines.push('\n💪 Exercices & Performances :');

    (session.exercises || []).forEach((exLog: any) => {
      const setsStr = (exLog.sets || []).map((s: any) => {
        if (s.completed) totalVol += (s.weight || 0) * (s.reps || 0);
        return `${s.weight}kg × ${s.reps}${s.completed ? ' ✓' : ''}`;
      }).join(', ');
      lines.push(`• ${exLog.exercise?.name || 'Exercice'} : ${setsStr}`);
    });

    lines.push(`\n📊 Volume Total Soulevé : ${totalVol.toLocaleString()} kg`);
    lines.push('⚡ Suivi avec Overloady');

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast('Résumé de la séance copié dans le presse-papier ! 📋');
    }).catch(() => {
      showToast('Impossible de copier le résumé', 'error');
    });
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
        <div className={`glass-panel auth-card ${!isLoginMode ? 'auth-card-wide' : ''}`}>
          <div className="logo">
            <span className="logo-bolt">⚡</span>
            <span className="logo-text">OVERLOADY</span>
          </div>
          <p className="subtitle">
            {isLoginMode
              ? 'Heureux de vous revoir ! Préparez votre prochaine surcharge progressive.'
              : "Créez votre profil d'athlète et personnalisez votre programme d'entraînement."}
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

            {!isLoginMode && (
              <div style={{ textAlign: 'left', marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                  🎯 Choisissez votre programme d'entraînement
                </label>
                <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Chaque séance suivante sera automatiquement recommandée pour progresser vers cet objectif :
                </p>

                <div className="goal-selector-grid">
                  {GOAL_OPTIONS.map((g) => (
                    <div
                      key={g.id}
                      className={`goal-card-option ${g.className} ${signupGoal === g.id ? 'selected' : ''}`}
                      onClick={() => setSignupGoal(g.id as any)}
                    >
                      <div className="goal-card-icon">{g.icon}</div>
                      <div className="goal-card-content">
                        <div className="goal-card-title">
                          <span>{g.name}</span>
                          {signupGoal === g.id && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-orange)' }}>● Sélectionné</span>
                          )}
                        </div>
                        <div className="goal-card-desc">{g.desc}</div>
                        <div className="goal-card-specs">
                          {g.badge} | ⏱ {g.rest}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {authError && (
              <div style={{ color: '#ff2a5f', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn-neon" style={{ width: '100%', marginTop: '0.5rem' }}>
              {isLoginMode ? 'Se Connecter' : 'Créer mon compte & Démarrer'}
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

  const renderNavTabs = () => {
    const items = [
      { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
      { id: 'logger', label: 'Séance', icon: '⚡', badge: activeSessionId ? 'En direct' : undefined },
      { id: 'analytics', label: 'Analytique & PRs', icon: '📈' },
      { id: 'routines', label: 'Programmes', icon: '📋' },
      { id: 'history', label: 'Historique', icon: '📅' },
      { id: 'exercises', label: 'Exercices', icon: '💪' },
      { id: 'profile', label: 'Profil', icon: '👤' },
    ];

    return items.map((item) => (
      <button
        key={item.id}
        className={`nav-tab-btn ${activeTab === item.id ? 'active' : ''}`}
        onClick={() => setActiveTab(item.id as any)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {item.badge && <span className="tab-badge">{item.badge}</span>}
      </button>
    ));
  };

  const renderMobileNav = () => {
    const items = [
      { id: 'dashboard', label: 'Accueil', icon: '📊' },
      { id: 'logger', label: 'Séance', icon: '⚡' },
      { id: 'analytics', label: 'PRs', icon: '📈' },
      { id: 'routines', label: 'Plans', icon: '📋' },
      { id: 'history', label: 'Historique', icon: '📅' },
      { id: 'exercises', label: 'Exercices', icon: '💪' },
      { id: 'profile', label: 'Profil', icon: '👤' },
    ];

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
  };

  return (
    <div className="app-container">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Floating Island Navbar */}
      <div className="top-navbar-wrapper">
        <header className="top-navbar">
          <div className="brand-group" onClick={() => setActiveTab('dashboard')}>
            <div className="brand-bolt">⚡</div>
            <div className="brand-title">
              OVERLOADY
              <span className="brand-tag">PRO</span>
            </div>
          </div>

          <nav className="nav-island">
            {renderNavTabs()}
          </nav>

          <div className="navbar-actions">
            <button className="btn-gym-tools" onClick={() => setIsPlateCalcOpen(true)}>
              🧮 Disques / 1RM
            </button>
            <div className="user-pill-btn" onClick={() => setActiveTab('profile')}>
              <div className="user-avatar-mini">
                {(profile.user?.email?.[0] || 'A').toUpperCase()}
              </div>
              <span>{profile.user?.email?.split('@')[0] || 'Athlète'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-volt)' }}>
                {profile.goal === 'FORCE' ? '🔴' : profile.goal === 'ENDURANCE' ? '🟢' : '🟣'}
              </span>
            </div>
            <button className="btn-logout-icon" title="Déconnexion" onClick={handleLogout}>
              🚪
            </button>
          </div>
        </header>
      </div>

      {/* Main Content Area */}
      <main className="main-content">
        {/* ================= TAB 1: BENTO DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="bento-grid">
              {/* Bento 1: Hero Welcome & Quick Launch */}
              <div className="bento-hero">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    <span className="badge-pill">
                      ⚡ PROGRAMME {profile.goal || 'BODYBUILDING'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <h1>Bonjour, {profile.user?.email?.split('@')[0]} 👋</h1>
                  <p className="hero-subtitle">
                    Prêt pour votre prochaine séance ? Votre surcharge progressive est automatiquement calculée et prête à être exécutée.
                  </p>
                </div>

                <div className="bento-actions">
                  <button className="btn-volt" onClick={startNewWorkout}>
                    + Démarrer une séance libre
                  </button>
                  <button className="btn-glass" onClick={() => setIsRoutineModalOpen(true)}>
                    + Créer un programme
                  </button>
                  <button className="btn-glass" onClick={() => setActiveTab('analytics')}>
                    📈 Analytique & Records
                  </button>
                </div>
              </div>

              {/* Bento 2: AI Coach Recommended Workout */}
              {nextRecommendation ? (
                <div className={`bento-ai-rec goal-${nextRecommendation.goal?.toLowerCase()}`}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                      <div className="bento-badge" style={{ color: 'var(--accent-volt)', borderColor: 'rgba(204, 255, 0, 0.35)', margin: 0 }}>
                        <span className="ai-dot-pulse"></span>
                        <span>{nextRecommendation.aiGenerated ? '⚡ Coach IA Connecté' : '🎯 Surcharge Calculée'} • {nextRecommendation.goalDetails?.label || nextRecommendation.goal}</span>
                      </div>
                      {nextRecommendation.aiModel && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {nextRecommendation.aiModel}
                        </span>
                      )}
                    </div>

                    <h2>{nextRecommendation.title}</h2>
                    <p className="rec-text">{nextRecommendation.rationale}</p>

                    <div className="bento-chips-row">
                      <div className="bento-chip">
                        <strong>Focus :</strong> {nextRecommendation.focusMuscle}
                      </div>
                      <div className="bento-chip">
                        <strong>Cible :</strong> {nextRecommendation.goalDetails?.repTarget}
                      </div>
                      <div className="bento-chip">
                        <strong>Repos :</strong> {nextRecommendation.goalDetails?.restTarget}
                      </div>
                    </div>

                    {/* AI Coach Tips */}
                    {nextRecommendation.coachingTips && nextRecommendation.coachingTips.length > 0 && (
                      <div className="ai-tips-container">
                        <div className="ai-tips-title">
                          <span>💡</span>
                          <span>Consignes Clés du Coach IA</span>
                        </div>
                        <ul className="ai-tips-list">
                          {nextRecommendation.coachingTips.map((tip: string, idx: number) => (
                            <li key={idx} className="ai-tip-item">{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* AI Exercises Preview Toggle */}
                    {nextRecommendation.exercises && nextRecommendation.exercises.length > 0 && (
                      <div style={{ marginBottom: '1.25rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            fontWeight: 700,
                            padding: '0.25rem 0',
                          }}
                          onClick={() => setShowAiExercisesPreview((prev) => !prev)}
                        >
                          <span>📋 {nextRecommendation.exercises.length} Exercices Prescrits {showAiExercisesPreview ? '▲' : '▼'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-volt)' }}>
                            {showAiExercisesPreview ? 'Masquer' : 'Voir le détail'}
                          </span>
                        </div>

                        {showAiExercisesPreview && (
                          <div className="ai-exercises-preview">
                            {nextRecommendation.exercises.map((ex: any, idx: number) => (
                              <div key={idx} className="ai-ex-preview-item">
                                <div className="ai-ex-header">
                                  <span className="ai-ex-name">{ex.name}</span>
                                  <span className="ai-ex-badge">{ex.sets?.length || 3} séries</span>
                                </div>
                                {ex.reason && <div className="ai-ex-reason">"{ex.reason}"</div>}
                                {ex.targetAdvice && <div className="ai-ex-advice">🎯 {ex.targetAdvice}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                      <button
                        className="btn-volt"
                        style={{ width: '100%' }}
                        onClick={startRecommendedWorkout}
                        disabled={isStartingRec || !!activeSessionId || isRegeneratingAi}
                      >
                        {isStartingRec
                          ? 'Lancement en cours...'
                          : activeSessionId
                          ? '⚠️ Séance déjà en cours'
                          : '▶ Démarrer cette séance'}
                      </button>
                      <button
                        className="btn-ai-regenerate"
                        onClick={regenerateAiRecommendation}
                        disabled={isRegeneratingAi || !!activeSessionId}
                        title="Demander une autre séance générée par l'IA"
                      >
                        <span className={isRegeneratingAi ? 'spin-icon' : ''}>🔄</span>
                        <span>{isRegeneratingAi ? 'Génération IA...' : 'Régénérer IA'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bento-ai-rec">
                  <div>
                    <div className="bento-badge">
                      <span className="ai-dot-pulse"></span>
                      <span>Coach IA • Prêt</span>
                    </div>
                    <h2>Votre Coach IA s'active...</h2>
                    <p className="rec-text">
                      L'intelligence artificielle est prête à concevoir votre prochaine séance sur-mesure. Cliquez sur Régénérer pour solliciter le coach dès maintenant !
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button
                      className="btn-volt"
                      style={{ flex: 1 }}
                      onClick={regenerateAiRecommendation}
                      disabled={isRegeneratingAi}
                    >
                      <span className={isRegeneratingAi ? 'spin-icon' : ''}>⚡</span>
                      <span>{isRegeneratingAi ? 'Génération en cours...' : "Générer ma séance avec l'IA"}</span>
                    </button>
                    <button className="btn-glass" onClick={startNewWorkout}>
                      + Séance libre
                    </button>
                  </div>
                </div>
              )}

              {/* Bento 3: 4 Stat Tiles */}
              <div className="bento-stat-card">
                <div className="stat-header">
                  <span className="stat-label">Séances (7j)</span>
                  <span className="stat-icon">🔥</span>
                </div>
                <div className="stat-number" style={{ color: 'var(--accent-volt)' }}>
                  {dashboardStats.workoutsThisWeek ?? 0}
                </div>
                <div className="stat-footer">Fréquence d'entraînement</div>
              </div>

              <div className="bento-stat-card">
                <div className="stat-header">
                  <span className="stat-label">Volume total (7j)</span>
                  <span className="stat-icon">⚡</span>
                </div>
                <div className="stat-number" style={{ color: 'var(--accent-cyan)' }}>
                  {dashboardStats.weekVolume ? `${dashboardStats.weekVolume.toLocaleString()}` : '0'}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg</span>
                </div>
                <div className="stat-footer">Tonnage cumulé soulevé</div>
              </div>

              <div className="bento-stat-card">
                <div className="stat-header">
                  <span className="stat-label">Poids corporel</span>
                  <span className="stat-icon">⚖️</span>
                </div>
                <div className="stat-number" style={{ color: 'var(--accent-purple)' }}>
                  {profile.weight || '--'}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg</span>
                </div>
                <div className="stat-footer">Dernière pesée enregistrée</div>
              </div>

              <div className="bento-stat-card">
                <div className="stat-header">
                  <span className="stat-label">Indice IMC</span>
                  <span className="stat-icon">🧬</span>
                </div>
                <div className="stat-number" style={{ color: 'var(--accent-coral)' }}>
                  {bmi || '--'}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    {bmi ? (bmi < 25 ? '(Normal)' : '(Surpoids)') : ''}
                  </span>
                </div>
                <div className="stat-footer">Ratio taille / poids corporel</div>
              </div>
            </div>

            {/* Routines Grid Section */}
            <div style={{ marginTop: '2.5rem', marginBottom: '2rem' }}>
              <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <h2>Vos Programmes d'entraînement ({routines.length})</h2>
                <button
                  className="btn-small"
                  onClick={() => setIsRoutineModalOpen(true)}
                  style={{ color: 'var(--accent-volt)' }}
                >
                  + Nouveau programme
                </button>
              </div>

              {routines.length > 0 ? (
                <div className="routine-grid">
                  {routines.map((rt) => (
                    <div key={rt.id} className="routine-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <h3 style={{ fontSize: '1.25rem' }}>{rt.name}</h3>
                          <span className="badge-pill">{rt.exercises?.length || 0} exercices</span>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                          Routine personnalisée prête à l'emploi
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
                          {(rt.exercises || []).map((ex: any) => (
                            <span key={ex.id} className="badge-category">
                              {ex.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn-volt"
                        style={{ width: '100%', fontSize: '0.9rem' }}
                        onClick={() => startRoutineWorkout(rt)}
                      >
                        ▶ Lancer ce programme
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                    Vous n'avez pas encore créé de programme d'entraînement (ex : Push / Pull / Legs).
                  </p>
                  <button className="btn-volt" onClick={() => setIsRoutineModalOpen(true)}>
                    + Créer mon premier programme
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
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className="btn-small"
                          title="Générer l'échauffement"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#ffaa00' }}
                          onClick={() => openWarmupForExercise(eIndex)}
                        >
                          🔥 Échauffement
                        </button>
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

        {/* ================= TAB: ANALYTICS & PRS ================= */}
        {activeTab === 'analytics' && <AnalyticsView />}

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
            <div className="header flex-between">
              <div>
                <h1>Historique des Entraînements</h1>
                <p>Consultez vos séances passées, le volume soulevé et vos séries validées.</p>
              </div>
              {history.length > 0 && (
                <button className="btn-secondary" onClick={exportHistoryCSV} title="Exporter l'historique au format CSV">
                  📥 Exporter en CSV
                </button>
              )}
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

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        className="btn-small"
                        onClick={() => shareSession(session)}
                        title="Copier le résumé de la séance"
                      >
                        📤 Partager
                      </button>
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

                <div className="form-group" style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    🎯 Programme d'entraînement principal
                  </label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Changer de programme adapte immédiatement les objectifs (charges, répétitions, temps de repos) de vos prochaines séances recommandées :
                  </p>
                  <div className="goal-selector-grid">
                    {GOAL_OPTIONS.map((g) => (
                      <div
                        key={g.id}
                        className={`goal-card-option ${g.className} ${(profile.goal || 'BODYBUILDING') === g.id ? 'selected' : ''}`}
                        onClick={() => setProfile({ ...profile, goal: g.id })}
                      >
                        <div className="goal-card-icon">{g.icon}</div>
                        <div className="goal-card-content">
                          <div className="goal-card-title">
                            <span>{g.name}</span>
                            {(profile.goal || 'BODYBUILDING') === g.id && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--accent-orange)' }}>● Actif</span>
                            )}
                          </div>
                          <div className="goal-card-desc">{g.desc}</div>
                          <div className="goal-card-specs">
                            {g.badge} | ⏱ {g.rest}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

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
      <nav className="mobile-nav">{renderMobileNav()}</nav>

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

      <WarmupModal
        isOpen={warmupModalData.isOpen}
        onClose={() => setWarmupModalData({ ...warmupModalData, isOpen: false })}
        exerciseName={warmupModalData.exerciseName}
        targetWeight={warmupModalData.targetWeight}
        onApplyWarmup={handleApplyWarmupSets}
      />
    </div>
  );
}

export default App;
