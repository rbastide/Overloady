import React, { useState, useEffect, useRef } from 'react';
import api, { hasValidToken, onUnauthorized } from './api';
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
import { Icon, type IconName } from './components/Icons';
import { CoachChat, type CoachWorkout } from './components/CoachChat';
import { ActiveExerciseCard, type ActiveExercise, type ExerciseStats } from './components/ActiveExercise';
import { MuscleFocusCard, RecordCard } from './components/SessionInsights';
import {
  AthleteProfileFields,
  toAthleteProfilePayload,
  toAthleteProfileValue,
  type AthleteProfileValue,
} from './components/AthleteProfileFields';
import { formatKg } from './lib/loadMath';

const GOAL_OPTIONS: {
  id: 'FORCE' | 'BODYBUILDING' | 'ENDURANCE';
  name: string;
  icon: IconName;
  badge: string;
  rest: string;
  desc: string;
}[] = [
  {
    id: 'FORCE',
    name: 'Force & Puissance',
    icon: 'bolt',
    badge: '3-5 reps • 80-87% 1RM',
    rest: 'Repos 3-4 min',
    desc: 'Charges maximales sur les mouvements polyarticulaires pour bâtir une force pure sans compromis.',
  },
  {
    id: 'BODYBUILDING',
    name: 'Bodybuilding (Hypertrophie)',
    icon: 'dumbbell',
    badge: '8-12 reps • 70-75% 1RM',
    rest: 'Repos 75-90s',
    desc: 'Volume optimisé pour stimuler la croissance musculaire, le recrutement et la congestion.',
  },
  {
    id: 'ENDURANCE',
    name: 'Endurance Musculaire',
    icon: 'activity',
    badge: '15-20 reps • 50-60% 1RM',
    rest: 'Repos 30-45s',
    desc: 'Séries longues et intensité métabolique pour développer votre résistance et votre tonicité.',
  },
];

const DEFAULT_REST_SECONDS = 90;

// Planned sets summary for the session queue, e.g. "3 × 10 · 20 kg".
const describeSets = (exercise: ActiveExercise) => {
  const first = exercise.sets[0];
  if (!first) return 'Aucune série prévue';
  return `${exercise.sets.length} × ${first.reps}${first.weight > 0 ? ` · ${formatKg(first.weight)} kg` : ''}`;
};

// The library holds ~900 exercises (wger import): cards are rendered in pages.
const LIBRARY_PAGE_SIZE = 60;
// Programs shown as quick-launch buttons on the dashboard welcome card
// (phones only display the first HERO_PROGRAMS_MOBILE, see .hero-program in shell.css).
const HERO_PROGRAMS_MAX = 6;
const HERO_PROGRAMS_MOBILE = 3;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasValidToken);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [signupGoal, setSignupGoal] = useState<'FORCE' | 'BODYBUILDING' | 'ENDURANCE'>('BODYBUILDING');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Sign-up: 1 = account, 2 = athlete profile used to calibrate the test week and the AI coach
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [signupAthlete, setSignupAthlete] = useState<AthleteProfileValue>(toAthleteProfileValue(null));
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
  // Calibration step (1-3) of the running session, null outside the test week
  const [activeTestStep, setActiveTestStep] = useState<number | null>(null);
  const [workout, setWorkout] = useState<ActiveExercise[]>([]);
  const [sessionRpe, setSessionRpe] = useState<number>(7);
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  // Exercise opened by the athlete; null follows the first one with sets left to do.
  const [focusedExercise, setFocusedExercise] = useState<number | null>(null);
  // Best marks per exercise (finished sessions), to show the last performance and records.
  const [exerciseStats, setExerciseStats] = useState<Record<string, ExerciseStats>>({});
  const requestedStats = useRef(new Set<string>());
  // Coaching cues of the running session (AI tips, coach notes or test protocol).
  const [sessionTips, setSessionTips] = useState<string[]>([]);
  const addExerciseRef = useRef<HTMLElement>(null);

  // Rest Timer State
  const [showRestTimer, setShowRestTimer] = useState<boolean>(false);
  // Last duration picked in the timer, reused when a validated set starts the rest.
  const [restDuration, setRestDuration] = useState<number>(DEFAULT_REST_SECONDS);
  const [restAutoStart, setRestAutoStart] = useState<boolean>(false);
  // Remounts the timer so each validated set starts a fresh countdown.
  const [restTimerRun, setRestTimerRun] = useState<number>(0);
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

  // The exercise on screen: the one the athlete opened, else the first with sets left to do.
  const firstPendingExercise = workout.findIndex((ex) => ex.sets.some((s) => !s.completed));
  const activeExerciseIndex =
    focusedExercise !== null && focusedExercise < workout.length
      ? focusedExercise
      : firstPendingExercise !== -1
      ? firstPendingExercise
      : workout.length - 1;
  const activeExercise: ActiveExercise | undefined = workout[activeExerciseIndex];
  const activeExerciseId = activeExercise?.exerciseId;

  const rememberStats = (exerciseId: string, data: any) => {
    requestedStats.current.add(exerciseId);
    setExerciseStats((prev) => ({
      ...prev,
      [exerciseId]: {
        maxWeight: Number(data?.maxWeight) || 0,
        maxEstimated1RM: Number(data?.maxEstimated1RM) || 0,
        lastSet: data?.lastSet ? { weight: Number(data.lastSet.weight) || 0, reps: Number(data.lastSet.reps) || 0 } : null,
      },
    }));
  };

  useEffect(() => {
    if (!activeExerciseId || requestedStats.current.has(activeExerciseId)) return;
    requestedStats.current.add(activeExerciseId);
    api
      .get(`/workout/stats/${activeExerciseId}`)
      .then((res) => rememberStats(activeExerciseId, res.data))
      // Allow a retry the next time this exercise is opened.
      .catch(() => requestedStats.current.delete(activeExerciseId));
  }, [activeExerciseId]);

  // Expired or rejected session: straight back to the login page.
  useEffect(() => {
    onUnauthorized(() => handleLogout());
  }, []);

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

  const submitAuth = async (withAthleteProfile: boolean) => {
    setAuthError('');
    setIsAuthLoading(true);
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const payload = isLoginMode
        ? { username, password }
        : {
            username,
            password,
            goal: signupGoal,
            ...(withAthleteProfile ? toAthleteProfilePayload(signupAthlete) : {}),
          };
      const res = await api.post(endpoint, payload);
      localStorage.setItem('token', res.data.access_token);
      setIsAuthenticated(true);
      showToast(isLoginMode ? 'Connexion réussie !' : 'Compte créé avec succès ! Bienvenue sur Overloady.');
    } catch (err: any) {
      const message = err.response?.data?.message;
      const text = Array.isArray(message) ? message[0] : message || "Échec de l'authentification";
      // Account errors (identifiant taken, password rules) are fixed on the first step.
      if (!isLoginMode && /identifiant|mot de passe/i.test(text)) setSignupStep(1);
      setAuthError(text);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginMode && signupStep === 1) {
      if (password !== confirmPassword) {
        setAuthError('Les deux mots de passe ne correspondent pas.');
        return;
      }
      setAuthError('');
      setSignupStep(2);
      return;
    }
    submitAuth(!isLoginMode);
  };

  const switchAuthMode = (loginMode: boolean) => {
    setIsLoginMode(loginMode);
    setSignupStep(1);
    setConfirmPassword('');
    setAuthError('');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setActiveSessionId(null);
    setWorkout([]);
  };

  // Per-session view state: which exercise is open, coaching cues, rest timer.
  const prepareSession = (tips: string[] = []) => {
    setFocusedExercise(null);
    setSessionTips(tips.filter((tip) => tip && tip.trim()));
    setShowRestTimer(false);
  };

  // Start Blank Workout
  const startNewWorkout = async () => {
    try {
      const res = await api.post('/workout/start', {});
      prepareSession();
      setActiveSessionId(res.data.id);
      setActiveRoutineName(null);
      setActiveTestStep(null);
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
      prepareSession();
      setActiveSessionId(res.data.id);
      setActiveRoutineName(routine.name);
      setActiveTestStep(null);
      setSessionNotes('');
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
      // AI recommendations carry coaching tips, coach chat sessions a note.
      prepareSession(Array.isArray(rec.coachingTips) ? rec.coachingTips : rec.notes ? [rec.notes] : []);
      setActiveSessionId(res.data.id);
      setActiveRoutineName(rec.title);
      setActiveTestStep(res.data.testWeekStep || null);
      setSessionNotes('');
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
      const protocol = testWeekStatus?.sessions?.find((s: any) => s.step === step);
      prepareSession(protocol?.instructions || []);
      setActiveSessionId(session.id);
      setActiveRoutineName(session.title || `Semaine test ${step}/3`);
      setActiveTestStep(step);
      setSessionNotes('');
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      const loadedWorkout: ActiveExercise[] = (session.exercises || []).map((exLog: any) => ({
        exerciseId: exLog.exerciseId,
        name: exLog.exercise?.name || 'Exercice Test',
        category: exLog.exercise?.category,
        progressiveTarget: 'Série Test : Notez votre charge maximale propre (RPE 8-9)',
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
      rememberStats(exercise.id, statsRes.data);
      if (statsRes.data?.recommendedOverload?.reason) {
        target = statsRes.data.recommendedOverload.reason;
      }
    } catch (e) {
      // ignore
    }

    // The athlete adds an exercise to log it now: open it.
    setFocusedExercise(workout.length);
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
    setFocusedExercise(null);
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

    // Last set of the exercise done: move on to the next exercise with sets left.
    if (!currentVal && updated[eIndex].sets.every((s) => s.completed)) {
      setFocusedExercise(null);
    }

    if (!currentVal && autoRestEnabled) {
      startRestTimer(true);
    }
  };

  const completeAllSets = (eIndex: number) => {
    setWorkout((prev) => {
      const copy = [...prev];
      copy[eIndex] = {
        ...copy[eIndex],
        sets: copy[eIndex].sets.map((s) => ({ ...s, completed: true })),
      };
      return copy;
    });
    setFocusedExercise(null);
    showToast(`Toutes les séries de "${workout[eIndex].name}" ont été validées !`, 'info');
  };

  const startRestTimer = (autoStart: boolean) => {
    setRestAutoStart(autoStart);
    setRestTimerRun((run) => run + 1);
    setShowRestTimer(true);
  };

  const scrollToAddExercise = () => {
    const section = addExerciseRef.current;
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    section.querySelector('select')?.focus({ preventScroll: true });
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
      setActiveTestStep(null);
      setWorkout([]);
      setWorkoutStartTime(null);
      prepareSession();
      // This session may hold new records: reload the stats next time.
      requestedStats.current.clear();
      setExerciseStats({});
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
        ...toAthleteProfilePayload(toAthleteProfileValue(profile)),
        goal: profile.goal || 'BODYBUILDING',
      });
      showToast('Profil et programme mis à jour !', 'success');
      api.get('/workout/test-week').then((res) => setTestWeekStatus(res.data)).catch(() => {});
      const recRes = await api.get('/workout/next-recommendation').catch(() => ({ data: null }));
      if (recRes?.data) {
        setNextRecommendation(recRes.data);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Erreur lors de la sauvegarde du profil', 'error');
    }
  };

  // Athlete profile edited from the calibration window: saved, then the test loads are recomputed
  const saveCalibrationProfile = async (value: AthleteProfileValue) => {
    try {
      const res = await api.put('/profile', toAthleteProfilePayload(value));
      setProfile((prev: any) => ({ ...prev, ...res.data }));
      const [testWeekRes, recRes] = await Promise.all([
        api.get('/workout/test-week'),
        api.get('/workout/next-recommendation').catch(() => ({ data: null })),
      ]);
      setTestWeekStatus(testWeekRes.data);
      if (recRes.data) setNextRecommendation(recRes.data);
      showToast('Profil enregistré : charges de calibration recalculées !', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Erreur lors de la sauvegarde du profil', 'error');
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
      const routineName = (session.title || session.routine?.name || 'Séance libre').replace(/;/g, ',');
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
    const routineName = session.title || session.routine?.name || 'Séance libre';
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

  // Live session telemetry
  const isExerciseDone = (ex: ActiveExercise) => ex.sets.length > 0 && ex.sets.every((s) => s.completed);
  const totalSets = workout.reduce((n, ex) => n + ex.sets.length, 0);
  const completedSets = workout.reduce((n, ex) => n + ex.sets.filter((s) => s.completed).length, 0);
  const sessionVolume = workout.reduce(
    (volume, ex) =>
      volume + ex.sets.reduce((v, s) => (s.completed ? v + (Number(s.weight) || 0) * (Number(s.reps) || 0) : v), 0),
    0,
  );
  const exercisesDone = workout.filter(isExerciseDone).length;
  const remainingExercises = workout.filter((ex, i) => i !== activeExerciseIndex && !isExerciseDone(ex)).length;
  const goalName = (GOAL_OPTIONS.find((g) => g.id === (profile.goal || 'BODYBUILDING')) || GOAL_OPTIONS[1]).name.replace(/ \(.*\)/, '');
  const sessionKicker = activeTestStep
    ? `Semaine test · étape ${activeTestStep}/3`
    : `${goalName} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // Render Authentication Screen
  if (!isAuthenticated) {
    const isSignupProfile = !isLoginMode && signupStep === 2;
    return (
      <div className="auth-shell">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <div className="auth-glow auth-glow-a" aria-hidden="true" />
        <div className="auth-glow auth-glow-b" aria-hidden="true" />

        <main className="auth-column">
          <header className="auth-brand-row">
            <div className="auth-brand">
              <span className="brand-bolt">
                <Icon name="bolt" size={19} filled strokeWidth={1.4} />
              </span>
              <span className="auth-brand-name">OVERLOADY</span>
            </div>
            <span className="auth-badge">
              <span className="ping-dot" aria-hidden="true" />
              Coach IA
            </span>
          </header>

          <section className="auth-intro">
            <h1 className="auth-headline">
              Chaque séance,
              <br />
              <span>un cran plus loin.</span>
            </h1>
            <p>Suivi des charges, surcharge progressive et coach IA pour athlètes exigeants.</p>
          </section>

          <section className="auth-card">
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

            <div className="auth-welcome">
              <div>
                {!isLoginMode && <span className="auth-step">Étape {signupStep} / 2</span>}
                <h2>{isLoginMode ? 'Bon retour 👋' : signupStep === 1 ? 'Créer un compte' : 'Ton profil athlète'}</h2>
                <p>
                  {isLoginMode
                    ? 'Connectez-vous pour reprendre votre progression.'
                    : signupStep === 1
                    ? "Choisissez un identifiant et votre objectif, on s'occupe du reste."
                    : 'Pour calibrer tes charges de départ et le coach IA. Tu pourras le modifier plus tard.'}
                </p>
              </div>
              <span className="auth-welcome-icon" aria-hidden="true">
                <Icon name={isSignupProfile ? 'user' : 'dumbbell'} size={22} />
              </span>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {isSignupProfile ? (
                <AthleteProfileFields value={signupAthlete} onChange={setSignupAthlete} idPrefix="signup" />
              ) : (
                <>
                  <div className="auth-field">
                    <div className="auth-label-row">
                      <label htmlFor="auth-username">Identifiant</label>
                      <span className="auth-label-hint">ex : alex_lifts</span>
                    </div>
                    <div className="auth-input-wrap">
                      <Icon name="user" size={18} className="auth-input-icon" />
                      <input
                        id="auth-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Votre identifiant"
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
                      <Icon name="lock" size={18} className="auth-input-icon" />
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
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} />
                      </button>
                    </div>
                    {!isLoginMode && <span className="auth-hint">6 caractères minimum.</span>}
                  </div>

                  {!isLoginMode && (
                    <div className="auth-field">
                      <label htmlFor="auth-password-confirm">Confirmer le mot de passe</label>
                      <div className="auth-input-wrap">
                        <Icon name="lock" size={18} className="auth-input-icon" />
                        <input
                          id="auth-password-confirm"
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          required
                        />
                      </div>
                      {confirmPassword && (
                        <span className={`auth-hint ${confirmPassword === password ? 'auth-hint-ok' : 'auth-hint-error'}`}>
                          {confirmPassword === password ? '✓ Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
                        </span>
                      )}
                    </div>
                  )}

                  {!isLoginMode && (
                    <div className="auth-field">
                      <label>Votre objectif</label>
                      <div className="auth-goal-grid">
                        {GOAL_OPTIONS.map((g) => (
                          <button
                            type="button"
                            key={g.id}
                            className={`auth-goal-option ${signupGoal === g.id ? 'selected' : ''}`}
                            onClick={() => setSignupGoal(g.id)}
                          >
                            <span className="auth-goal-icon">
                              <Icon name={g.icon} size={20} />
                            </span>
                            <span className="auth-goal-name">{g.name.replace(/ \(.*\)/, '')}</span>
                            <span className="auth-goal-badge">{g.badge.split(' • ')[0]}</span>
                          </button>
                        ))}
                      </div>
                      <span className="auth-hint">{GOAL_OPTIONS.find((g) => g.id === signupGoal)?.desc}</span>
                    </div>
                  )}
                </>
              )}

              {authError && (
                <div className="auth-error" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{authError}</span>
                </div>
              )}

              <button type="submit" className="btn-primary auth-submit" disabled={isAuthLoading}>
                {isAuthLoading && <span className="auth-spinner" aria-hidden="true" />}
                {isLoginMode ? 'Se connecter' : signupStep === 1 ? 'Continuer' : 'Créer mon compte'}
                {!isAuthLoading && <Icon name="arrowRight" size={18} strokeWidth={2.4} />}
              </button>

              {isSignupProfile && (
                <div className="auth-step-actions">
                  <button type="button" className="btn-ghost" onClick={() => setSignupStep(1)} disabled={isAuthLoading}>
                    ← Retour
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => submitAuth(false)} disabled={isAuthLoading}>
                    Passer cette étape
                  </button>
                </div>
              )}
            </form>

            <p className="auth-switch">
              {isLoginMode ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
              <button type="button" onClick={() => switchAuthMode(!isLoginMode)}>
                {isLoginMode ? 'Créer un compte' : 'Se connecter'}
              </button>
            </p>
          </section>

          <div className="auth-proof">
            <div className="auth-proof-tile">
              <span className="auth-proof-value">
                +2,5<small>kg</small>
              </span>
              <span className="auth-proof-label">Incrément auto</span>
            </div>
            <div className="auth-proof-tile">
              <span className="auth-proof-value">1RM</span>
              <span className="auth-proof-label">Estimation auto</span>
            </div>
            <div className="auth-proof-tile">
              <span className="auth-proof-value">RPE</span>
              <span className="auth-proof-label">Effort suivi</span>
            </div>
          </div>

          <p className="auth-footnote">Surcharge progressive automatisée • Historique complet • Coach IA Atlas</p>
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
        session={
          activeSessionId ? { name: activeRoutineName || 'Séance libre', clock: formatDuration(elapsedSeconds) } : null
        }
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
                  <span className="test-badge-glow">
                    <Icon name="flask" size={14} />
                    Semaine de test athlète • {testWeekStatus.testWeekProgress}/{testWeekStatus.totalSteps} complété
                  </span>
                  <div className="test-week-banner-actions">
                    <button className="btn-small" onClick={() => setIsTestWeekModalOpen(true)}>
                      <Icon name="clipboard" size={16} />
                      Voir le protocole des tests
                    </button>
                    <button className="btn-text-danger" onClick={handleSkipTestWeek} title="Passer directement au Coach IA">
                      Passer
                    </button>
                  </div>
                </div>

                <div className="test-week-banner-title">
                  <h2>Phase d'Évaluation Initiale (1 Semaine)</h2>
                  <span>Calibrez vos charges de travail de référence avant de lancer l'IA</span>
                </div>

                {/* 3 Step Cards */}
                <div className="test-week-steps-row">
                  {testWeekStatus.sessions?.map((sess: any) => {
                    const isCompleted = sess.status === 'completed';
                    const isCurrent = sess.status === 'current';
                    return (
                      <button
                        type="button"
                        key={sess.step}
                        className={`test-step-mini-card ${sess.status}`}
                        onClick={() => setIsTestWeekModalOpen(true)}
                      >
                        <div className="step-card-header">
                          <span className="step-status">{isCompleted ? '✓ Validé' : isCurrent ? 'En cours' : 'À venir'}</span>
                          <span className="step-day">{sess.dayName}</span>
                        </div>
                        <div className="step-card-title">{sess.name}</div>
                        <div className="step-card-focus">{sess.focus}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Action button */}
                <div className="test-week-banner-cta">
                  <button
                    className="btn-primary"
                    onClick={() => handleStartTestWeekSession(testWeekStatus.currentStep)}
                    disabled={isStartingTestStep || !!activeSessionId}
                  >
                    {!isStartingTestStep && !activeSessionId && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                    {isStartingTestStep
                      ? 'Lancement...'
                      : activeSessionId
                      ? 'Séance déjà en cours'
                      : `Lancer la Séance Test ${testWeekStatus.currentStep} (${testWeekStatus.sessions?.[testWeekStatus.currentStep - 1]?.name || 'Test'})`}
                  </button>
                  <button className="btn-secondary" onClick={() => setIsTestWeekModalOpen(true)}>
                    Détail des 3 séances
                  </button>
                </div>
              </div>
            )}

            <div className="bento-grid">
              {/* Bento 1: compact welcome + program quick launch (grows with the number of programs) */}
              <div className="bento-hero">
                <div className="hero-top">
                  <span className="badge-pill">Programme {profile.goal || 'BODYBUILDING'}</span>
                  {testWeekStatus?.testWeekCompleted && (
                    <button type="button" className="badge-pill is-jade is-clickable" onClick={() => setIsTestWeekModalOpen(true)}>
                      ✓ Profil calibré
                    </button>
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
                          <span className="hero-program-play">
                            <Icon name="play" size={12} filled strokeWidth={1.5} />
                          </span>
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
                  <button className="btn-primary" onClick={startNewWorkout}>
                    <Icon name="plus" size={18} strokeWidth={2.4} />
                    Séance libre
                  </button>
                  <button className="btn-secondary" onClick={() => setIsRoutineModalOpen(true)}>
                    <Icon name="plus" size={18} />
                    Nouveau programme
                  </button>
                </div>
              </div>

              {/* Bento 2: AI Coach Recommended Workout */}
              {nextRecommendation ? (
                <div className="bento-ai-rec">
                  <div>
                    <div className="bento-ai-head">
                      <div className="bento-badge">
                        <span className="ai-dot-pulse" />
                        <span>
                          {nextRecommendation.isTestWeek
                            ? `Semaine test • Étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps}`
                            : nextRecommendation.aiGenerated
                            ? 'Coach IA connecté'
                            : 'Surcharge calculée'}{' '}
                          • {nextRecommendation.goalDetails?.label || nextRecommendation.goal}
                        </span>
                      </div>
                      {nextRecommendation.aiModel && <span className="bento-ai-model">{nextRecommendation.aiModel}</span>}
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
                          <Icon name="lightbulb" size={14} />
                          <span>Consignes clés du coach IA</span>
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
                      <div>
                        <button
                          type="button"
                          className="ai-preview-toggle"
                          onClick={() => setShowAiExercisesPreview((prev) => !prev)}
                          aria-expanded={showAiExercisesPreview}
                        >
                          <span>{nextRecommendation.exercises.length} exercices prescrits</span>
                          <span>
                            {showAiExercisesPreview ? 'Masquer' : 'Voir le détail'}
                            <Icon name={showAiExercisesPreview ? 'chevronUp' : 'chevronDown'} size={14} />
                          </span>
                        </button>

                        {showAiExercisesPreview && (
                          <div className="ai-exercises-preview">
                            {nextRecommendation.exercises.map((ex: any, idx: number) => (
                              <div key={idx} className="ai-ex-preview-item">
                                <div className="ai-ex-header">
                                  <span className="ai-ex-name">{ex.name}</span>
                                  <span className="ai-ex-badge">{ex.sets?.length || 3} séries</span>
                                </div>
                                {ex.reason && <div className="ai-ex-reason">"{ex.reason}"</div>}
                                {ex.targetAdvice && <div className="ai-ex-advice">{ex.targetAdvice}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bento-ai-actions">
                    <button
                      className="btn-primary"
                      onClick={() => startRecommendedWorkout()}
                      disabled={isStartingRec || !!activeSessionId || isRegeneratingAi}
                    >
                      {!isStartingRec && !activeSessionId && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                      {isStartingRec
                        ? 'Lancement en cours...'
                        : activeSessionId
                        ? 'Séance déjà en cours'
                        : nextRecommendation.isTestWeek
                        ? `Démarrer le Test (Étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps})`
                        : 'Démarrer cette séance'}
                    </button>
                    {nextRecommendation.isTestWeek ? (
                      <button
                        className="btn-secondary"
                        onClick={() => setIsTestWeekModalOpen(true)}
                        title="Consulter le protocole de la semaine de test"
                      >
                        <Icon name="clipboard" size={16} />
                        Détail tests
                      </button>
                    ) : (
                      <button
                        className="btn-ai-regenerate"
                        onClick={regenerateAiRecommendation}
                        disabled={isRegeneratingAi || !!activeSessionId}
                        title="Demander une autre séance générée par l'IA"
                      >
                        <span className={isRegeneratingAi ? 'spin-icon' : ''}>
                          <Icon name="refresh" size={16} />
                        </span>
                        <span>{isRegeneratingAi ? 'Génération IA...' : 'Régénérer IA'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bento-ai-rec">
                  <div>
                    <div className="bento-ai-head">
                      <div className="bento-badge">
                        <span className="ai-dot-pulse" />
                        <span>Coach IA • Prêt</span>
                      </div>
                    </div>
                    <h2>Votre Coach IA s'active...</h2>
                    <p className="rec-text">
                      L'intelligence artificielle est prête à concevoir votre prochaine séance sur-mesure. Cliquez sur Régénérer pour solliciter le coach dès maintenant !
                    </p>
                  </div>
                  <div className="bento-ai-actions">
                    <button className="btn-primary" onClick={regenerateAiRecommendation} disabled={isRegeneratingAi}>
                      <span className={isRegeneratingAi ? 'spin-icon' : ''}>
                        <Icon name="sparkle" size={16} />
                      </span>
                      <span>{isRegeneratingAi ? 'Génération en cours...' : "Générer ma séance avec l'IA"}</span>
                    </button>
                    <button className="btn-secondary" onClick={startNewWorkout}>
                      <Icon name="plus" size={16} />
                      Séance libre
                    </button>
                  </div>
                </div>
              )}

              {/* Bento 3: 4 Stat Tiles */}
              <div className="bento-stats">
                <div className="bento-stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Séances (7j)</span>
                    <span className="stat-icon">
                      <Icon name="flame" size={18} />
                    </span>
                  </div>
                  <div className="stat-number">{dashboardStats.workoutsThisWeek ?? 0}</div>
                  <div className="stat-footer">Fréquence d'entraînement</div>
                </div>

                <div className="bento-stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Volume total (7j)</span>
                    <span className="stat-icon">
                      <Icon name="weight" size={18} />
                    </span>
                  </div>
                  <div className="stat-number">
                    {dashboardStats.weekVolume ? `${dashboardStats.weekVolume.toLocaleString()}` : '0'}
                    <span className="stat-unit">kg</span>
                  </div>
                  <div className="stat-footer">Tonnage cumulé soulevé</div>
                </div>

                <div className="bento-stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Poids corporel</span>
                    <span className="stat-icon">
                      <Icon name="user" size={18} />
                    </span>
                  </div>
                  <div className="stat-number">
                    {profile.weight || '--'}
                    <span className="stat-unit">kg</span>
                  </div>
                  <div className="stat-footer">Dernière pesée enregistrée</div>
                </div>

                <div className="bento-stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Indice IMC</span>
                    <span className="stat-icon">
                      <Icon name="activity" size={18} />
                    </span>
                  </div>
                  <div className="stat-number">
                    {bmi || '--'}
                    {bmi && <span className="stat-unit">{bmi < 25 ? '(Normal)' : '(Surpoids)'}</span>}
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
            {activeSessionId ? (
              <div className={`session${showRestTimer ? ' has-rest-drawer' : ''}`}>
                {/* Active Test Week Session Notice */}
                {activeTestStep && (
                  <div className="session-notice">
                    <div className="session-notice-text">
                      <Icon name="flask" size={20} />
                      <div>
                        <strong>Séance du protocole de calibration athlète</strong>
                        <span>
                          Donnez le maximum avec une technique propre. Vos charges réelles et répétitions sont mesurées pour calibrer vos futurs cycles IA.
                        </span>
                      </div>
                    </div>
                    <button className="btn-small" onClick={() => setIsTestWeekModalOpen(true)}>
                      Protocole
                    </button>
                  </div>
                )}

                {/* Session header + live telemetry */}
                <section className="session-hero">
                  <div className="session-hero-top">
                    <div className="session-hero-text">
                      <div className="session-hero-tags">
                        <span className="tag-live">
                          <span className="ping-dot" aria-hidden="true" />
                          Séance en cours
                        </span>
                        <span className="session-hero-kicker">{sessionKicker}</span>
                      </div>
                      <h1>{activeRoutineName || 'Séance libre'}</h1>
                      <p>Saisissez vos charges et répétitions. Validez chaque série pour déclencher le repos.</p>
                    </div>
                    <div className="session-hero-actions">
                      {!showRestTimer && (
                        <button
                          className="btn-secondary"
                          onClick={() => startRestTimer(false)}
                          title="Ouvrir le chronomètre de repos"
                          aria-label="Ouvrir le chronomètre de repos"
                        >
                          <Icon name="hourglass" size={18} />
                          <span className="btn-label">Repos</span>
                        </button>
                      )}
                      <button className="btn-secondary" onClick={scrollToAddExercise} aria-label="Ajouter un exercice">
                        <Icon name="plus" size={18} />
                        <span className="btn-label">Ajouter un exercice</span>
                      </button>
                      <button className="btn-primary" onClick={finishWorkout}>
                        <Icon name="flag" size={18} />
                        Terminer la séance
                      </button>
                    </div>
                  </div>

                  <div className="telemetry">
                    <div className="metric">
                      <span className="metric-label">
                        <Icon name="timer" size={14} />
                        Chrono total
                      </span>
                      <span className="metric-value is-clock">
                        {formatDuration(elapsedSeconds)}
                        <span className="metric-live" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">
                        <Icon name="weight" size={14} />
                        Volume validé
                      </span>
                      <span className="metric-value">
                        {sessionVolume.toLocaleString('fr-FR')}
                        <span className="metric-unit">kg</span>
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">
                        <Icon name="checkCircle" size={14} />
                        Séries validées
                      </span>
                      <span className="metric-value">
                        {completedSets}
                        <span className="metric-unit">/ {totalSets} séries</span>
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">
                        <Icon name="dumbbell" size={14} />
                        Exercices finis
                      </span>
                      <span className="metric-value is-accent">
                        {exercisesDone}
                        <span className="metric-unit">/ {workout.length}</span>
                      </span>
                    </div>
                  </div>
                </section>

                {/* Rest Timer */}
                {showRestTimer && (
                  <RestTimer
                    key={restTimerRun}
                    initialSeconds={restDuration}
                    autoStart={restAutoStart}
                    onDurationChange={setRestDuration}
                    onClose={() => setShowRestTimer(false)}
                  />
                )}

                <div className="session-layout">
                  <div className="session-main">
                    {activeExercise ? (
                      <ActiveExerciseCard
                        exercise={activeExercise}
                        position={activeExerciseIndex + 1}
                        total={workout.length}
                        stats={exerciseStats[activeExercise.exerciseId]}
                        onSetChange={(sIndex, field, value) => updateSet(activeExerciseIndex, sIndex, field, value)}
                        onToggleSet={(sIndex) => toggleSetCompleted(activeExerciseIndex, sIndex)}
                        onAddSet={() => addSet(activeExerciseIndex)}
                        onRemoveSet={(sIndex) => removeSet(activeExerciseIndex, sIndex)}
                        onCompleteAll={() => completeAllSets(activeExerciseIndex)}
                        onWarmup={() => openWarmupForExercise(activeExerciseIndex)}
                        onCalculator={() => openPlateCalculator(activeExercise)}
                        onRemove={() => removeExerciseFromSession(activeExerciseIndex)}
                      />
                    ) : (
                      <div className="glass-panel session-empty">
                        <span className="session-empty-icon">
                          <Icon name="dumbbell" size={26} />
                        </span>
                        <h3>Votre séance est prête</h3>
                        <p>Ajoutez un premier exercice depuis la bibliothèque pour commencer à enregistrer vos séries.</p>
                      </div>
                    )}

                    {/* Rest of the session */}
                    {workout.length > 1 && (
                      <section className="session-queue">
                        <div className="section-head">
                          <h3>Suite de la séance</h3>
                          <span>
                            {remainingExercises} {remainingExercises > 1 ? 'exercices restants' : 'exercice restant'}
                          </span>
                        </div>
                        {workout.map((ex, eIndex) => {
                          if (eIndex === activeExerciseIndex) return null;
                          const doneSets = ex.sets.filter((s) => s.completed).length;
                          const isDone = ex.sets.length > 0 && doneSets === ex.sets.length;
                          return (
                            <button
                              key={ex.exerciseId + eIndex}
                              type="button"
                              className={`queue-item${isDone ? ' is-done' : ''}`}
                              onClick={() => setFocusedExercise(eIndex)}
                            >
                              <span className="queue-tile" aria-hidden="true">
                                <Icon name={isDone ? 'check' : 'dumbbell'} size={22} />
                              </span>
                              <span className="queue-body">
                                <span className="queue-meta">
                                  <span>Exercice {eIndex + 1}</span>
                                  <span className={`badge-category${isDone ? ' is-done-tag' : ''}`}>
                                    {isDone ? 'Terminé' : `${doneSets}/${ex.sets.length} séries`}
                                  </span>
                                </span>
                                <span className="queue-name">{ex.name}</span>
                                <span className="queue-detail">{ex.progressiveTarget || describeSets(ex)}</span>
                              </span>
                              <span className="queue-cta">
                                <span>{isDone ? 'Revoir' : 'Ouvrir'}</span>
                                <Icon name="chevronRight" size={16} />
                              </span>
                            </button>
                          );
                        })}
                      </section>
                    )}

                    {/* Add Exercise */}
                    <section className="glass-panel session-add" ref={addExerciseRef}>
                      <h3>Ajouter un exercice à la séance</h3>
                      <div className="session-add-row">
                        <select
                          className="input-glass"
                          aria-label="Choisir un exercice dans la bibliothèque"
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
                          <Icon name="plus" size={16} />
                          Créer exercice personnalisé
                        </button>
                      </div>
                    </section>

                    {/* Session Feedback & Notes */}
                    <section className="glass-panel session-feedback">
                      <div className="form-group">
                        <label>RPE de la séance (Effort perçu de 1 à 10) : {sessionRpe}/10</label>
                        <div className="rpe-selector">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <button
                              key={num}
                              type="button"
                              className={`rpe-btn ${sessionRpe === num ? 'active' : ''}`}
                              onClick={() => setSessionRpe(num)}
                              aria-pressed={sessionRpe === num}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="session-notes">Tes notes (facultatif)</label>
                        <input
                          id="session-notes"
                          type="text"
                          className="input-glass"
                          placeholder="Sensations, forme, courbatures… ex : bonne congestion, barre facile à 80 kg"
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                        />
                      </div>
                    </section>

                    <button className="btn-primary session-finish" onClick={finishWorkout}>
                      <Icon name="flag" size={20} />
                      Terminer et enregistrer la séance
                    </button>
                  </div>

                  <aside className="session-side" aria-label="Analyse de la séance">
                    {activeExercise && <RecordCard exercise={activeExercise} stats={exerciseStats[activeExercise.exerciseId]} />}
                    <MuscleFocusCard exercises={workout} />
                    {sessionTips.length > 0 && (
                      <section className="glass-panel coach-tips">
                        <div className="coach-tips-head">
                          <Icon name="lightbulb" size={18} />
                          <span>{activeTestStep ? 'Consignes du protocole' : 'Consignes du coach'}</span>
                        </div>
                        <ul>
                          {sessionTips.map((tip, idx) => (
                            <li key={idx}>{tip}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </aside>
                </div>
              </div>
            ) : (
              <>
                <div className="header logger-header-idle">
                  <div>
                    <h1>Aucune séance active</h1>
                    <p>Démarrez une nouvelle séance pour commencer à enregistrer vos performances.</p>
                  </div>
                  <button className="btn-primary" onClick={startNewWorkout}>
                    <Icon name="plus" size={18} strokeWidth={2.4} />
                    Démarrer une séance
                  </button>
                </div>

                <div className="logger-idle">
                  <CoachChat
                    onStartWorkout={(coachWorkout) => startRecommendedWorkout(coachWorkout)}
                    onSaveRoutine={saveCoachWorkoutAsRoutine}
                    onError={(text) => showToast(text, 'error')}
                  />
                  <div className="glass-panel logger-idle-start">
                    <span className="logger-idle-icon">
                      <Icon name="dumbbell" size={28} />
                    </span>
                    <h2>Aucun entraînement en cours</h2>
                    <p>Démarre une séance libre, lance un de tes programmes ou demande une séance au coach.</p>
                    <div className="logger-idle-actions">
                      <button className="btn-primary" onClick={startNewWorkout}>
                        Démarrer une séance libre
                      </button>
                      <button className="btn-secondary" onClick={() => setActiveTab('routines')}>
                        Choisir un programme
                      </button>
                    </div>
                  </div>
                </div>
              </>
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
              <button className="btn-primary" onClick={() => setIsRoutineModalOpen(true)}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Nouveau Programme
              </button>
            </div>

            <div className="routine-grid">
              {routines.map((rt) => (
                <div key={rt.id} className="glass-panel routine-card">
                  <div>
                    <div className="routine-card-head">
                      <h3>{rt.name}</h3>
                      <button
                        className="btn-icon is-danger"
                        onClick={() => handleDeleteRoutine(rt.id)}
                        title="Supprimer la routine"
                        aria-label={`Supprimer le programme ${rt.name}`}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>

                    <p className="routine-card-count">{rt.exercises?.length || 0} exercices</p>

                    <div className="routine-ex-list">
                      {(rt.exercises || []).map((ex: any) => (
                        <div key={ex.id} className="routine-ex-row">
                          <span>{ex.name}</span>
                          <span className="badge-category">{ex.category || 'Général'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="btn-primary routine-launch" onClick={() => startRoutineWorkout(rt)}>
                    <Icon name="play" size={16} filled strokeWidth={1.5} />
                    Lancer l'entraînement
                  </button>
                </div>
              ))}
            </div>

            {routines.length === 0 && (
              <div className="glass-panel empty-panel">
                <span className="empty-panel-icon">
                  <Icon name="clipboard" size={26} />
                </span>
                <h3>Aucun programme créé pour le moment</h3>
                <p>
                  Créez des routines personnalisées pour pré-remplir automatiquement vos séances et appliquer la surcharge progressive.
                </p>
                <button className="btn-primary" onClick={() => setIsRoutineModalOpen(true)}>
                  <Icon name="plus" size={18} strokeWidth={2.4} />
                  Créer mon premier programme
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
                  <Icon name="download" size={18} />
                  Exporter en CSV
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

              const sessionTitle = session.title || session.routine?.name || 'Séance libre';
              const sessionTag = session.testWeekStep
                ? 'Semaine test'
                : session.routine
                ? 'Programme'
                : session.title
                ? 'Coach IA'
                : null;

              return (
                <div key={session.id} className="glass-panel history-card">
                  <div className="history-head">
                    <div>
                      <div className="history-title-row">
                        <h3 className="history-title">{sessionTitle}</h3>
                        {sessionTag && <span className="badge-pill">{sessionTag}</span>}
                      </div>
                      <div className="history-date">
                        {new Date(session.startedAt).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </div>
                      <div className="history-stats">
                        <span>
                          RPE <strong>{session.rpe}/10</strong>
                        </span>
                        <span>
                          Volume <strong>{sessionVolume.toLocaleString()} kg</strong>
                        </span>
                        <span>
                          Exercices <strong>{session.exercises?.length || 0}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="history-actions">
                      <button className="btn-small" onClick={() => shareSession(session)} title="Copier le résumé de la séance">
                        <Icon name="share" size={16} />
                        Partager
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : session.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Masquer détails' : 'Voir détails'}
                        <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={16} />
                      </button>
                      <button
                        className="btn-icon is-danger"
                        onClick={() => handleDeleteSession(session.id)}
                        title="Supprimer la séance"
                        aria-label="Supprimer la séance"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>

                  {session.notes && <div className="history-notes">"{session.notes}"</div>}

                  {/* Expanded Exercise and Sets view */}
                  {isExpanded && (
                    <div className="history-details">
                      {session.exercises?.length > 0 ? (
                        session.exercises.map((exLog: any) => (
                          <div key={exLog.id} className="history-exercise">
                            <div className="history-exercise-head">
                              <strong>{exLog.exercise?.name || 'Exercice'}</strong>
                              <span className="badge-category">{exLog.exercise?.category || 'Général'}</span>
                            </div>

                            <div className="history-sets">
                              {exLog.sets?.map((st: any, idx: number) => (
                                <span key={st.id || idx} className={`history-set${st.completed ? ' is-done' : ''}`}>
                                  S{idx + 1}: {st.weight}kg × {st.reps} {st.completed ? '✓' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted-note">Aucun exercice n'a été consigné dans cette séance.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {history.length === 0 && (
              <div className="glass-panel empty-panel">
                <span className="empty-panel-icon">
                  <Icon name="history" size={26} />
                </span>
                <p>Aucune séance passée enregistrée.</p>
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
              <button className="btn-primary" onClick={() => setIsAddExerciseOpen(true)}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Nouvel Exercice
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
            <div className="library-search">
              <Icon name="search" size={18} />
              <input
                type="search"
                className="input-glass"
                placeholder="Rechercher un exercice par nom..."
                aria-label="Rechercher un exercice"
                value={exerciseSearch}
                onChange={(e) => {
                  setExerciseSearch(e.target.value);
                  setLibraryLimit(LIBRARY_PAGE_SIZE);
                }}
              />
            </div>

            {/* Exercise List */}
            <div className="library-grid">
              {filteredExercises.slice(0, libraryLimit).map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="glass-panel exercise-card"
                  onClick={() => setSelectedExerciseIdForModal(ex.id)}
                >
                  <span>
                    <span className="exercise-card-name">{ex.name}</span>
                    <span className="badge-category">{ex.category || 'Général'}</span>
                  </span>
                  <Icon name="trendingUp" size={20} className="exercise-card-icon" />
                </button>
              ))}
            </div>

            {filteredExercises.length > libraryLimit && (
              <div className="load-more">
                <button className="btn-secondary" onClick={() => setLibraryLimit((l) => l + LIBRARY_PAGE_SIZE)}>
                  Afficher plus ({filteredExercises.length - libraryLimit} restants)
                </button>
              </div>
            )}

            {filteredExercises.length === 0 && (
              <p className="muted-note empty-note">Aucun exercice trouvé correspondant à vos critères.</p>
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
                <Icon name="logout" size={18} />
                Déconnexion
              </button>
            </div>

            <div className="glass-panel profile-panel">
              <form onSubmit={saveProfile}>
                <div className="form-group">
                  <label htmlFor="profile-username">Identifiant du compte</label>
                  <input id="profile-username" type="text" value={profile.user?.username || ''} readOnly disabled />
                </div>

                <div className="form-group">
                  <AthleteProfileFields
                    value={toAthleteProfileValue(profile)}
                    onChange={(value) => setProfile({ ...profile, ...value })}
                    idPrefix="profile"
                  />
                </div>

                {bmi && (
                  <div className="highlight-box profile-bmi">
                    <div className="eyebrow">Indice de Masse Corporelle (IMC)</div>
                    <div className="profile-bmi-value">
                      {bmi} kg/m²{' '}
                      <span>
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

                <div className="form-group profile-goal">
                  <label>Programme d'entraînement principal</label>
                  <p className="profile-goal-help">
                    Changer de programme adapte immédiatement les objectifs (charges, répétitions, temps de repos) de vos prochaines séances recommandées :
                  </p>
                  <div className="goal-selector-grid">
                    {GOAL_OPTIONS.map((g) => {
                      const isSelected = (profile.goal || 'BODYBUILDING') === g.id;
                      return (
                        <button
                          type="button"
                          key={g.id}
                          className={`goal-card-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => setProfile({ ...profile, goal: g.id })}
                          aria-pressed={isSelected}
                        >
                          <span className="goal-card-icon">
                            <Icon name={g.icon} size={20} />
                          </span>
                          <span className="goal-card-content">
                            <span className="goal-card-title">
                              <span>{g.name}</span>
                              {isSelected && <span className="goal-card-active">● Actif</span>}
                            </span>
                            <span className="goal-card-desc">{g.desc}</span>
                            <span className="goal-card-specs">
                              {g.badge} | {g.rest}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={autoRestEnabled}
                      onChange={(e) => setAutoRestEnabled(e.target.checked)}
                    />
                    <span>Démarrer automatiquement le chronomètre de repos après chaque série validée (✓)</span>
                  </label>
                </div>

                <button type="submit" className="btn-primary profile-save">
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
        profile={profile}
        onSaveProfile={saveCalibrationProfile}
      />
    </div>
  );
}

export default App;
