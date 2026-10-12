import React, { useState, useEffect, useRef } from 'react';
import api, { clearToken, hasValidToken, onUnauthorized, setToken, warmUpBackend } from './api';
import './App.css';
import './shell.css';
import './components.css';
import './motion.css';
import { REST_TIDE_ID, RestTimer } from './components/RestTimer';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { AddExerciseModal } from './components/AddExerciseModal';
import { RoutineModal } from './components/RoutineModal';
import { ExercisePicker } from './components/ExercisePicker';
import { ConfirmDialog } from './components/ConfirmDialog';
import { RegenerateModal } from './components/RegenerateModal';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { WarmupModal } from './components/WarmupModal';
import { AnalyticsView } from './components/AnalyticsView';
import { TestWeekModal } from './components/TestWeekModal';
import { Navigation, type AppTab } from './components/Navigation';
import { Icon, type IconName } from './components/Icons';
import { CoachChat, type CoachWorkout } from './components/CoachChat';
import { ActiveExerciseCard, type ActiveExercise, type ActiveSet, type ExerciseStats } from './components/ActiveExercise';
import { MuscleFocusCard, RecordCard } from './components/SessionInsights';
import {
  AthleteProfileFields,
  toAthleteProfilePayload,
  toAthleteProfileValue,
  type AthleteProfileValue,
} from './components/AthleteProfileFields';
import { formatKg } from './lib/loadMath';
import { fillFromTarget, resolveSetTarget, toTarget } from './lib/overload';
import { createNameMatcher } from './lib/exerciseSearch';
import {
  clearSessionDraft,
  currentUserId,
  loadSessionDraft,
  saveSessionDraft,
  type SessionDraft,
} from './lib/sessionDraft';

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
/** A set with nothing entered yet: sessions start empty, the athlete logs what they actually lift. */
const emptySet = (): ActiveSet => ({ weight: 0, reps: 0, completed: false });

const describeSets = (exercise: ActiveExercise) => {
  const first = exercise.sets[0];
  if (!first) return 'Aucune série prévue';
  // Sets start empty: the planned target stands in until the athlete logs the first one
  const reps = first.reps || first.target?.reps || 0;
  const weight = first.weight || first.target?.weight || 0;
  if (!reps) return `${exercise.sets.length} série${exercise.sets.length > 1 ? 's' : ''}`;
  return `${exercise.sets.length} × ${reps}${weight > 0 ? ` · ${formatKg(weight)} kg` : ''}`;
};

// Training cycle named on the dashboard greeting ("Cycle Hypertrophie").
const GOAL_CYCLE_LABELS: Record<string, string> = {
  FORCE: 'Force',
  BODYBUILDING: 'Hypertrophie',
  ENDURANCE: 'Endurance',
};

// Target of a recommended exercise from its first set, e.g. "82,5 kg × 8 reps".
const describeTarget = (exercise: { sets?: { weight?: number; reps?: number }[] }) => {
  const first = exercise.sets?.[0];
  if (!first) return 'Charge à définir';
  const reps = Number(first.reps) || 0;
  const weight = Number(first.weight) || 0;
  return weight > 0 ? `${formatKg(weight)} kg × ${reps} reps` : `Poids du corps × ${reps} reps`;
};

// The library holds ~900 exercises (wger import): cards are rendered in pages.
// "18:32" today, "ven. 18:32" within the week, "3 oct." beyond
const formatDraftStart = (iso: string) => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  if (Date.now() - date.getTime() < 6 * 24 * 3600 * 1000) {
    return `${date.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const LIBRARY_PAGE_SIZE = 60;
// Programs shown as quick-launch buttons on the dashboard welcome card
// (phones only display the first HERO_PROGRAMS_MOBILE, see .program-row in shell.css).
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
  // Calibration week asked at sign-up: without it, no test sessions at all
  const [signupCalibration, setSignupCalibration] = useState<boolean>(true);
  const [confirmPassword, setConfirmPassword] = useState('');
  // Sign-up: 1 = account, 2 = athlete profile used to calibrate the test week and the AI coach
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [signupAthlete, setSignupAthlete] = useState<AthleteProfileValue>(toAthleteProfileValue(null));
  const [authError, setAuthError] = useState('');
  // The login takes long: the backend (Render free tier) is most likely waking up.
  const [isServerWaking, setIsServerWaking] = useState(false);

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
  const [isRegenerateOpen, setIsRegenerateOpen] = useState<boolean>(false);
  // Coach advice of the recommended session (rationale, tips, per-exercise reasons), folded by default
  const [showAiExercisesPreview, setShowAiExercisesPreview] = useState<boolean>(false);

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
  const [isAbandonOpen, setIsAbandonOpen] = useState<boolean>(false);
  // The exercise picker stays folded during a session until the athlete asks for it
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isRecalibrateOpen, setIsRecalibrateOpen] = useState<boolean>(false);
  // Session left open when the app was closed, offered back on the next launch
  const [resumeDraft, setResumeDraft] = useState<SessionDraft | null>(null);

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
        previousSets: Array.isArray(data?.previousSets)
          ? data.previousSets.map((s: any) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }))
          : [],
        lastRpe: Number(data?.lastRpe) || null,
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

  // Every change of the running session is saved on the device, so closing the app loses nothing
  useEffect(() => {
    if (!activeSessionId || !workoutStartTime) return;
    const userId = currentUserId();
    if (!userId) return;
    saveSessionDraft({
      userId,
      sessionId: activeSessionId,
      routineName: activeRoutineName,
      testStep: activeTestStep,
      workout,
      notes: sessionNotes,
      rpe: sessionRpe,
      startedAt: workoutStartTime.toISOString(),
      tips: sessionTips,
    });
  }, [activeSessionId, activeRoutineName, activeTestStep, workout, sessionNotes, sessionRpe, workoutStartTime, sessionTips]);

  // A session saved on the device is offered back, unless it was finished or deleted meanwhile
  const checkSessionDraft = async () => {
    const userId = currentUserId();
    const draft = userId ? loadSessionDraft(userId) : null;
    if (!draft) return;
    try {
      const res = await api.get(`/workout/session/${draft.sessionId}`);
      if (res.data?.endedAt) {
        clearSessionDraft(userId);
        return;
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        clearSessionDraft(userId);
        return;
      }
      // Server unreachable: the session is still offered, it will be saved once the server answers
    }
    setResumeDraft(draft);
  };

  const resumeSession = (draft: SessionDraft) => {
    prepareSession(draft.tips);
    setActiveSessionId(draft.sessionId);
    setActiveRoutineName(draft.routineName);
    setActiveTestStep(draft.testStep);
    setWorkout(draft.workout);
    setSessionNotes(draft.notes);
    setSessionRpe(draft.rpe);
    setWorkoutStartTime(new Date(draft.startedAt));
    setActiveTab('logger');
    setResumeDraft(null);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      checkSessionDraft();
    } else {
      // Wake the backend and the database while the athlete types their credentials.
      warmUpBackend();
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
    const wakingTimer = setTimeout(() => setIsServerWaking(true), 3000);
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const payload = isLoginMode
        ? { username, password }
        : {
            username,
            password,
            goal: signupGoal,
            calibration: signupCalibration,
            ...(withAthleteProfile ? toAthleteProfilePayload(signupAthlete) : {}),
          };
      const res = await api.post(endpoint, payload);
      setToken(res.data.access_token);
      setIsAuthenticated(true);
      if (!isLoginMode) showToast('Compte créé. Bienvenue sur Overloady.');
    } catch (err: any) {
      const message = err.response?.data?.message;
      const text = Array.isArray(message) ? message[0] : message || "Échec de l'authentification";
      // Account errors (identifiant taken, password rules) are fixed on the first step.
      if (!isLoginMode && /identifiant|mot de passe/i.test(text)) setSignupStep(1);
      setAuthError(text);
    } finally {
      clearTimeout(wakingTimer);
      setIsServerWaking(false);
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
    clearToken();
    setIsAuthenticated(false);
    setActiveSessionId(null);
    setWorkout([]);
  };

  // Per-session view state: which exercise is open, coaching cues, rest timer.
  const prepareSession = (tips: string[] = []) => {
    setFocusedExercise(null);
    setSessionTips(tips.filter((tip) => tip && tip.trim()));
    setShowRestTimer(false);
    setIsPickerOpen(false);
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
        sets: (exLog.sets || []).map(emptySet),
      }));

      setWorkout(prefilledExercises);
      setActiveTab('logger');
    } catch (err) {
      showToast('Erreur lors du lancement de la routine', 'error');
    }
  };

  // Regenerate with AI Coach
  const regenerateAiRecommendation = async (instructions = '') => {
    setIsRegenerateOpen(false);
    setIsRegeneratingAi(true);
    try {
      const res = await api.post('/workout/regenerate-recommendation', instructions ? { instructions } : {});
      setNextRecommendation(res.data);
      if (res.data?.aiGenerated) {
        showToast(`Séance « ${res.data.title} » prête`, 'success');
      } else if (instructions) {
        // The fallback engine can't read the request: say so rather than pretend it was applied
        showToast("Le Coach IA n'a pas répondu : séance réajustée automatiquement, sans ta demande. Réessaie dans un instant.", 'error');
      } else {
        showToast('Séance réajustée selon ta surcharge progressive', 'success');
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
          // The recommended loads become the ghost values of the empty sets
          sets: (exLog.sets || []).map((_: unknown, i: number) => {
            const planned = matchingRecEx?.sets ?? [];
            return { ...emptySet(), target: toTarget(planned[Math.min(i, planned.length - 1)]) };
          }),
        };
      });

      setWorkout(prefilledExercises);
      setActiveTab('logger');
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
      showToast(`Programme « ${coachWorkout.title} » enregistré`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || "Impossible d'enregistrer le programme", 'error');
    }
  };

  // Start Test Week Calibration Session
  const handleStartTestWeekSession = async (step: number) => {
    if (activeSessionId) {
      showToast("Une séance est déjà en cours. Termine-la avant d'en lancer une autre.", 'error');
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

      const loadedWorkout: ActiveExercise[] = (session.exercises || []).map((exLog: any, idx: number) => {
        // Starting loads of the protocol, scaled to the athlete's profile
        const planned = protocol?.exercises?.[idx];
        const target = toTarget(planned && { weight: planned.defaultWeight, reps: planned.reps });
        return {
          exerciseId: exLog.exerciseId,
          name: exLog.exercise?.name || 'Exercice Test',
          category: exLog.exercise?.category,
          progressiveTarget: 'Série Test : Notez votre charge maximale propre (RPE 8-9)',
          sets: (exLog.sets || []).map(() => ({ ...emptySet(), target })),
        };
      });

      setWorkout(loadedWorkout);
      setIsTestWeekModalOpen(false);
      setActiveTab('logger');
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
      showToast('Semaine test passée : le coach IA prend le relais', 'success');
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
      showToast('Semaine test réinitialisée', 'info');
      setIsTestWeekModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('Erreur lors de la réinitialisation', 'error');
    }
  };

  // From the profile: (re)starts the calibration week, also after declining it at sign-up
  const startCalibrationFromProfile = async () => {
    try {
      await api.post('/workout/test-week/reset');
      await fetchData();
      setIsRecalibrateOpen(false);
      setIsTestWeekModalOpen(true);
      showToast('Semaine de calibration activée : 3 séances test', 'success');
    } catch {
      showToast("Impossible d'activer la calibration", 'error');
    }
  };

  // Add Exercise to Active Session
  const addExerciseToSession = async (exercise: any) => {
    // The last performance gives the ghost targets of the new sets
    try {
      const statsRes = await api.get(`/workout/stats/${exercise.id}`);
      rememberStats(exercise.id, statsRes.data);
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
        sets: [emptySet(), emptySet(), emptySet()],
      },
    ]);
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
    // A further set repeats the one just entered, the first one starts empty
    updated[exerciseIndex].sets.push(
      prevSet ? { weight: prevSet.weight, reps: prevSet.reps, completed: false, target: prevSet.target } : emptySet(),
    );
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

  const targetOf = (eIndex: number, sIndex: number) =>
    resolveSetTarget(workout[eIndex], sIndex, exerciseStats[workout[eIndex].exerciseId], profile.goal);

  const toggleSetCompleted = (eIndex: number, sIndex: number) => {
    const updated = [...workout];
    const currentVal = updated[eIndex].sets[sIndex].completed;
    // Fields left empty record their ghost target: the athlete only types what deviated from it
    if (!currentVal) {
      updated[eIndex].sets[sIndex] = fillFromTarget(updated[eIndex].sets[sIndex], targetOf(eIndex, sIndex));
    }
    // A set is validated once its reps are known (the load may be 0, bodyweight)
    if (!currentVal && !(Number(updated[eIndex].sets[sIndex].reps) > 0)) {
      showToast('Indique le nombre de répétitions avant de valider la série', 'error');
      return;
    }
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
    // Only the sets filled in, or with a target to fall back on, can be validated
    const sets = workout[eIndex].sets.map((s, i) => (s.completed ? s : fillFromTarget(s, targetOf(eIndex, i))));
    const unfilled = sets.filter((s) => !s.completed && !(Number(s.reps) > 0)).length;
    if (unfilled === sets.filter((s) => !s.completed).length) {
      showToast('Indique les répétitions de tes séries avant de les valider', 'error');
      return;
    }
    setWorkout((prev) => {
      const copy = [...prev];
      copy[eIndex] = {
        ...copy[eIndex],
        sets: sets.map((s) => (Number(s.reps) > 0 ? { ...s, completed: true } : s)),
      };
      return copy;
    });
    if (unfilled > 0) {
      showToast(`${unfilled} série${unfilled > 1 ? 's' : ''} sans répétitions laissée${unfilled > 1 ? 's' : ''} de côté`, 'info');
      return;
    }
    setFocusedExercise(null);
  };

  const startRestTimer = (autoStart: boolean) => {
    setRestAutoStart(autoStart);
    setRestTimerRun((run) => run + 1);
    setShowRestTimer(true);
  };

  const openExercisePicker = () => {
    setIsPickerOpen(true);
    // Wait for the picker to render, then bring its search field into view
    requestAnimationFrame(() => {
      const section = addExerciseRef.current;
      if (!section) return;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.querySelector('input')?.focus({ preventScroll: true });
    });
  };

  // An exercise already in the session is opened instead of being added a second time
  const pickSessionExercise = (exercise: any) => {
    const index = workout.findIndex((ex) => ex.exerciseId === exercise.id);
    // The picked exercise opens at the top of the session: fold the picker and go back up to it
    setIsPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (index === -1) {
      addExerciseToSession(exercise);
      return;
    }
    setFocusedExercise(index);
    showToast(`${exercise.name} est déjà dans la séance`, 'info');
  };

  const resetActiveSession = () => {
    clearSessionDraft(currentUserId());
    setActiveSessionId(null);
    setActiveRoutineName(null);
    setActiveTestStep(null);
    setWorkout([]);
    setWorkoutStartTime(null);
    prepareSession();
  };

  // Abandon: the session is deleted, nothing of it is kept in the history or the records
  const abandonWorkout = async () => {
    if (!activeSessionId) return;

    try {
      await api.delete(`/workout/session/${activeSessionId}`);
    } catch (err: any) {
      // Already gone on the server: the session can still be closed here
      if (err.response?.status !== 404) {
        showToast("Impossible d'abandonner la séance", 'error');
        return;
      }
    }
    setIsAbandonOpen(false);
    resetActiveSession();
    setActiveTab('dashboard');
    showToast('Séance abandonnée', 'info');
    // A calibration step started and abandoned is available again
    fetchData();
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

      showToast('Séance enregistrée', 'success');
      resetActiveSession();
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
      showToast('Profil enregistré', 'success');
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
      showToast('Profil enregistré, charges de calibration recalculées', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Erreur lors de la sauvegarde du profil', 'error');
    }
  };

  // Open Warmup Modal for an exercise in active workout
  const openWarmupForExercise = (eIndex: number) => {
    const ex = workout[eIndex];
    // Sets start empty: the warm-up builds up to the load entered, else the target, else the one lifted last time
    const targetWeight =
      ex.sets.find((s) => s.weight > 0)?.weight ||
      targetOf(eIndex, 0)?.weight ||
      exerciseStats[ex.exerciseId]?.lastSet?.weight ||
      80;
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
    showToast('Échauffement ajouté à la séance', 'success');
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
    showToast('Historique exporté en CSV');
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
      showToast('Résumé copié dans le presse-papier');
    }).catch(() => {
      showToast('Impossible de copier le résumé', 'error');
    });
  };

  // Open the load calculator, optionally on an exercise of the session and its first set
  const openPlateCalculator = (exercise?: ActiveExercise) => {
    // An empty set opens on its target, else on the calculator's own default for the movement
    const firstSet =
      exercise && exercise.sets[0]
        ? fillFromTarget(exercise.sets[0], resolveSetTarget(exercise, 0, exerciseStats[exercise.exerciseId], profile.goal))
        : undefined;
    setPlateCalcContext({
      exerciseName: exercise?.name || null,
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
  const matchesSearch = createNameMatcher(exerciseSearch);
  const filteredExercises = exercises.filter((ex) => {
    const matchSearch = !matchesSearch || matchesSearch(ex.name);
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
  const remainingExercises = workout.filter((ex, i) => i !== activeExerciseIndex && !isExerciseDone(ex)).length;
  // Dashboard: validated volume of the last 7 days against the 7 days before
  const weekVolume = Number(dashboardStats.weekVolume) || 0;
  const volumeDelta: number | null = typeof dashboardStats.weekVolumeDelta === 'number' ? dashboardStats.weekVolumeDelta : null;
  const overloadTrend = volumeDelta === null ? null : volumeDelta > 2 ? 'up' : volumeDelta < -2 ? 'down' : 'flat';

  const goalName = (GOAL_OPTIONS.find((g) => g.id === (profile.goal || 'BODYBUILDING')) || GOAL_OPTIONS[1]).name.replace(/ \(.*\)/, '');
  const sessionKicker = activeTestStep
    ? `Semaine test · étape ${activeTestStep}/3`
    : `${goalName} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // Render Authentication Screen
  if (!isAuthenticated) {
    const isSignupProfile = !isLoginMode && signupStep === 2;
    const authSubtitle = isLoginMode
      ? 'Chaque séance, un cran plus loin.'
      : signupStep === 1
      ? 'Définissez votre nouveau standard de progression.'
      : signupCalibration
      ? 'Ton profil athlète calibre tes charges de départ et le coach IA.'
      : 'Ton profil athlète règle tes charges de départ et le coach IA.';
    return (
      <div className="auth-shell">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        <main className="auth-main">
          <div className={`auth-center${isLoginMode ? '' : ' is-signup'}`}>
            <header className="auth-brand">
              <span className="auth-mark" aria-hidden="true">
                <Icon name="bolt" size={20} filled strokeWidth={1.4} />
              </span>
              <h1>Overloady</h1>
              <p>{authSubtitle}</p>
            </header>

            <section className="auth-card">
              {isSignupProfile ? (
                <div className="auth-step-head">
                  <span className="auth-step">Étape 2 / 2 · Profil athlète</span>
                  <span className="auth-step-note">Modifiable plus tard</span>
                </div>
              ) : (
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
              )}

              <form onSubmit={handleAuthSubmit} className="auth-form">
                {isSignupProfile ? (
                  <AthleteProfileFields value={signupAthlete} onChange={setSignupAthlete} idPrefix="signup" />
                ) : (
                  <>
                    <div className="auth-field">
                      <label htmlFor="auth-username">Identifiant</label>
                      <input
                        id="auth-username"
                        className="auth-input"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="alex_lifts"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                      />
                      {!isLoginMode && (
                        <span className="auth-hint">3 à 24 caractères : lettres, chiffres, « . », « _ » ou « - ».</span>
                      )}
                    </div>

                    <div className="auth-field">
                      <label htmlFor="auth-password">Mot de passe</label>
                      <div className="auth-input-wrap">
                        <input
                          id="auth-password"
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
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
                          <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                        </button>
                      </div>
                      {!isLoginMode && <span className="auth-hint">6 caractères minimum.</span>}
                    </div>

                    {!isLoginMode && (
                      <div className="auth-field">
                        <label htmlFor="auth-password-confirm">Confirmer le mot de passe</label>
                        <input
                          id="auth-password-confirm"
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••••••"
                          autoComplete="new-password"
                          required
                        />
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
                              aria-pressed={signupGoal === g.id}
                            >
                              <span className="auth-goal-icon">
                                <Icon name={g.icon} size={18} />
                              </span>
                              <span className="auth-goal-name">{g.name.replace(/ \(.*\)/, '')}</span>
                              <span className="auth-goal-badge">{g.badge.split(' • ')[0]}</span>
                            </button>
                          ))}
                        </div>
                        <span className="auth-hint">{GOAL_OPTIONS.find((g) => g.id === signupGoal)?.desc}</span>
                      </div>
                    )}

                    {!isLoginMode && (
                      <div className="auth-field">
                        <label>Semaine de calibration</label>
                        <div className="auth-goal-grid is-two" role="group" aria-label="Semaine de calibration">
                          {[
                            { value: true, icon: 'flask' as IconName, name: 'Avec calibration', badge: '3 séances test' },
                            { value: false, icon: 'bolt' as IconName, name: 'Sans calibration', badge: 'Coach direct' },
                          ].map((option) => (
                            <button
                              type="button"
                              key={option.name}
                              className={`auth-goal-option ${signupCalibration === option.value ? 'selected' : ''}`}
                              onClick={() => setSignupCalibration(option.value)}
                              aria-pressed={signupCalibration === option.value}
                            >
                              <span className="auth-goal-icon">
                                <Icon name={option.icon} size={18} />
                              </span>
                              <span className="auth-goal-name">{option.name}</span>
                              <span className="auth-goal-badge">{option.badge}</span>
                            </button>
                          ))}
                        </div>
                        <span className="auth-hint">
                          {signupCalibration
                            ? '3 séances test pour mesurer tes charges réelles avant que le coach IA programme tes cycles.'
                            : 'Pas de séance test : le coach IA programme tes séances tout de suite à partir de ton profil. Tu pourras toujours faire la calibration plus tard depuis ton Profil.'}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {authError && (
                  <div className="auth-error" role="alert">
                    <Icon name="alert" size={16} />
                    <span>{authError}</span>
                  </div>
                )}

                <button type="submit" className="btn-primary auth-submit" disabled={isAuthLoading}>
                  {isAuthLoading && <span className="auth-spinner" aria-hidden="true" />}
                  {isLoginMode ? 'Se connecter' : signupStep === 1 ? 'Continuer' : 'Créer mon profil'}
                </button>

                {isServerWaking && (
                  <p className="auth-waking" role="status">
                    <span className="auth-waking-dot" aria-hidden="true" />
                    Réveil du serveur… la première connexion peut prendre jusqu'à une minute.
                  </p>
                )}

                {isSignupProfile && (
                  <div className="auth-step-actions">
                    <button type="button" className="btn-ghost" onClick={() => setSignupStep(1)} disabled={isAuthLoading}>
                      Retour
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => submitAuth(false)} disabled={isAuthLoading}>
                      Passer cette étape
                    </button>
                  </div>
                )}
              </form>

              {!isSignupProfile && (
                <p className="auth-switch">
                  {isLoginMode ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
                  <button type="button" onClick={() => switchAuthMode(!isLoginMode)}>
                    {isLoginMode ? 'Créer un profil' : 'Se connecter'}
                  </button>
                </p>
              )}
            </section>

            <div className="auth-signature">
              <span>Surcharge progressive</span>
              <span className="auth-signature-dot" aria-hidden="true" />
              <span>Coach IA</span>
            </div>
          </div>

        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div id={REST_TIDE_ID} className="rest-tide" aria-hidden="true" />
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
        {/* ================= TAB 1: DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div className="home">
            <section className="home-greeting">
              <h1>Bonjour {displayName}</h1>
              <p>
                <span>Cycle {GOAL_CYCLE_LABELS[profile.goal || 'BODYBUILDING'] || 'Hypertrophie'}</span>
                <span aria-hidden="true">·</span>
                <span className="home-date">
                  {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                {testWeekStatus?.testWeekCompleted && !testWeekStatus.testWeekSkipped && (
                  <button type="button" className="home-chip" onClick={() => setIsTestWeekModalOpen(true)}>
                    <Icon name="check" size={12} strokeWidth={2.6} />
                    Profil calibré
                  </button>
                )}
              </p>
            </section>

            {/* Calibration week */}
            {testWeekStatus && !testWeekStatus.testWeekCompleted && (
              <section className="home-card calib-card">
                <div className="home-card-head">
                  <span className="home-card-label">
                    <Icon name="flask" size={15} />
                    Semaine de calibration
                  </span>
                  <span className="home-card-meta">
                    {testWeekStatus.testWeekProgress}/{testWeekStatus.totalSteps} séances
                  </span>
                </div>
                <div>
                  <h2 className="home-card-title">Phase d'évaluation initiale</h2>
                  <p className="home-card-text">3 séances test pour mesurer tes charges de référence avant que le coach IA prenne le relais.</p>
                </div>

                <div className="calib-steps">
                  {testWeekStatus.sessions?.map((sess: any) => {
                    const isCompleted = sess.status === 'completed';
                    const isCurrent = sess.status === 'current';
                    return (
                      <button
                        type="button"
                        key={sess.step}
                        className={`calib-step ${sess.status}`}
                        onClick={() => setIsTestWeekModalOpen(true)}
                      >
                        <span className="calib-step-head">
                          <span className="calib-step-status">
                            {isCompleted ? 'Validée' : isCurrent ? 'En cours' : 'À venir'}
                          </span>
                          <span>{sess.dayName}</span>
                        </span>
                        <span className="calib-step-name">{sess.name}</span>
                        <span className="calib-step-focus">{sess.focus}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="home-actions">
                  <button
                    className="btn-primary"
                    onClick={() => handleStartTestWeekSession(testWeekStatus.currentStep)}
                    disabled={isStartingTestStep || !!activeSessionId}
                  >
                    {!isStartingTestStep && !activeSessionId && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                    {isStartingTestStep
                      ? 'Lancement…'
                      : activeSessionId
                      ? 'Séance déjà en cours'
                      : `Lancer la séance test ${testWeekStatus.currentStep}`}
                  </button>
                  <button className="btn-secondary" onClick={() => setIsTestWeekModalOpen(true)}>
                    <Icon name="clipboard" size={16} />
                    Protocole
                  </button>
                  <button className="text-action" onClick={handleSkipTestWeek} title="Passer directement au Coach IA">
                    Passer
                  </button>
                </div>
              </section>
            )}

            <div className="home-grid">
              <div className="home-col">
                {/* Next session: the AI coach recommendation */}
                <section className="home-section home-next">
                  <div className="home-section-head">
                    <h2>Prochaine séance</h2>
                    <span>
                      {!nextRecommendation
                        ? 'Coach IA'
                        : nextRecommendation.isTestWeek
                        ? `Semaine test · étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps}`
                        : nextRecommendation.aiGenerated
                        ? 'Coach IA'
                        : 'Surcharge calculée'}
                    </span>
                  </div>

                  {nextRecommendation ? (
                    <div className="home-card next-card">
                      <div>
                        <h3 className="next-title">{nextRecommendation.title}</h3>
                        <p className="next-sub">
                          {[
                            nextRecommendation.focusMuscle,
                            nextRecommendation.goalDetails?.repTarget,
                            nextRecommendation.goalDetails?.restTarget && `repos ${nextRecommendation.goalDetails.restTarget}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      {nextRecommendation.exercises?.length > 0 && (
                        <ul className="next-list">
                          {nextRecommendation.exercises.map((ex: any, idx: number) => (
                            <li key={idx} className="next-item">
                              <div className="next-item-text">
                                <p className="next-item-name">{ex.name}</p>
                                <p className="next-item-detail">{describeTarget(ex)}</p>
                              </div>
                              <span className="next-item-sets">{ex.sets?.length || 3} séries</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {(nextRecommendation.rationale ||
                        nextRecommendation.coachingTips?.length > 0 ||
                        nextRecommendation.exercises?.some((ex: any) => ex.reason || ex.targetAdvice)) && (
                        <div className="next-details">
                          <button
                            type="button"
                            className="next-details-toggle"
                            onClick={() => setShowAiExercisesPreview((prev) => !prev)}
                            aria-expanded={showAiExercisesPreview}
                          >
                            <span>Conseils du coach</span>
                            <Icon name={showAiExercisesPreview ? 'chevronUp' : 'chevronDown'} size={16} />
                          </button>

                          {showAiExercisesPreview && (
                            <div className="next-details-body">
                              {nextRecommendation.rationale && <p className="next-rationale">{nextRecommendation.rationale}</p>}
                              {nextRecommendation.coachingTips?.length > 0 && (
                                <ul className="next-tips">
                                  {nextRecommendation.coachingTips.map((tip: string, idx: number) => (
                                    <li key={idx}>{tip}</li>
                                  ))}
                                </ul>
                              )}
                              {nextRecommendation.exercises?.some((ex: any) => ex.reason || ex.targetAdvice) && (
                                <dl className="next-reasons">
                                  {nextRecommendation.exercises
                                    .filter((ex: any) => ex.reason || ex.targetAdvice)
                                    .map((ex: any, idx: number) => (
                                      <div key={idx}>
                                        <dt>{ex.name}</dt>
                                        {ex.targetAdvice && <dd className="next-advice">{ex.targetAdvice}</dd>}
                                        {ex.reason && <dd>{ex.reason}</dd>}
                                      </div>
                                    ))}
                                </dl>
                              )}
                              {nextRecommendation.aiModel && <p className="next-model">{nextRecommendation.aiModel}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="next-actions">
                        <button
                          className="btn-primary"
                          onClick={() => startRecommendedWorkout()}
                          disabled={isStartingRec || !!activeSessionId || isRegeneratingAi}
                        >
                          {!isStartingRec && !activeSessionId && <Icon name="play" size={16} filled strokeWidth={1.5} />}
                          {isStartingRec
                            ? 'Lancement…'
                            : activeSessionId
                            ? 'Séance déjà en cours'
                            : nextRecommendation.isTestWeek
                            ? `Commencer le test (étape ${nextRecommendation.testStep}/${nextRecommendation.totalTestSteps})`
                            : 'Commencer la séance'}
                        </button>
                        {nextRecommendation.isTestWeek ? (
                          <button
                            className="btn-secondary"
                            onClick={() => setIsTestWeekModalOpen(true)}
                            title="Consulter le protocole de la semaine de test"
                          >
                            <Icon name="clipboard" size={16} />
                            Détail des tests
                          </button>
                        ) : (
                          <button
                            className="btn-secondary"
                            onClick={() => setIsRegenerateOpen(true)}
                            disabled={isRegeneratingAi || !!activeSessionId}
                            title="Demander une autre séance générée par l'IA"
                          >
                            <span className={isRegeneratingAi ? 'spin-icon' : ''}>
                              <Icon name="refresh" size={16} />
                            </span>
                            {isRegeneratingAi ? 'Génération…' : 'Régénérer'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="home-card next-card">
                      <div>
                        <h3 className="next-title">Atlas est prêt</h3>
                        <p className="next-sub">Il prépare ta prochaine séance à partir de ton historique et de ton objectif.</p>
                      </div>
                      <div className="next-actions">
                        <button className="btn-primary" onClick={() => regenerateAiRecommendation()} disabled={isRegeneratingAi}>
                          <span className={isRegeneratingAi ? 'spin-icon' : ''}>
                            <Icon name="sparkle" size={16} />
                          </span>
                          {isRegeneratingAi ? 'Génération…' : 'Générer ma séance'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* Programs: one tap to start */}
                <section className="home-section home-programs">
                  <div className="home-section-head">
                    <h2>Tes programmes</h2>
                    {routines.length > HERO_PROGRAMS_MOBILE ? (
                      <button className="link-btn" onClick={() => setActiveTab('routines')}>
                        Tout voir ({routines.length})
                      </button>
                    ) : (
                      <span>{routines.length}</span>
                    )}
                  </div>
                  <div className="home-card programs-card">
                    {routines.length > 0 ? (
                      <div className="program-list">
                        {routines.slice(0, HERO_PROGRAMS_MAX).map((rt) => (
                          <button key={rt.id} className="program-row" onClick={() => startRoutineWorkout(rt)} title={`Lancer ${rt.name}`}>
                            <span className="program-row-name">{rt.name}</span>
                            <span className="program-row-meta">{rt.exercises?.length || 0} exercice{(rt.exercises?.length || 0) > 1 ? 's' : ''}</span>
                            <Icon name="play" size={14} filled strokeWidth={1.5} className="program-row-play" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="home-card-text">Aucun programme pour l'instant. Crée tes séances types (Push, Pull, Legs…) pour les lancer en un geste.</p>
                    )}
                    <div className="home-actions">
                      <button className="btn-secondary" onClick={startNewWorkout}>
                        <Icon name="plus" size={16} />
                        Séance libre
                      </button>
                      <button className="btn-secondary" onClick={() => setIsRoutineModalOpen(true)}>
                        <Icon name="plus" size={16} />
                        Nouveau programme
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <div className="home-col">
                {/* Progressive overload: this week's validated volume against the week before */}
                <section className="home-card overload-card">
                  <div className="home-card-head">
                    <span className="home-card-label">Surcharge progressive</span>
                    {overloadTrend && (
                      <span className={`trend-chip is-${overloadTrend}`}>
                        <Icon name={overloadTrend === 'down' ? 'activity' : 'trendingUp'} size={14} />
                        {overloadTrend === 'up' ? 'En hausse' : overloadTrend === 'down' ? 'En baisse' : 'Stable'}
                      </span>
                    )}
                  </div>
                  <div className="overload-value">
                    {volumeDelta !== null ? (
                      <>
                        <strong>
                          {volumeDelta > 0 ? '+' : ''}
                          {volumeDelta.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                        </strong>
                        <span>vs semaine dernière</span>
                      </>
                    ) : (
                      <>
                        <strong>{weekVolume > 0 ? weekVolume.toLocaleString('fr-FR') : '—'}</strong>
                        <span>{weekVolume > 0 ? 'kg cette semaine' : 'à mesurer'}</span>
                      </>
                    )}
                  </div>
                  <p className="home-card-text">
                    {volumeDelta !== null
                      ? `${weekVolume.toLocaleString('fr-FR')} kg validés sur les 7 derniers jours, contre ${Number(
                          dashboardStats.previousWeekVolume || 0,
                        ).toLocaleString('fr-FR')} kg la semaine précédente.`
                      : weekVolume > 0
                      ? 'Pas encore de semaine précédente à comparer : la tendance apparaîtra la semaine prochaine.'
                      : 'Termine une séance pour commencer à mesurer ta progression.'}
                  </p>
                </section>

                {/* Weekly summary */}
                <section className="home-section home-week">
                  <div className="home-section-head">
                    <h2>Résumé hebdomadaire</h2>
                  </div>
                  <div className="home-card week-card">
                  <div className="week-grid">
                    <div className="week-stat">
                      <span className="week-stat-label">Séances</span>
                      <div>
                        <span className="week-stat-value">{dashboardStats.workoutsThisWeek ?? 0}</span>
                        <p className="week-stat-foot">7 derniers jours</p>
                      </div>
                    </div>
                    <div className="week-stat">
                      <span className="week-stat-label">Volume</span>
                      <div>
                        <span className="week-stat-value">
                          {weekVolume.toLocaleString('fr-FR')}
                          <small>kg</small>
                        </span>
                        <p className="week-stat-foot">Tonnage validé</p>
                      </div>
                    </div>
                    <div className="week-stat">
                      <span className="week-stat-label">Poids corporel</span>
                      <div>
                        <span className="week-stat-value">
                          {profile.weight || '—'}
                          <small>kg</small>
                        </span>
                        <p className="week-stat-foot">Dernière pesée</p>
                      </div>
                    </div>
                    <div className="week-stat">
                      <span className="week-stat-label">IMC</span>
                      <div>
                        <span className="week-stat-value">{bmi ? bmi.toLocaleString('fr-FR') : '—'}</span>
                        <p className={`week-stat-foot${bmi && bmi < 25 ? ' is-good' : ''}`}>
                          {bmi ? (bmi < 25 ? 'Corpulence normale' : 'Surpoids') : 'Taille et poids requis'}
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>
                </section>
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
                    <Icon name="flask" size={16} />
                    <p>
                      <strong>Séance test.</strong> Donne le maximum avec une technique propre : tes charges réelles
                      calibrent tes prochains cycles.
                    </p>
                    <button className="text-action" onClick={() => setIsTestWeekModalOpen(true)}>
                      Protocole
                    </button>
                  </div>
                )}

                {/* Session header: what is running and how to end it */}
                <header className="session-head">
                  <div className="session-head-text">
                    <h1>{activeRoutineName || 'Séance libre'}</h1>
                    <p className="session-kicker">
                      <span className="session-kicker-dot" aria-hidden="true" />
                      <span>En cours · {sessionKicker}</span>
                    </p>
                  </div>
                  <div className="session-head-actions">
                    {!showRestTimer && (
                      <button
                        className="btn-secondary"
                        onClick={() => startRestTimer(false)}
                        title="Ouvrir le chronomètre de repos"
                        aria-label="Ouvrir le chronomètre de repos"
                      >
                        <Icon name="hourglass" size={16} />
                        <span className="btn-label">Repos</span>
                      </button>
                    )}
                    <button className="btn-secondary" onClick={openExercisePicker} aria-label="Ajouter un exercice" title="Ajouter un exercice">
                      <Icon name="plus" size={16} />
                      <span className="btn-label">Exercice</span>
                    </button>
                    <button
                      className="btn-icon is-danger"
                      onClick={() => setIsAbandonOpen(true)}
                      aria-label="Abandonner la séance"
                      title="Abandonner la séance"
                    >
                      <Icon name="close" size={18} />
                    </button>
                    <button className="btn-primary" onClick={finishWorkout}>
                      Terminer
                      <Icon name="check" size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </header>

                {/* Three key figures */}
                <div className="session-stats">
                  <div className="session-stat">
                    <span className="session-stat-label">Durée</span>
                    <span className="session-stat-value">{formatDuration(elapsedSeconds)}</span>
                  </div>
                  <div className="session-stat">
                    <span className="session-stat-label">Volume</span>
                    <span className="session-stat-value">
                      {sessionVolume.toLocaleString('fr-FR')}
                      <small>kg</small>
                    </span>
                  </div>
                  <div className="session-stat">
                    <span className="session-stat-label">Séries</span>
                    <span className="session-stat-value is-accent">
                      {completedSets}
                      <small>/ {totalSets}</small>
                    </span>
                  </div>
                </div>

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
                        goal={profile.goal}
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
                      <div className="session-empty">
                        <h3>Ta séance est prête</h3>
                        <p>Choisis un premier exercice ci-dessous pour commencer à noter tes séries.</p>
                      </div>
                    )}

                    {/* Rest of the session */}
                    {workout.length > 1 && (
                      <section className="session-queue">
                        <div className="session-section-head">
                          <span className="eyebrow">Suite du programme</span>
                          <span className="session-section-count">
                            {remainingExercises} {remainingExercises > 1 ? 'restants' : 'restant'}
                          </span>
                        </div>
                        <div className="queue-list">
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
                                title={isDone ? 'Revoir cet exercice' : 'Ouvrir cet exercice'}
                              >
                                <span className="queue-index">{eIndex + 1}</span>
                                <span className="queue-name">{ex.name}</span>
                                <span className="queue-detail">
                                  {isDone ? (
                                    <>
                                      <Icon name="check" size={13} strokeWidth={2.6} />
                                      Terminé
                                    </>
                                  ) : doneSets > 0 ? (
                                    `${doneSets}/${ex.sets.length} séries`
                                  ) : (
                                    describeSets(ex)
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Add Exercise */}
                    <section className="session-block session-picker" ref={addExerciseRef}>
                      {isPickerOpen || workout.length === 0 ? (
                        <>
                          <div className="session-section-head">
                            <span className="eyebrow">Ajouter un exercice</span>
                            <div className="session-picker-links">
                              <button className="link-btn" onClick={() => setIsAddExerciseOpen(true)}>
                                Exercice personnalisé
                              </button>
                              {workout.length > 0 && (
                                <button className="link-btn is-muted" onClick={() => setIsPickerOpen(false)}>
                                  Fermer
                                </button>
                              )}
                            </div>
                          </div>
                          <ExercisePicker
                            exercises={exercises}
                            selectedIds={workout.map((ex) => ex.exerciseId)}
                            onPick={pickSessionExercise}
                          />
                        </>
                      ) : (
                        <button type="button" className="session-picker-open" onClick={openExercisePicker}>
                          <Icon name="plus" size={16} />
                          Ajouter un exercice
                        </button>
                      )}
                    </section>

                    {/* Session Feedback & Notes */}
                    <section className="session-block">
                      <div className="session-section-head">
                        <span className="eyebrow">Effort perçu de la séance (RPE)</span>
                        <span className="session-section-count">{sessionRpe}/10</span>
                      </div>
                      <div className="rpe-selector" role="group" aria-label="RPE de la séance">
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

                      <div className="form-group session-notes">
                        <label htmlFor="session-notes">Tes notes (facultatif)</label>
                        <input
                          id="session-notes"
                          type="text"
                          className="input-glass"
                          placeholder="Sensations, forme… ex : barre facile à 80 kg"
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                        />
                      </div>
                    </section>

                    <button className="btn-primary session-finish" onClick={finishWorkout}>
                      Terminer et enregistrer
                      <Icon name="check" size={16} strokeWidth={2.4} />
                    </button>
                    <button className="btn-ghost session-abandon" onClick={() => setIsAbandonOpen(true)}>
                      Abandonner la séance
                    </button>
                  </div>

                  <aside className="session-side" aria-label="Analyse de la séance">
                    {activeExercise && <RecordCard exercise={activeExercise} stats={exerciseStats[activeExercise.exerciseId]} />}
                    <MuscleFocusCard exercises={workout} />
                    {sessionTips.length > 0 && (
                      <section className="glass-panel coach-tips">
                        <div className="coach-tips-head">
                          <Icon name="lightbulb" size={16} />
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
                    <h1>Séance</h1>
                    <p>Démarre une séance libre, lance un programme ou demande une séance à Atlas.</p>
                  </div>
                  <div className="header-actions">
                    <button className="btn-secondary" onClick={() => setActiveTab('routines')}>
                      Choisir un programme
                    </button>
                    <button className="btn-primary" onClick={startNewWorkout}>
                      <Icon name="plus" size={16} strokeWidth={2.4} />
                      Séance libre
                    </button>
                  </div>
                </div>

                <div className="logger-idle">
                  <CoachChat
                    onStartWorkout={(coachWorkout) => startRecommendedWorkout(coachWorkout)}
                    onSaveRoutine={saveCoachWorkoutAsRoutine}
                    onError={(text) => showToast(text, 'error')}
                  />
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
                <h1>Programmes</h1>
                <p>Tes séances types, prêtes à lancer en un geste.</p>
              </div>
              <button className="btn-primary" onClick={() => setIsRoutineModalOpen(true)}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Nouveau programme
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

                    <p className="routine-card-count">{rt.exercises?.length || 0} exercice{(rt.exercises?.length || 0) > 1 ? 's' : ''}</p>

                    <div className="routine-ex-list">
                      {(rt.exercises || []).map((ex: any) => (
                        <div key={ex.id} className="routine-ex-row">
                          <span>{ex.name}</span>
                          <span className="routine-ex-cat">{ex.category || 'Général'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="btn-secondary routine-launch" onClick={() => startRoutineWorkout(rt)}>
                    <Icon name="play" size={14} filled strokeWidth={1.5} />
                    Lancer la séance
                  </button>
                </div>
              ))}
            </div>

            {routines.length === 0 && (
              <div className="glass-panel empty-panel">
                <span className="empty-panel-icon">
                  <Icon name="clipboard" size={26} />
                </span>
                <h3>Aucun programme pour l'instant</h3>
                <p>Un programme pré-remplit ta séance avec ses exercices ; les charges suivent ta surcharge progressive.</p>
                <button className="btn-primary" onClick={() => setIsRoutineModalOpen(true)}>
                  <Icon name="plus" size={18} strokeWidth={2.4} />
                  Créer un programme
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
                <h1>Historique</h1>
                <p>Tes séances passées, série par série.</p>
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
                      <button
                        className="btn-small"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : session.id)}
                        aria-expanded={isExpanded}
                      >
                        Détails
                        <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => shareSession(session)}
                        title="Copier le résumé de la séance"
                        aria-label="Copier le résumé de la séance"
                      >
                        <Icon name="share" size={17} />
                      </button>
                      <button
                        className="btn-icon is-danger"
                        onClick={() => handleDeleteSession(session.id)}
                        title="Supprimer la séance"
                        aria-label="Supprimer la séance"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>

                  {session.notes && <p className="history-notes">« {session.notes} »</p>}

                  {/* Expanded Exercise and Sets view */}
                  {isExpanded && (
                    <div className="history-details">
                      {session.exercises?.length > 0 ? (
                        session.exercises.map((exLog: any) => (
                          <div key={exLog.id} className="history-exercise">
                            <div className="history-exercise-head">
                              <strong>{exLog.exercise?.name || 'Exercice'}</strong>
                              <span>{exLog.exercise?.category || 'Général'}</span>
                            </div>

                            <div className="history-sets">
                              {exLog.sets?.map((st: any, idx: number) => (
                                <span
                                  key={st.id || idx}
                                  className={`history-set${st.completed ? ' is-done' : ''}`}
                                  title={st.completed ? 'Série validée' : 'Série non validée'}
                                >
                                  {formatKg(Number(st.weight) || 0)} × {st.reps}
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
                <h3>Aucune séance pour l'instant</h3>
                <p>Tes séances terminées apparaîtront ici, série par série.</p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: EXERCISES ================= */}
        {activeTab === 'exercises' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Exercices</h1>
                <p>Tes records et la prochaine charge conseillée, exercice par exercice.</p>
              </div>
              <button className="btn-primary" onClick={() => setIsAddExerciseOpen(true)}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Nouvel exercice
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
                placeholder="Rechercher un exercice"
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
                  className="exercise-card"
                  onClick={() => setSelectedExerciseIdForModal(ex.id)}
                >
                  <span className="exercise-card-name">{ex.name}</span>
                  <span className="exercise-card-cat">{ex.category || 'Général'}</span>
                  <Icon name="chevronRight" size={16} className="exercise-card-icon" />
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
              <p className="muted-note empty-note">Aucun exercice ne correspond à ta recherche.</p>
            )}
          </div>
        )}

        {/* ================= TAB 6: PROFILE ================= */}
        {activeTab === 'profile' && (
          <div>
            <div className="header flex-between">
              <div>
                <h1>Profil</h1>
                <p>Tes mensurations, ton objectif et tes réglages.</p>
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
                  <p className="profile-bmi">
                    <span>IMC</span>
                    <strong>{bmi.toLocaleString('fr-FR')} kg/m²</strong>
                    <span>
                      {bmi < 18.5
                        ? 'Insuffisance pondérale'
                        : bmi < 25
                        ? 'Corpulence normale'
                        : bmi < 30
                        ? 'Surpoids'
                        : 'Obésité'}
                    </span>
                  </p>
                )}

                <div className="form-group profile-goal">
                  <label>Objectif</label>
                  <p className="profile-goal-help">Il règle les charges, répétitions et temps de repos de tes prochaines séances.</p>
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
                          <span className="goal-card-radio" aria-hidden="true" />
                          <span className="goal-card-content">
                            <span className="goal-card-title">{g.name}</span>
                            <span className="goal-card-specs">
                              {g.badge} · {g.rest}
                            </span>
                            <span className="goal-card-desc">{g.desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {testWeekStatus && (
                  <div className="form-group">
                    <label>Semaine de calibration</label>
                    <div className="highlight-box profile-calibration">
                      <div className="profile-calibration-text">
                        <strong>
                          {testWeekStatus.testWeekSkipped
                            ? 'Non faite'
                            : testWeekStatus.testWeekCompleted
                            ? 'Calibration terminée'
                            : `En cours · étape ${testWeekStatus.currentStep}/${testWeekStatus.totalSteps}`}
                        </strong>
                        <p>
                          {testWeekStatus.testWeekSkipped
                            ? '3 séances test pour mesurer tes charges réelles et affiner les séances du coach IA.'
                            : testWeekStatus.testWeekCompleted
                            ? 'Tes charges de référence sont mesurées. Tu peux refaire les tests après une longue pause ou un gros progrès.'
                            : 'Termine les séances test pour que le coach IA programme tes cycles sur tes vraies charges.'}
                        </p>
                      </div>
                      {testWeekStatus.testWeekSkipped ? (
                        <button type="button" className="btn-secondary" onClick={startCalibrationFromProfile}>
                          Faire la calibration
                        </button>
                      ) : testWeekStatus.testWeekCompleted ? (
                        <button type="button" className="btn-secondary" onClick={() => setIsRecalibrateOpen(true)}>
                          Refaire la calibration
                        </button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={() => setIsTestWeekModalOpen(true)}>
                          Voir le protocole
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={autoRestEnabled}
                      onChange={(e) => setAutoRestEnabled(e.target.checked)}
                    />
                    <span>Lancer le chronomètre de repos à chaque série validée</span>
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
          showToast(`Exercice « ${newEx.name} » créé`);
        }}
      />

      <ConfirmDialog
        isOpen={isAbandonOpen && activeSessionId !== null}
        tone="danger"
        icon="flag"
        title="Abandonner la séance ?"
        message="Elle sera supprimée : rien n'ira dans ton historique, tes records ni ta progression."
        confirmLabel="Abandonner"
        cancelLabel="Continuer la séance"
        onConfirm={abandonWorkout}
        onCancel={() => setIsAbandonOpen(false)}
      >
        <div className="confirm-dialog-stats">
          <div>
            <span>Durée</span>
            <strong>{formatDuration(elapsedSeconds)}</strong>
          </div>
          <div>
            <span>Séries</span>
            <strong>
              {completedSets}/{totalSets}
            </strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{sessionVolume.toLocaleString('fr-FR')} kg</strong>
          </div>
        </div>
      </ConfirmDialog>

      <RegenerateModal
        isOpen={isRegenerateOpen}
        sessionTitle={nextRecommendation?.title}
        onClose={() => setIsRegenerateOpen(false)}
        onSubmit={regenerateAiRecommendation}
      />

      <ConfirmDialog
        isOpen={isRecalibrateOpen}
        icon="flask"
        title="Refaire la calibration ?"
        message="Tes 3 séances test reviennent dans tes prochaines séances. Ton historique et tes records restent intacts."
        confirmLabel="Refaire la calibration"
        onConfirm={startCalibrationFromProfile}
        onCancel={() => setIsRecalibrateOpen(false)}
      />

      {resumeDraft && (
        <ConfirmDialog
          isOpen
          icon="history"
          initialFocus="confirm"
          title="Reprendre ta séance ?"
          message={`« ${resumeDraft.routineName || 'Séance libre'} » est restée ouverte. Reprends là où tu en étais.`}
          confirmLabel="Reprendre"
          cancelLabel="Abandonner"
          onConfirm={() => resumeSession(resumeDraft)}
          onCancel={() => {
            // Abandon goes through its own confirmation, from inside the restored session
            resumeSession(resumeDraft);
            setIsAbandonOpen(true);
          }}
        >
          <div className="confirm-dialog-stats">
            <div>
              <span>Commencée</span>
              <strong>{formatDraftStart(resumeDraft.startedAt)}</strong>
            </div>
            <div>
              <span>Séries</span>
              <strong>
                {resumeDraft.workout.reduce((n, ex) => n + ex.sets.filter((s) => s.completed).length, 0)}/
                {resumeDraft.workout.reduce((n, ex) => n + ex.sets.length, 0)}
              </strong>
            </div>
            <div>
              <span>Exercices</span>
              <strong>{resumeDraft.workout.length}</strong>
            </div>
          </div>
        </ConfirmDialog>
      )}

      <RoutineModal
        isOpen={isRoutineModalOpen}
        onClose={() => setIsRoutineModalOpen(false)}
        exercises={exercises}
        onSuccess={(newRoutine) => {
          setRoutines([...routines, newRoutine]);
          showToast(`Programme « ${newRoutine.name} » enregistré`);
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
