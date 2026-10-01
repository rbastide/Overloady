import React, { useState, useEffect } from 'react';
import api from './api';
import './App.css';
import './shell.css';
import './components.css';
import { RestTimer } from './components/RestTimer';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { AddExerciseModal } from './components/AddExerciseModal';
import { RoutineModal } from './components/RoutineModal';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { WarmupModal } from './components/WarmupModal';
import { AnalyticsView } from './components/AnalyticsView';
import { TestWeekModal } from './components/TestWeekModal';
import { Navigation, type AppTab } from './components/Navigation';
import { Icon } from './components/Icons';
import { CoachChat, type CoachWorkout } from './components/CoachChat';

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

// The library holds ~900 exercises (wger import): cards are rendered in pages.
const LIBRARY_PAGE_SIZE = 60;
// Programs shown as quick-launch buttons on the dashboard welcome card
// (phones only display the first HERO_PROGRAMS_MOBILE, see .hero-program in shell.css).
const HERO_PROGRAMS_MAX = 6;
const HERO_PROGRAMS_MOBILE = 3;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [signupGoal, setSignupGoal] = useState<'FORCE' | 'BODYBUILDING' | 'ENDURANCE'>('BODYBUILDING');
  const [authError, setAuthError] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

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

  // Test Week Calibration State
  const [testWeekStatus, setTestWeekStatus] = useState<any>(null);
  const [isTestWeekModalOpen, setIsTestWeekModalOpen] = useState<boolean>(false);
  const [isStartingTestStep, setIsStartingTestStep] = useState<boolean>(false);

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
  const [plateCalcContext, setPlateCalcContext] = useState<{ exerciseName: string | null; weight?: number; reps?: number }>({
    exerciseName: null,
  });
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
  const [libraryLimit, setLibraryLimit] = useState(LIBRARY_PAGE_SIZE);

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
      const [profileRes, exercisesRes, historyRes, routinesRes, statsRes, recRes, testWeekRes] = await Promise.all([
        api.get('/profile').catch(() => ({ data: {} })),
        api.get('/exercises').catch(() => ({ data: [] })),
        api.get('/workout/history').catch(() => ({ data: [] })),
        api.get('/routines').catch(() => ({ data: [] })),
        api.get('/workout/dashboard-stats').catch(() => ({ data: {} })),
        api.get('/workout/next-recommendation').catch(() => ({ data: null })),
        api.get('/workout/test-week').catch(() => ({ data: null })),
      ]);
      setProfile(profileRes.data);
      setExercises(exercisesRes.data);
      setHistory(historyRes.data);
      setRoutines(routinesRes.data);
      setDashboardStats(statsRes.data);
      setNextRecommendation(recRes.data);
      setTestWeekStatus(testWeekRes.data);
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
    setIsAuthLoading(true);
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const payload = isLoginMode
        ? { username, password }
        : { username, password, goal: signupGoal };
      const res = await api.post(endpoint, payload);
      localStorage.setItem('token', res.data.access_token);
      setIsAuthenticated(true);
      showToast(isLoginMode ? 'Connexion réussie !' : 'Compte créé avec succès ! Bienvenue sur Overloady.');
    } catch (err: any) {
      const message = err.response?.data?.message;
      setAuthError(Array.isArray(message) ? message[0] : message || "Échec de l'authentification");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const switchAuthMode = (loginMode: boolean) => {
    setIsLoginMode(loginMode);
    setAuthError('');
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
  // Also used by the coach chat, which passes its own session.
  const startRecommendedWorkout = async (rec: any = nextRecommendation) => {
    if (!rec) return;
    setIsStartingRec(true);
    try {
      const res = await api.post('/workout/start-recommended', { customRec: rec });
      setActiveSessionId(res.data.id);
      setActiveRoutineName(rec.title);
      setSessionNotes(res.data.notes || `Séance Recommandée : ${rec.title}`);
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      const prefilledExercises: ActiveExercise[] = (res.data.exercises || []).map((exLog: any, idx: number) => {
        const matchingRecEx =
          rec.exercises?.[idx] || rec.exercises?.find((re: any) => re.exerciseId === exLog.exerciseId);
        return {
          exerciseId: exLog.exerciseId,
          name: exLog.exercise?.name || matchingRecEx?.name || 'Exercice',
          category: exLog.exercise?.category || matchingRecEx?.category,
          progressiveTarget:
            matchingRecEx?.targetAdvice ||
            (rec.goalDetails ? `${rec.goalDetails.label || ''} : ${rec.goalDetails.repTarget || ''}` : undefined),
          sets: (exLog.sets || []).map((s: any) => ({
            weight: s.weight,
            reps: s.reps,
            completed: false,
          })),
        };
      });

      setWorkout(prefilledExercises);
      setActiveTab('logger');
      showToast(`Séance "${rec.title}" démarrée ! Bon entraînement !`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || "Impossible de démarrer la séance recommandée", 'error');
    } finally {
      setIsStartingRec(false);
    }
  };

  // Routines only store the exercise list: sets and loads come back from progressive overload.
  const saveCoachWorkoutAsRoutine = async (coachWorkout: CoachWorkout) => {
    try {
      const exerciseIds = Array.from(new Set(coachWorkout.exercises.map((ex) => ex.exerciseId)));
      await api.post('/routines', { name: coachWorkout.title, exerciseIds });
      const routinesRes = await api.get('/routines');
      setRoutines(routinesRes.data);
      showToast(`Programme "${coachWorkout.title}" enregistré !`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || "Impossible d'enregistrer le programme", 'error');
    }
  };

  // Start Test Week Calibration Session
  const handleStartTestWeekSession = async (step: number) => {
    if (activeSessionId) {
      showToast('Une séance est déjà en cours ! Terminez-la avant d\'en lancer une nouvelle.', 'error');
      return;
    }
    setIsStartingTestStep(true);
    try {
      const res = await api.post(`/workout/test-week/start/${step}`);
      const session = res.data;
      setActiveSessionId(session.id);
      setActiveRoutineName(`Semaine Test (Étape ${step}/3)`);
      setSessionNotes(session.notes || `[SEMAINE_TEST_${step}]`);
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      const loadedWorkout: ActiveExercise[] = (session.exercises || []).map((exLog: any) => ({
        exerciseId: exLog.exerciseId,
        name: exLog.exercise?.name || 'Exercice Test',
        category: exLog.exercise?.category,
        progressiveTarget: '🎯 Série Test : Notez votre charge maximale propre (RPE 8-9)',
        sets: (exLog.sets || []).map((s: any) => ({
          reps: s.reps || 10,
          weight: s.weight || 20,
          completed: false,
        })),
      }));

      setWorkout(loadedWorkout);
      setIsTestWeekModalOpen(false);
      setActiveTab('logger');
      showToast(`Séance Test ${step}/3 lancée ! Donnez le maximum avec une technique propre.`, 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Erreur lors du démarrage du test', 'error');
    } finally {
      setIsStartingTestStep(false);
    }
  };

  const handleSkipTestWeek = async () => {
    if (!window.confirm('Voulez-vous passer la semaine test et activer directement le Coach IA ?')) return;
    try {
      await api.post('/workout/test-week/skip');
      showToast('Semaine de test validée ! Le Coach IA est activé.', 'success');
      setIsTestWeekModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('Erreur lors de la validation', 'error');
    }
  };

  const handleResetTestWeek = async () => {
    if (!window.confirm('Voulez-vous réinitialiser votre semaine de test pour relancer une calibration ?')) return;
    try {
      await api.post('/workout/test-week/reset');
      showToast('Semaine de test réinitialisée. Prêt pour une nouvelle calibration !', 'info');
      setIsTestWeekModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('Erreur lors de la réinitialisation', 'error');
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
      const anyCompletedExplicitly = workout.some((ex) => ex.sets.some((s) => s.completed));
      const exercisesPayload = workout.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.map((s) => ({
          reps: Number(s.reps) || 0,
          weight: Number(s.weight) || 0,
          completed: anyCompletedExplicitly
            ? Boolean(s.completed)
            : Number(s.weight) > 0 && Number(s.reps) > 0,
        })),
      }));

      await api.post('/workout/finish', {
        sessionId: activeSessionId,
        rpe: sessionRpe,
        notes: sessionNotes,
        exercises: exercisesPayload,
      });

      showToast('Séance enregistrée avec succès ! 💪 Vos charges et volume sont synchronisés.', 'success');
      setActiveSessionId(null);
      setActiveRoutineName(null);
      setWorkout([]);
      setWorkoutStartTime(null);
      setShowRestTimer(false);
      setActiveTab('history');
      await fetchData();
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

  // Open the load calculator, optionally on an exercise of the session and its first set
  const openPlateCalculator = (exercise?: ActiveExercise) => {
    const firstSet = exercise?.sets[0];
    setPlateCalcContext({
      exerciseName: exercise?.name || null,
      // An empty set falls back to the calculator's own default for the movement.
      weight: Number(firstSet?.weight) > 0 ? Number(firstSet?.weight) : undefined,
      reps: firstSet && Number(firstSet.reps) > 0 ? Number(firstSet.reps) : undefined,
    });
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

  // Legacy accounts use their former email as identifier
  const displayName = profile.user?.username?.split('@')[0] || 'Athlète';

  const allCategories = ['Tous', ...Array.from(new Set(exercises.map((e) => e.category || 'Général')))];

  // Calculate BMI
  const heightM = profile.height ? profile.height / 100 : 0;
  const bmi = heightM > 0 && profile.weight ? Math.round((profile.weight / (heightM * heightM)) * 10) / 10 : null;

  // Render Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="auth-shell">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        <section className="auth-hero">
          <div className="brand-group auth-brand">
            <div className="brand-bolt">
              <Icon name="bolt" size={18} strokeWidth={2.4} />
            </div>
            <div className="brand-title">
              OVERLOADY
              <span className="brand-tag">PRO</span>
            </div>
          </div>

          <div className="auth-hero-body">
            <span className="auth-eyebrow">Surcharge progressive</span>
            <h1 className="auth-headline">
              Chaque séance,<br />
              <span>un cran plus loin.</span>
            </h1>
            <p className="auth-hero-text">
              Suivez vos charges, laissez le coach IA calculer la prochaine étape et regardez vos records tomber.
            </p>

            <div className="auth-progress-chart" aria-hidden="true">
              {[38, 46, 44, 55, 61, 58, 70, 78, 84, 96].map((h, i) => (
                <div key={i} className="auth-progress-bar" style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
              ))}
            </div>

            <ul className="auth-features">
              <li><span className="auth-feature-dot" />Charges cibles calculées automatiquement</li>
              <li><span className="auth-feature-dot" />Programmes adaptés à votre objectif</li>
              <li><span className="auth-feature-dot" />Records et progression en un coup d'œil</li>
            </ul>
          </div>
        </section>

        <main className="auth-panel">
          <div className="auth-card">
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={isLoginMode}
                className={isLoginMode ? 'active' : ''}
                onClick={() => switchAuthMode(true)}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLoginMode}
                className={!isLoginMode ? 'active' : ''}
                onClick={() => switchAuthMode(false)}
              >
                Inscription
              </button>
            </div>

            <div className="auth-card-header">
              <h2>{isLoginMode ? 'Bon retour 👋' : 'Créer un compte'}</h2>
              <p>
                {isLoginMode
                  ? 'Connectez-vous pour reprendre votre progression.'
                  : "Choisissez un identifiant et votre objectif, on s'occupe du reste."}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="auth-username">Identifiant</label>
                <div className="auth-input-wrap">
                  <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                  </svg>
                  <input
                    id="auth-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex. alex_lifts"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
                {!isLoginMode && (
                  <span className="auth-hint">3 à 24 caractères : lettres, chiffres, « . », « _ » ou « - ».</span>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Mot de passe</label>
                <div className="auth-input-wrap">
                  <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                    minLength={isLoginMode ? undefined : 6}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {!isLoginMode && <span className="auth-hint">6 caractères minimum.</span>}
              </div>

              {!isLoginMode && (
                <div className="auth-field">
                  <label>Votre objectif</label>
                  <div className="auth-goal-grid">
                    {GOAL_OPTIONS.map((g) => (
                      <button
                        type="button"
                        key={g.id}
                        className={`auth-goal-option ${signupGoal === g.id ? 'selected' : ''}`}
                        onClick={() => setSignupGoal(g.id as any)}
                      >
                        <span className="auth-goal-icon">{g.icon}</span>
                        <span className="auth-goal-name">{g.name.replace(/ \(.*\)/, '')}</span>
                        <span className="auth-goal-badge">{g.badge.split(' • ')[0]}</span>
                      </button>
                    ))}
                  </div>
                  <span className="auth-hint">
                    {GOAL_OPTIONS.find((g) => g.id === signupGoal)?.desc}
                  </span>
                </div>
              )}

              {authError && (
                <div className="auth-error" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <span>{authError}</span>
                </div>
              )}

              <button type="submit" className="btn-neon auth-submit" disabled={isAuthLoading}>
                {isAuthLoading && <span className="auth-spinner" aria-hidden="true" />}
                {isLoginMode ? 'Se connecter' : 'Créer mon compte'}
                {!isAuthLoading && <span aria-hidden="true">→</span>}
              </button>
            </form>

            <p className="auth-switch">
              {isLoginMode ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
              <button type="button" onClick={() => switchAuthMode(!isLoginMode)}>
                {isLoginMode ? 'Créer un compte' : 'Se connecter'}
              </button>
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Navigation
        activeTab={activeTab}
        onNavigate={setActiveTab}
        hasActiveSession={!!activeSessionId}
        displayName={displayName}
        goal={profile.goal}
        testWeekStatus={testWeekStatus}
        onOpenTestWeek={() => setIsTestWeekModalOpen(true)}
        onOpenPlateCalc={() => openPlateCalculator()}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* ================= TAB 1: BENTO DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Protocole Semaine Test Athlète */}
            {testWeekStatus && !testWeekStatus.testWeekCompleted && (
              <div className="test-week-banner">
                <div className="test-week-banner-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>🧪</span>
                    <span className="test-badge-glow">
                      SEMAINE DE TEST ATHLÈTE • {testWeekStatus.testWeekProgress}/{testWeekStatus.totalSteps} COMPLÉTÉ
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      className="btn-glass"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                      onClick={() => setIsTestWeekModalOpen(true)}
                    >
                      📋 Voir le protocole des tests
                    </button>
                    <button
                      className="btn-text-danger"
                      onClick={handleSkipTestWeek}
                      title="Passer directement au Coach IA"
                    >
                      Passer ⏩
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>
                    Phase d'Évaluation Initiale (1 Semaine)
                  </h2>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Calibrez vos charges de travail de référence avant de lancer l'IA
                  </span>
                </div>

                {/* 3 Step Cards */}
                <div className="test-week-steps-row">
                  {testWeekStatus.sessions?.map((sess: any) => {
                    const isCompleted = sess.status === 'completed';
                    const isCurrent = sess.status === 'current';
                    return (
                      <div
                        key={sess.step}
                        className={`test-step-mini-card ${sess.status}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setIsTestWeekModalOpen(true)}
                      >
                        <div className="step-card-header">
                          <span style={{ color: isCompleted ? 'var(--accent-emerald)' : isCurrent ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                            {isCompleted ? '✓ VALIDÉ' : isCurrent ? '⚡ EN COURS' : '🔒 À VENIR'}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{sess.dayName}</span>
                        </div>
                        <div className="step-card-title">{sess.name}</div>
                        <div className="step-card-focus">{sess.focus}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Action button */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn-volt"
                    onClick={() => handleStartTestWeekSession(testWeekStatus.currentStep)}
                    disabled={isStartingTestStep || !!activeSessionId}
                  >
                    {isStartingTestStep
                      ? 'Lancement...'
                      : activeSessionId
                      ? '⚠️ Séance déjà en cours'
                      : `▶ Lancer la Séance Test ${testWeekStatus.currentStep} (${testWeekStatus.sessions?.[testWeekStatus.currentStep - 1]?.name || 'Test'})`}
                  </button>
                  <button
                    className="btn-glass"
                    onClick={() => setIsTestWeekModalOpen(true)}
                  >
                    Détail des 3 séances
                  </button>
                </div>
              </div>
            )}

            <div className="bento-grid">
              {/* Bento 1: compact welcome + program quick launch (grows with the number of programs) */}
              <div className="bento-hero">
                <div className="hero-top">
                  <span className="badge-pill">⚡ PROGRAMME {profile.goal || 'BODYBUILDING'}</span>
                  {testWeekStatus?.testWeekCompleted && (
                    <span
                      className="badge-pill"
                      style={{ color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.4)', cursor: 'pointer' }}
                      onClick={() => setIsTestWeekModalOpen(true)}
                    >
                      ✓ PROFIL CALIBRÉ
                    </span>
                  )}
                  <span className="hero-date">
                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
                <h1>Bonjour, {displayName} 👋</h1>

                <div className="hero-programs">
                  <div className="hero-programs-head">
                    <span>Vos programmes ({routines.length})</span>
                    {routines.length > HERO_PROGRAMS_MOBILE && (
                      <button className="link-btn" onClick={() => setActiveTab('routines')}>
                        Tout voir
                      </button>
                    )}
                  </div>
                  {routines.length > 0 ? (
                    <div className="hero-program-list">
                      {routines.slice(0, HERO_PROGRAMS_MAX).map((rt) => (
                        <button key={rt.id} className="hero-program" onClick={() => startRoutineWorkout(rt)} title={`Lancer ${rt.name}`}>
                          <span className="hero-program-play">▶</span>
                          <span className="hero-program-name">{rt.name}</span>
                          <span className="hero-program-meta">{rt.exercises?.length || 0} exos</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="hero-programs-empty">Aucun programme pour l'instant (ex : Push / Pull / Legs).</p>
                  )}
                </div>

                <div className="bento-actions">
                  <button className="btn-volt" onClick={startNewWorkout}>
                    + Séance libre
                  </button>
                  <button className="btn-glass" onClick={() => setIsRoutineModalOpen(true)}>
                    + Nouveau programme
                  </button>
                </div>
              </div>

              {/* Bento 2: AI Coach Recommended Workout */}
              {nextRecommendation ? (
                <div className={`bento-ai-rec goal-${nextRecommendation.goal?.toLowerCase()}`}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                      <div
                        className="bento-badge"
                        style={{
                          color: nextRecommendation.isTestWeek ? 'var(--accent-cyan)' : 'var(--accent-volt)',
                          borderColor: nextRecommendation.isTestWeek ? 'rgba(0, 240, 255, 0.4)' : 'rgba(204, 255, 0, 0.35)',
                          margin: 0,
                        }}
                      >
                        <span
                          className="ai-dot-pulse"
                          style={{ background: nextRecommendation.isTestWeek ? 'var(--accent-cyan)' : 'var(--accent-volt)' }}
                        ></span>
                        <span>
                          {nextRecommendation.isTestWeek
                            ? `🧪 SEMAINE TEST • Étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps}`
                            : nextRecommendation.aiGenerated
                            ? '⚡ Coach IA Connecté'
                            : '🎯 Surcharge Calculée'}{' '}
                          • {nextRecommendation.goalDetails?.label || nextRecommendation.goal}
                        </span>
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
                        onClick={() => startRecommendedWorkout()}
                        disabled={isStartingRec || !!activeSessionId || isRegeneratingAi}
                      >
                        {isStartingRec
                          ? 'Lancement en cours...'
                          : activeSessionId
                          ? '⚠️ Séance déjà en cours'
                          : nextRecommendation.isTestWeek
                          ? `▶ Démarrer le Test (Étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps})`
                          : '▶ Démarrer cette séance'}
                      </button>
                      {nextRecommendation.isTestWeek ? (
                        <button
                          className="btn-glass"
                          onClick={() => setIsTestWeekModalOpen(true)}
                          title="Consulter le protocole de la semaine de test"
                        >
                          📋 Détail tests
                        </button>
                      ) : (
                        <button
                          className="btn-ai-regenerate"
                          onClick={regenerateAiRecommendation}
                          disabled={isRegeneratingAi || !!activeSessionId}
                          title="Demander une autre séance générée par l'IA"
                        >
                          <span className={isRegeneratingAi ? 'spin-icon' : ''}>🔄</span>
                          <span>{isRegeneratingAi ? 'Génération IA...' : 'Régénérer IA'}</span>
                        </button>
                      )}
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
              <div className="bento-stats">
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
            </div>

          </div>
        )}

        {/* ================= TAB 2: WORKOUT LOGGER ================= */}
        {activeTab === 'logger' && (
          <div>
            <div className={`header flex-between${activeSessionId ? '' : ' logger-header-idle'}`}>
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
                {/* Active Test Week Session Notice */}
                {sessionNotes?.includes('[SEMAINE_TEST_') && (
                  <div className="active-session-test-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>🧪</span>
                      <div>
                        <strong style={{ color: 'var(--accent-cyan)', fontSize: '0.92rem', display: 'block' }}>
                          SÉANCE DU PROTOCOLE DE CALIBRATION ATHLÈTE
                        </strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Donnez le maximum avec une technique propre. Vos charges réelles et répétitions sont mesurées pour calibrer vos futurs cycles IA.
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-glass"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', whiteSpace: 'nowrap' }}
                      onClick={() => setIsTestWeekModalOpen(true)}
                    >
                      Protocole
                    </button>
                  </div>
                )}

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
                          title="Calculatrice de charge"
                          onClick={() => openPlateCalculator(exercise)}
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

                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.6rem' }}>
                      <button className="btn-small" onClick={() => addSet(eIndex)}>
                        + Ajouter une série
                      </button>
                      <button
                        className="btn-small"
                        style={{ color: 'var(--accent-volt)', borderColor: 'rgba(204, 255, 0, 0.3)' }}
                        onClick={() => {
                          setWorkout((prev) => {
                            const copy = [...prev];
                            copy[eIndex] = {
                              ...copy[eIndex],
                              sets: copy[eIndex].sets.map((s) => ({ ...s, completed: true })),
                            };
                            return copy;
                          });
                          showToast(`Toutes les séries de "${exercise.name}" ont été validées !`, 'info');
                        }}
                      >
                        ✓ Tout valider
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
                      {allCategories.slice(1).map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {exercises
                            .filter((ex) => (ex.category || 'Général') === cat)
                            .map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                {ex.name}
                              </option>
                            ))}
                        </optgroup>
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
              <div className="logger-idle">
                <CoachChat
                  onStartWorkout={(coachWorkout) => startRecommendedWorkout(coachWorkout)}
                  onSaveRoutine={saveCoachWorkoutAsRoutine}
                  onError={(text) => showToast(text, 'error')}
                />
                <div className="glass-panel logger-idle-start">
                  <span className="logger-idle-emoji">🏋️‍♂️</span>
                  <h2>Aucun entraînement en cours</h2>
                  <p>Démarre une séance libre, lance un de tes programmes ou demande une séance au coach.</p>
                  <div className="logger-idle-actions">
                    <button className="btn-neon" onClick={startNewWorkout}>
                      Démarrer une séance libre
                    </button>
                    <button className="btn-secondary" onClick={() => setActiveTab('routines')}>
                      Choisir un programme
                    </button>
                  </div>
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
                  if (s.completed || (s.weight > 0 && s.reps > 0)) {
                    sessionVolume += (s.weight || 0) * (s.reps || 0);
                  }
                });
              });

              const sessionTitle = session.notes?.startsWith('Séance Recommandée : ')
                ? session.notes.replace('Séance Recommandée : ', '⚡ ')
                : session.notes?.startsWith('Programme: ')
                ? `📋 ${session.notes.replace('Programme: ', '')}`
                : session.routine
                ? session.routine.name
                : 'Séance Libre';

              return (
                <div key={session.id} className="glass-panel" style={{ marginBottom: '1.25rem' }}>
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h3 style={{ color: 'var(--accent-volt)', margin: 0 }}>
                        {sessionTitle} —{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>
                          {new Date(session.startedAt).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}
                        </span>
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
                  onClick={() => {
                    setSelectedCategory(cat);
                    setLibraryLimit(LIBRARY_PAGE_SIZE);
                  }}
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
                onChange={(e) => {
                  setExerciseSearch(e.target.value);
                  setLibraryLimit(LIBRARY_PAGE_SIZE);
                }}
                style={{ textAlign: 'left' }}
              />
            </div>

            {/* Exercise List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {filteredExercises.slice(0, libraryLimit).map((ex) => (
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

            {filteredExercises.length > libraryLimit && (
              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button className="btn-secondary" onClick={() => setLibraryLimit((l) => l + LIBRARY_PAGE_SIZE)}>
                  Afficher plus ({filteredExercises.length - libraryLimit} restants)
                </button>
              </div>
            )}

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
                  <label>Identifiant du compte</label>
                  <input type="text" value={profile.user?.username || ''} readOnly disabled style={{ opacity: 0.7 }} />
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

      {/* Modals */}
      <PlateCalculatorModal
        isOpen={isPlateCalcOpen}
        onClose={() => setIsPlateCalcOpen(false)}
        exercises={exercises}
        initialExerciseName={plateCalcContext.exerciseName}
        defaultWeight={plateCalcContext.weight}
        defaultReps={plateCalcContext.reps}
        bodyWeight={Number(profile.weight) || undefined}
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

      <TestWeekModal
        isOpen={isTestWeekModalOpen}
        onClose={() => setIsTestWeekModalOpen(false)}
        status={testWeekStatus}
        onStartSession={handleStartTestWeekSession}
        onSkipTestWeek={handleSkipTestWeek}
        onResetTestWeek={handleResetTestWeek}
        isStarting={isStartingTestStep}
      />
    </div>
  );
}

export default App;
