import React, { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import api, { clearToken, hasValidToken, onUnauthorized, setToken, warmUpBackend } from './api';
import './App.css';
import './shell.css';
import './components.css';
import './motion.css';
import { REST_TIDE_ID, RestTimer } from './components/RestTimer';
import { PlateCalculatorModal } from './components/PlateCalculatorModal';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { PainNotes } from './components/PainNotes';
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
import { GymFocus } from './components/GymFocus';
import { ReplaceExerciseModal } from './components/ReplaceExerciseModal';
import { SetTypeSheet } from './components/SetTypeSheet';
import { newSupersetId, nextInRound, nextInSuperset, normalizeSupersets, runOf, segmentBySuperset, supersetLabels } from './lib/supersets';
import { ConsistencyHeatmap } from './components/ConsistencyHeatmap';
import { GlossaryTerm } from './components/Glossary';
import { RPE_MEANINGS } from './lib/rpe';
import { RecapModal } from './components/RecapModal';
import { readHighContrast, setHighContrast } from './lib/contrast';
import {
  AthleteProfileFields,
  toAthleteProfilePayload,
  toAthleteProfileValue,
  type AthleteProfileValue,
} from './components/AthleteProfileFields';
import { detectEquipment, formatKg } from './lib/loadMath';
import { HAPTICS, useWakeLock, vibrate } from './lib/device';
import {
  describeGap,
  describeOverload,
  fillFromTarget,
  resolveSetTarget,
  toTarget,
  topSet,
  type OverloadSummary,
  type SetTarget,
} from './lib/overload';
import { rankExercises } from './lib/exerciseSearch';
import { displayName as exerciseLabel, frenchifyText, rememberCatalog } from './lib/exerciseNames';
import { ExerciseName } from './components/ExerciseName';
import { SET_TYPE_LABELS, drivesTarget, isWorkSet, markOf, typeOf, type SetType } from './lib/setTypes';
import {
  clearSessionDraft,
  currentUserId,
  loadSessionDraft,
  saveSessionDraft,
  type SessionDraft,
} from './lib/sessionDraft';
import { getSyncState, isNetworkError, useSyncState } from './lib/connectivity';
import {
  flushPendingFinishes,
  isOfflineSessionId,
  newOfflineSessionId,
  pendingFinishes,
  queueFinish,
  refreshPendingCount,
  type FinishPayload,
} from './lib/offlineQueue';

type GoalId = 'FORCE' | 'BODYBUILDING' | 'ENDURANCE' | 'HEALTH';

// First screen: what the app does, for someone who has never heard of it
const AUTH_PROMISES = [
  'Note tes séries en salle, d’une main',
  'Monte tes charges sans rien calculer',
  'Gratuit et en français, avec Atlas, ton coach IA',
];

const GOAL_OPTIONS: {
  id: GoalId;
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
    desc: 'Peu de reps, des charges lourdes, sur les grands mouvements : squat, développé, soulevé de terre.',
  },
  {
    id: 'BODYBUILDING',
    name: 'Bodybuilding (Hypertrophie)',
    icon: 'dumbbell',
    badge: '8-12 reps • 70-75% 1RM',
    rest: 'Repos 75-90s',
    desc: 'Des séries de 8 à 12 reps pour prendre du muscle.',
  },
  {
    id: 'ENDURANCE',
    name: 'Endurance Musculaire',
    icon: 'activity',
    badge: '15-20 reps • 50-60% 1RM',
    rest: 'Repos 30-45s',
    desc: 'Des séries longues et des repos courts pour tenir plus longtemps.',
  },
  {
    id: 'HEALTH',
    name: 'Santé & Forme',
    icon: 'heart',
    badge: '12-15 reps • RPE 6',
    rest: 'Repos 60s',
    desc: 'Te renforcer et bouger mieux sans te mettre dans le rouge : tu gardes toujours de la marge, jamais jusqu’à l’échec.',
  },
];

const DEFAULT_REST_SECONDS = 90;

// Planned sets summary for the session queue, e.g. "3 × 10 · 20 kg".
/** A set with nothing entered yet: sessions start empty, the athlete logs what they actually lift. */
const emptySet = (): ActiveSet => ({ weight: 0, reps: 0, completed: false });

/** Who planned a recommended session: the calibration protocol, Atlas, or the local engine. */
const recommendationSource = (rec: any) =>
  rec.isTestWeek ? 'protocol' : rec.aiGenerated || !('aiModel' in rec) ? 'atlas' : 'engine';

/**
 * One exercise of a recommended session, ready to log: the recommended loads become the ghost
 * values of its empty sets. `exLog` is the server's copy when the session started online.
 */
const fromRecommendation = (rec: any, recEx: any, exLog?: any): ActiveExercise => {
  const planned = recEx?.sets ?? [];
  const count = exLog ? (exLog.sets || []).length : planned.length || 3;
  return {
    exerciseId: exLog?.exerciseId ?? recEx.exerciseId,
    name: exLog?.exercise?.name || recEx?.name || 'Exercice',
    category: exLog?.exercise?.category || recEx?.category,
    progressiveTarget:
      recEx?.targetAdvice ||
      (rec.goalDetails ? `${rec.goalDetails.label || ''} : ${rec.goalDetails.repTarget || ''}` : undefined),
    source: recommendationSource(rec),
    sets: Array.from({ length: count }, (_, i) => ({
      ...emptySet(),
      target: toTarget(planned[Math.min(i, planned.length - 1)]),
    })),
  };
};

const describeSets = (exercise: ActiveExercise) => {
  // The work sets: a warm-up added ahead doesn't change what the exercise asks
  const work = exercise.sets.filter(drivesTarget);
  const count = work.length;
  const first = work[0];
  if (exercise.sets.length === 0) return 'Aucune série prévue';
  if (count === 0) return `${exercise.sets.length} série${exercise.sets.length > 1 ? 's' : ''} d'échauffement`;
  // Sets start empty: the planned target stands in until the athlete logs the first one
  const reps = first?.reps || first?.target?.reps || 0;
  const weight = first?.weight || first?.target?.weight || 0;
  if (!reps) return `${count} série${count > 1 ? 's' : ''}`;
  return `${count} × ${reps}${weight > 0 ? ` · ${formatKg(weight)} kg` : ''}`;
};

// Training cycle named on the dashboard greeting ("Cycle Hypertrophie").
const GOAL_CYCLE_LABELS: Record<string, string> = {
  FORCE: 'Force',
  BODYBUILDING: 'Hypertrophie',
  ENDURANCE: 'Endurance',
  HEALTH: 'Santé',
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

// Key lifts of the "Aujourd'hui" card: their target and the gap with last time
const TODAY_KEY_LIFTS = 3;
// A slow gym network shouldn't freeze the start of a session: past this, it starts on the device
const START_TIMEOUT_MS = 10_000;
const FINISH_TIMEOUT_MS = 20_000;

// Session layout picked by the athlete, kept on the device: the set table, or one exercise per screen
type SessionView = 'list' | 'gym';
const SESSION_VIEW_KEY = 'overloady.sessionView';
// A device that once signed in opens on "Connexion"; a new one on "Inscription"
const SIGNED_IN_KEY = 'overloady.hasSignedIn';
const hasSignedInHere = () => {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
};
const rememberSignedInHere = () => {
  try {
    localStorage.setItem(SIGNED_IN_KEY, '1');
  } catch {
    // Private mode: the next visit opens on sign-up, nothing worse
  }
};

/** What the sign-in and sign-up fields ask, said under the field instead of the browser bubble. */
type AuthFieldErrors = Partial<Record<'username' | 'password' | 'confirm', string>>;
// Same rules as the API (auth.service.ts), which lowercases the identifiant first
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,24}$/;
const MIN_PASSWORD_LENGTH = 6;

const readSessionView = (): SessionView => {
  try {
    return localStorage.getItem(SESSION_VIEW_KEY) === 'gym' ? 'gym' : 'list';
  } catch {
    return 'list';
  }
};

const LIBRARY_PAGE_SIZE = 60;
// Programs shown as quick-launch buttons on the dashboard welcome card
// (phones only display the first HERO_PROGRAMS_MOBILE, see .program-row in shell.css).
const HERO_PROGRAMS_MAX = 6;
const HERO_PROGRAMS_MOBILE = 3;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasValidToken);
  const [isLoginMode, setIsLoginMode] = useState(hasSignedInHere);
  const [authFieldErrors, setAuthFieldErrors] = useState<AuthFieldErrors>({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [signupGoal, setSignupGoal] = useState<GoalId>('BODYBUILDING');
  // Calibration week offered at sign-up, never assumed: it can also be started later from the profile
  const [signupCalibration, setSignupCalibration] = useState<boolean>(false);
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
  // Programme of the running session: a session started offline is linked to it on sync
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
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
  // A second tap on "Terminer" while the first one is on its way does nothing
  const finishingRef = useRef(false);
  // Stats fetched ahead for offline use, once per exercise and app launch
  const prefetchedStats = useRef(new Set<string>());
  const syncState = useSyncState();
  // Coaching cues of the running session (AI tips, coach notes or test protocol).
  const [sessionTips, setSessionTips] = useState<string[]>([]);
  const addExerciseRef = useRef<HTMLElement>(null);
  const [isAbandonOpen, setIsAbandonOpen] = useState<boolean>(false);
  // The exercise picker stays folded during a session until the athlete asks for it
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  // Set whose type is being picked in the sheet
  const [typingSet, setTypingSet] = useState<{ eIndex: number; sIndex: number } | null>(null);
  // Exercise whose machine is taken, while its replacement is being chosen
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  // Equivalent picked for an exercise with validated sets: those sets are dropped once confirmed
  const [pendingReplacement, setPendingReplacement] = useState<any | null>(null);
  const [isRecalibrateOpen, setIsRecalibrateOpen] = useState<boolean>(false);
  // Session left open when the app was closed, offered back on the next launch
  const [resumeDraft, setResumeDraft] = useState<SessionDraft | null>(null);
  const [sessionView, setSessionView] = useState<SessionView>(readSessionView);

  const changeSessionView = (view: SessionView) => {
    setSessionView(view);
    try {
      localStorage.setItem(SESSION_VIEW_KEY, view);
    } catch {
      // Storage unavailable: the choice lasts until the app is closed.
    }
  };

  // Rest Timer State
  const [showRestTimer, setShowRestTimer] = useState<boolean>(false);
  // Last duration picked in the timer, reused when a validated set starts the rest.
  const [restDuration, setRestDuration] = useState<number>(DEFAULT_REST_SECONDS);
  const [restAutoStart, setRestAutoStart] = useState<boolean>(false);
  // Remounts the timer so each validated set starts a fresh countdown.
  const [restTimerRun, setRestTimerRun] = useState<number>(0);
  const [autoRestEnabled, setAutoRestEnabled] = useState<boolean>(true);
  // Device setting: brighter ink and firmer hairlines for bright gyms and outdoor sessions
  const [highContrast, setHighContrastState] = useState<boolean>(readHighContrast);

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
  // The category whose variants the athlete asked to see; any other category stays tidy
  const [variantsCategory, setVariantsCategory] = useState<string | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Expanded History cards
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  // Finished session shown as a shareable story card
  const [recapSession, setRecapSession] = useState<any>(null);

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
          ? data.previousSets.map((s: any) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, type: typeOf(s) }))
          : [],
        lastRpe: Number(data?.lastRpe) || null,
        lastDate: typeof data?.lastDate === 'string' ? data.lastDate : null,
      },
    }));
  };

  const loadStats = (exerciseId: string) => {
    if (!exerciseId || requestedStats.current.has(exerciseId)) return;
    requestedStats.current.add(exerciseId);
    api
      .get(`/workout/stats/${exerciseId}`)
      .then((res) => rememberStats(exerciseId, res.data))
      // Allow a retry the next time this exercise is shown.
      .catch(() => requestedStats.current.delete(exerciseId));
  };

  useEffect(() => {
    if (activeExerciseId) loadStats(activeExerciseId);
  }, [activeExerciseId]);

  // The "Aujourd'hui" card compares the key lifts of the next session with last time
  useEffect(() => {
    (nextRecommendation?.exercises || [])
      .slice(0, TODAY_KEY_LIFTS)
      .forEach((ex: any) => typeof ex.exerciseId === 'string' && loadStats(ex.exerciseId));
  }, [nextRecommendation]);

  // Offline in the gym, targets come from the stats kept on the device: fetched ahead, gently,
  // for the exercises of the next session and of the programmes
  useEffect(() => {
    if (!isAuthenticated || !syncState.online) return;
    const ids = new Set<string>();
    (nextRecommendation?.exercises || []).forEach((ex: any) => typeof ex.exerciseId === 'string' && ids.add(ex.exerciseId));
    routines.forEach((routine: any) => (routine.exercises || []).forEach((ex: any) => typeof ex?.id === 'string' && ids.add(ex.id)));
    // Once per exercise and app launch: the service worker keeps the answer for offline use
    const toFetch = Array.from(ids)
      .filter((id) => !prefetchedStats.current.has(id))
      .slice(0, 40);
    const timers = toFetch.map((id, i) =>
      window.setTimeout(() => {
        prefetchedStats.current.add(id);
        loadStats(id);
      }, 3000 + i * 250),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [isAuthenticated, nextRecommendation, routines, syncState.online]);

  // A session keeps the screen on: the phone lies on the bench between two sets
  useWakeLock(activeSessionId !== null);

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
      routineId: activeRoutineId,
      testStep: activeTestStep,
      workout,
      notes: sessionNotes,
      rpe: sessionRpe,
      startedAt: workoutStartTime.toISOString(),
      tips: sessionTips,
    });
  }, [activeSessionId, activeRoutineName, activeRoutineId, activeTestStep, workout, sessionNotes, sessionRpe, workoutStartTime, sessionTips]);

  // A session saved on the device is offered back, unless it was finished or deleted meanwhile
  const checkSessionDraft = async () => {
    const userId = currentUserId();
    const draft = userId ? loadSessionDraft(userId) : null;
    if (!draft) return;
    // Started offline: the server only hears of it when it is finished
    if (isOfflineSessionId(draft.sessionId)) {
      setResumeDraft(draft);
      return;
    }
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
    setActiveRoutineId(draft.routineId ?? null);
    setActiveTestStep(draft.testStep);
    setWorkout(draft.workout);
    setSessionNotes(draft.notes);
    setSessionRpe(draft.rpe);
    setWorkoutStartTime(new Date(draft.startedAt));
    setActiveTab('logger');
    setResumeDraft(null);
  };

  // Sessions finished without network go out as soon as the server answers again
  const syncPendingSessions = async () => {
    const sent = await flushPendingFinishes(currentUserId());
    if (sent === 0) return;
    requestedStats.current.clear();
    setExerciseStats({});
    showToast(`${sent} séance${sent > 1 ? 's envoyées' : ' envoyée'} : ton historique est à jour`, 'success');
    fetchData();
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshPendingCount(currentUserId());
    syncPendingSessions();
    const onOnline = () => syncPendingSessions();
    const onVisible = () => document.visibilityState === 'visible' && syncPendingSessions();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    // navigator.onLine can miss the network coming back: a quiet retry while sessions wait
    const retry = window.setInterval(() => getSyncState().pending > 0 && syncPendingSessions(), 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(retry);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      rememberSignedInHere();
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
      rememberCatalog(exercisesRes.data);
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

  /** The first fields to fix, each with what it needs; empty when the form can go. */
  const checkAuthFields = (): AuthFieldErrors => {
    const errors: AuthFieldErrors = {};
    const name = username.trim();
    if (!name) errors.username = 'Écris ton identifiant.';
    else if (!isLoginMode && !USERNAME_PATTERN.test(name))
      errors.username = 'De 3 à 24 caractères : lettres, chiffres, « . », « _ » ou « - ».';
    if (!password) errors.password = 'Écris ton mot de passe.';
    else if (!isLoginMode && password.length < MIN_PASSWORD_LENGTH)
      errors.password = `Il faut au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    if (!isLoginMode && !errors.password && password !== confirmPassword)
      errors.confirm = 'Les deux mots de passe sont différents.';
    return errors;
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginMode || signupStep === 1) {
      const errors = checkAuthFields();
      setAuthFieldErrors(errors);
      const first = (['username', 'password', 'confirm'] as const).find((field) => errors[field]);
      if (first) {
        const ids = { username: 'auth-username', password: 'auth-password', confirm: 'auth-password-confirm' };
        document.getElementById(ids[first])?.focus();
        return;
      }
    }
    if (!isLoginMode && signupStep === 1) {
      setAuthError('');
      setSignupStep(2);
      return;
    }
    submitAuth(!isLoginMode);
  };

  // Typing in a field clears what it was asked
  const clearFieldError = (field: keyof AuthFieldErrors) =>
    setAuthFieldErrors((errors) => (errors[field] ? { ...errors, [field]: undefined } : errors));

  const switchAuthMode = (loginMode: boolean) => {
    setIsLoginMode(loginMode);
    setSignupStep(1);
    setConfirmPassword('');
    setAuthError('');
    setAuthFieldErrors({});
  };

  const handleLogout = () => {
    const waiting = pendingFinishes(currentUserId()).length;
    if (
      waiting > 0 &&
      !window.confirm(
        `${waiting} séance${waiting > 1 ? "s n'ont" : " n'a"} pas encore été envoyée${waiting > 1 ? 's' : ''}. ` +
          `${waiting > 1 ? 'Elles resteront' : 'Elle restera'} sur ce téléphone et partir${waiting > 1 ? 'ont' : 'a'} à ta prochaine connexion. ` +
          'Te déconnecter quand même ?',
      )
    ) {
      return;
    }
    // The athlete's data kept for offline use leaves the device with them
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-api-cache' });
    clearToken();
    setIsAuthenticated(false);
    switchAuthMode(true);
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

  // No network: the session starts on the device, under an id of its own, and reaches the server
  // when it is finished (the server creates it then)
  const startOfflineSession = (
    routineName: string | null,
    plan: ActiveExercise[],
    tips: string[] = [],
    routineId: string | null = null,
  ) => {
    prepareSession(tips);
    setActiveSessionId(newOfflineSessionId());
    setActiveRoutineName(routineName);
    setActiveRoutineId(routineId);
    setActiveTestStep(null);
    setWorkout(plan);
    setSessionNotes('');
    setSessionRpe(7);
    setWorkoutStartTime(new Date());
    setActiveTab('logger');
    showToast('Hors ligne : ta séance se note sur le téléphone et partira au retour du réseau', 'info');
  };

  // Start Blank Workout
  const startNewWorkout = async () => {
    try {
      const res = await api.post('/workout/start', {}, { timeout: START_TIMEOUT_MS });
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
      if (isNetworkError(err)) {
        startOfflineSession(null, []);
        return;
      }
      showToast("Impossible de démarrer la séance", 'error');
    }
  };

  // Start from Routine
  const startRoutineWorkout = async (routine: any) => {
    try {
      const res = await api.post('/workout/start', { routineId: routine.id }, { timeout: START_TIMEOUT_MS });
      prepareSession();
      setActiveSessionId(res.data.id);
      setActiveRoutineName(routine.name);
      setActiveRoutineId(routine.id);
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
      if (isNetworkError(err)) {
        // Same number of sets as last time, from the stats kept on the device (3 the first time)
        startOfflineSession(
          routine.name,
          (routine.exercises || []).map((ex: any) => ({
            exerciseId: ex.id,
            name: ex.name || 'Exercice',
            category: ex.category,
            sets: Array.from({ length: exerciseStats[ex.id]?.previousSets.length || 3 }, emptySet),
          })),
          [],
          routine.id,
        );
        return;
      }
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
        showToast("Atlas n'a pas répondu : séance recalculée en local, sans ta demande. Réessaie dans un instant.", 'error');
      } else {
        showToast('Séance réajustée selon ta surcharge progressive', 'success');
      }
    } catch (err: any) {
      showToast(
        isNetworkError(err)
          ? 'Atlas a besoin du réseau. La séance déjà proposée reste disponible hors ligne.'
          : err.response?.data?.message || 'Erreur lors de la consultation du Coach IA',
        'error',
      );
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
      const res = await api.post('/workout/start-recommended', { customRec: rec }, { timeout: START_TIMEOUT_MS });
      // AI recommendations carry coaching tips, coach chat sessions a note.
      prepareSession(Array.isArray(rec.coachingTips) ? rec.coachingTips : rec.notes ? [rec.notes] : []);
      setActiveSessionId(res.data.id);
      setActiveRoutineName(rec.title);
      setActiveTestStep(res.data.testWeekStep || null);
      setSessionNotes('');
      setSessionRpe(7);
      setWorkoutStartTime(new Date());

      // Coach chat sessions come from Atlas; dashboard ones say whether Atlas or the local engine made them
      const prefilledExercises: ActiveExercise[] = (res.data.exercises || []).map((exLog: any, idx: number) =>
        fromRecommendation(
          rec,
          rec.exercises?.[idx] || rec.exercises?.find((re: any) => re.exerciseId === exLog.exerciseId),
          exLog,
        ),
      );

      setWorkout(prefilledExercises);
      setActiveTab('logger');
    } catch (err: any) {
      // Offline: the proposed session kept on the device starts as is, targets included.
      // A calibration step needs the server, which writes the protocol's progress.
      if (isNetworkError(err) && !rec.isTestWeek) {
        startOfflineSession(
          rec.title || null,
          (rec.exercises || [])
            .filter((ex: any) => typeof ex.exerciseId === 'string')
            .map((ex: any) => fromRecommendation(rec, ex)),
          Array.isArray(rec.coachingTips) ? rec.coachingTips : rec.notes ? [rec.notes] : [],
        );
        return;
      }
      showToast(
        isNetworkError(err)
          ? 'La séance de calibration demande le réseau'
          : err.response?.data?.message || "Impossible de démarrer la séance recommandée",
        'error',
      );
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
          progressiveTarget: 'Série test : monte jusqu’à ce qu’il te reste 1 ou 2 reps en réserve',
          source: 'protocol' as const,
          sets: (exLog.sets || []).map(() => ({ ...emptySet(), target })),
        };
      });

      setWorkout(loadedWorkout);
      setIsTestWeekModalOpen(false);
      setActiveTab('logger');
      fetchData();
    } catch (err: any) {
      showToast(
        isNetworkError(err) ? 'La séance de calibration demande le réseau' : err.response?.data?.message || 'Erreur lors du démarrage du test',
        'error',
      );
    } finally {
      setIsStartingTestStep(false);
    }
  };

  const handleSkipTestWeek = async () => {
    if (!window.confirm('Passer la semaine test ? Atlas préparera tes séances à partir de ton profil.')) return;
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
    if (!window.confirm('Recommencer la semaine test ? Tes 3 séances test seront à refaire.')) return;
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

  // Machine taken: an equivalent takes the place of the exercise, with every planned set to do and its
  // own target from its own history. Sets validated on the original are dropped with it.
  const replaceExerciseInSession = (index: number, exercise: any) => {
    const original = workout[index];
    setReplacingIndex(null);
    setPendingReplacement(null);
    if (!original) return;
    // No planned target, coach advice or source: those were written for the original movement
    const replacement: ActiveExercise = {
      exerciseId: exercise.id,
      name: exercise.name,
      category: exercise.category,
      // Same plan, same set types: a warm-up stays a warm-up on the new movement
      sets: original.sets.length > 0 ? original.sets.map((s) => ({ ...emptySet(), type: s.type })) : [emptySet(), emptySet(), emptySet()],
      // Same place in its superset
      supersetId: original.supersetId,
    };
    const updated = [...workout];
    updated.splice(index, 1, replacement);
    setWorkout(updated);
    setFocusedExercise(index);
    // Its last performance gives the ghost targets of the new sets
    loadStats(exercise.id);
  };

  // Validated sets would be lost: ask first, otherwise replace straight away
  const pickReplacement = (exercise: any) => {
    if (replacingIndex === null) return;
    if (workout[replacingIndex]?.sets.some((s) => s.completed)) setPendingReplacement(exercise);
    else replaceExerciseInSession(replacingIndex, exercise);
  };

  const removeExerciseFromSession = (index: number) => {
    const updated = [...workout];
    updated.splice(index, 1);
    // A superset left with one exercise is no superset any more
    setWorkout(normalizeSupersets(updated));
    setFocusedExercise(null);
  };

  // Superset with the next exercise of the session; a superset that follows is merged into it
  const linkWithNext = (index: number) => {
    const current = workout[index];
    const next = workout[index + 1];
    if (!current || !next) return;
    const id = current.supersetId ?? next.supersetId ?? newSupersetId();
    const updated = workout.map((ex, i) =>
      i === index || i === index + 1 || (next.supersetId && ex.supersetId === next.supersetId) ? { ...ex, supersetId: id } : ex,
    );
    setWorkout(normalizeSupersets(updated));
  };

  // Out of its superset; the exercises left on each side regroup only if they still touch
  const unlinkFromSuperset = (index: number) => {
    const updated = workout.map((ex, i) => (i === index ? { ...ex, supersetId: undefined } : ex));
    setWorkout(normalizeSupersets(updated));
  };

  const addSet = (exerciseIndex: number) => {
    const updated = [...workout];
    const sets = updated[exerciseIndex].sets;
    // A further set repeats the last work set entered (not a warm-up), the first one starts empty
    const prevSet = [...sets].reverse().find(drivesTarget) ?? sets[sets.length - 1];
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

  // Type picked in the sheet: a normal set carries no type, like the sets of older drafts
  const changeSetType = (eIndex: number, sIndex: number, type: SetType) => {
    setTypingSet(null);
    const updated = [...workout];
    if (!updated[eIndex]?.sets[sIndex]) return;
    const sets = [...updated[eIndex].sets];
    sets[sIndex] = { ...sets[sIndex], type: type === 'normal' ? undefined : type };
    updated[eIndex] = { ...updated[eIndex], sets };
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

    if (!currentVal) {
      const maxWeight = exerciseStats[updated[eIndex].exerciseId]?.maxWeight || 0;
      const set = updated[eIndex].sets[sIndex];
      vibrate(maxWeight > 0 && isWorkSet(set) && set.weight > maxWeight ? HAPTICS.record : HAPTICS.set);
    }

    if (currentVal) return;
    // Superset: straight on to the next exercise of the round, the rest only once the round is over
    const round = nextInRound(updated, eIndex, sIndex);
    if (round) {
      setFocusedExercise(round.next);
      if (round.endOfRound && autoRestEnabled) startRestTimer(true);
      return;
    }

    // Last set of the exercise done: move on to the next exercise with sets left.
    if (updated[eIndex].sets.every((s) => s.completed)) {
      setFocusedExercise(null);
    }

    if (autoRestEnabled) {
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
    const doneSets = sets.map((s) => (Number(s.reps) > 0 ? { ...s, completed: true } : s));
    setWorkout((prev) => {
      const copy = [...prev];
      copy[eIndex] = { ...copy[eIndex], sets: doneSets };
      return copy;
    });
    if (unfilled > 0) {
      showToast(`${unfilled} série${unfilled > 1 ? 's' : ''} sans répétitions laissée${unfilled > 1 ? 's' : ''} de côté`, 'info');
      return;
    }
    // In a superset, on to the partner with sets left rather than out of the group
    const after = workout.map((ex, i) => (i === eIndex ? { ...ex, sets: doneSets } : ex));
    setFocusedExercise(nextInSuperset(after, eIndex)?.next ?? null);
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
    showToast(`${exerciseLabel(exercise.name)} est déjà dans la séance`, 'info');
  };

  const resetActiveSession = () => {
    clearSessionDraft(currentUserId());
    setActiveSessionId(null);
    setActiveRoutineName(null);
    setActiveRoutineId(null);
    setActiveTestStep(null);
    setWorkout([]);
    setWorkoutStartTime(null);
    prepareSession();
  };

  // Abandon: the session is deleted, nothing of it is kept in the history or the records
  const abandonWorkout = async () => {
    if (!activeSessionId) return;

    // Started offline: the server never heard of it, nothing to delete there
    if (!isOfflineSessionId(activeSessionId)) {
      try {
        await api.delete(`/workout/session/${activeSessionId}`);
      } catch (err: any) {
        // Already gone on the server, or no network (an empty session never shows in the history):
        // the session can still be closed here
        if (err.response?.status !== 404 && !isNetworkError(err)) {
          showToast("Impossible d'abandonner la séance", 'error');
          return;
        }
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
    if (!activeSessionId || finishingRef.current) return;

    if (workout.length === 0) {
      if (!window.confirm('Ta séance ne contient aucun exercice. La terminer quand même ?')) {
        return;
      }
    }

    try {
      const anyCompletedExplicitly = workout.some((ex) => ex.sets.some((s) => s.completed));
      const exercisesPayload = workout.map((ex) => ({
        exerciseId: ex.exerciseId,
        supersetId: ex.supersetId ?? null,
        sets: ex.sets.map((s) => ({
          reps: Number(s.reps) || 0,
          weight: Number(s.weight) || 0,
          completed: anyCompletedExplicitly
            ? Boolean(s.completed)
            : Number(s.weight) > 0 && Number(s.reps) > 0,
          type: typeOf(s),
        })),
      }));

      const userId = currentUserId();
      const payload: FinishPayload = {
        sessionId: activeSessionId,
        rpe: sessionRpe,
        notes: sessionNotes,
        exercises: exercisesPayload,
        endedAt: new Date().toISOString(),
        offline: {
          startedAt: (workoutStartTime ?? new Date()).toISOString(),
          ...(activeRoutineName ? { title: activeRoutineName } : {}),
          ...(activeRoutineId ? { routineId: activeRoutineId } : {}),
        },
      };

      // No network: kept on the device, sent once the server answers. Sending it twice finishes
      // the same session again, never a second one.
      const keepOnDevice = () => {
        if (!userId) return false;
        queueFinish(userId, payload);
        resetActiveSession();
        setActiveTab('history');
        showToast('Séance gardée sur le téléphone : elle partira dès le retour du réseau', 'info');
        return true;
      };
      // Clearly offline (no connection at all): no need to wait for a request to fail
      if (navigator.onLine === false && keepOnDevice()) return;

      finishingRef.current = true;
      let res;
      try {
        res = await api.post('/workout/finish', payload, { timeout: FINISH_TIMEOUT_MS });
      } catch (err) {
        if (isNetworkError(err) && keepOnDevice()) return;
        throw err;
      } finally {
        finishingRef.current = false;
      }

      // The recap card says the session is saved, and offers to share it
      setRecapSession(res.data);
      resetActiveSession();
      // This session may hold new records: reload the stats next time.
      requestedStats.current.clear();
      setExerciseStats({});
      setActiveTab('history');
      await fetchData();
      // The network is back: sessions kept earlier go out too
      syncPendingSessions();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Erreur lors de l'enregistrement", 'error');
    }
  };

  // Delete Workout Session
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Supprimer cette séance de ton historique ? Tu ne pourras pas la récupérer.')) {
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
      const res = await api.put('/profile', {
        ...toAthleteProfilePayload(toAthleteProfileValue(profile)),
        goal: profile.goal || 'BODYBUILDING',
      });
      // The server's cleaned values (trimmed first name, "KNEE,BACK"...) replace what was typed
      setProfile((prev: any) => ({ ...prev, ...res.data }));
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

  // Open Warmup Modal for an exercise in active workout
  const openWarmupForExercise = (eIndex: number) => {
    const ex = workout[eIndex];
    // Sets start empty: the warm-up builds up to the load entered, else the target, else the one lifted last time
    const firstWork = Math.max(0, ex.sets.findIndex(drivesTarget));
    const targetWeight =
      ex.sets.find((s) => drivesTarget(s) && s.weight > 0)?.weight ||
      targetOf(eIndex, firstWork)?.weight ||
      exerciseStats[ex.exerciseId]?.lastSet?.weight ||
      80;
    setWarmupModalData({
      isOpen: true,
      exerciseIndex: eIndex,
      exerciseName: ex.name,
      targetWeight,
    });
  };

  const handleApplyWarmupSets = (warmupSets: ActiveSet[]) => {
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

    const headers = ['Date', 'Programme', 'RPE', 'Notes', 'Exercice', 'Categorie', 'Serie', 'Poids_kg', 'Reps', 'Valide', 'Type', 'Superset'];
    const rows: string[] = [headers.join(';')];

    history.forEach((session) => {
      const dateStr = new Date(session.startedAt).toISOString().split('T')[0];
      const routineName = (session.title || session.routine?.name || 'Séance libre').replace(/;/g, ',');
      const notes = (session.notes || '').replace(/;/g, ',').replace(/\n/g, ' ');

      const labels = supersetLabels(session.exercises || []);
      (session.exercises || []).forEach((exLog: any, exIndex: number) => {
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
            SET_TYPE_LABELS[typeOf(st)],
            labels[exIndex] ?? '',
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

    const labels = supersetLabels(session.exercises || []);
    (session.exercises || []).forEach((exLog: any, exIndex: number) => {
      const setsStr = (exLog.sets || []).map((s: any) => {
        if (s.completed && isWorkSet(s)) totalVol += (s.weight || 0) * (s.reps || 0);
        const type = typeOf(s);
        const kind = type !== 'normal' ? ` (${SET_TYPE_LABELS[type].toLowerCase()})` : '';
        return `${s.weight}kg × ${s.reps}${kind}${s.completed ? ' ✓' : ''}`;
      }).join(', ');
      const label = labels[exIndex] ? `${labels[exIndex]} ` : '';
      lines.push(`• ${label}${exerciseLabel(exLog.exercise?.name)} : ${setsStr}`);
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

  // The library as the athlete sees it: an exercise already logged is never a hidden variant
  const catalog = useMemo(() => {
    const loggedIds = new Set<string>(history.flatMap((s: any) => (s.exercises || []).map((e: any) => e.exerciseId)));
    return exercises.map((ex) => (ex.isVariant && loggedIds.has(ex.id) ? { ...ex, isVariant: false } : ex));
  }, [exercises, history]);
  // Browsing order: by category, then by the French name the athlete reads, variants last
  const browseOrder = useMemo(
    () =>
      [...catalog].sort(
        (a, b) =>
          Number(!!a.isVariant) - Number(!!b.isVariant) ||
          (a.category || '').localeCompare(b.category || '', 'fr') ||
          exerciseLabel(a.name).localeCompare(exerciseLabel(b.name), 'fr'),
      ),
    [catalog],
  );

  // Filter exercises: best answers first; variants wait behind "Voir plus de variantes" unless searched
  const inCategory = (rankExercises(exerciseSearch, catalog) ?? browseOrder).filter(
    (ex) => selectedCategory === 'Tous' || ex.category === selectedCategory,
  );
  const searching = exerciseSearch.trim() !== '';
  const showVariants = variantsCategory === selectedCategory;
  const filteredExercises = searching || showVariants ? inCategory : inCategory.filter((ex) => !ex.isVariant);
  const hiddenVariants = inCategory.length - filteredExercises.length;

  // The first name when the athlete gave one; legacy accounts use their former email as identifier
  const firstName = (profile.firstName || '').trim();
  const displayName = firstName || profile.user?.username?.split('@')[0] || 'Athlète';

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
      volume +
      ex.sets.reduce((v, s) => (s.completed && isWorkSet(s) ? v + (Number(s.weight) || 0) * (Number(s.reps) || 0) : v), 0),
    0,
  );
  const remainingExercises = workout.filter((ex, i) => i !== activeExerciseIndex && !isExerciseDone(ex)).length;
  const workoutLabels = supersetLabels(workout);
  const activeRun = runOf(workout, activeExerciseIndex);
  const activeSuperset =
    activeRun && workoutLabels[activeExerciseIndex]
      ? {
          label: workoutLabels[activeExerciseIndex] as string,
          partners: workout.slice(activeRun.start, activeRun.end + 1).filter((_, k) => activeRun.start + k !== activeExerciseIndex).map((ex) => exerciseLabel(ex.name)),
        }
      : undefined;
  // Linking goes forward: from an exercise on its own, or from the last one of a superset
  const canLinkNext = activeExerciseIndex < workout.length - 1 && (!activeRun || activeRun.end === activeExerciseIndex);

  const renderQueueItem = (ex: ActiveExercise, eIndex: number) => {
    const doneSets = ex.sets.filter((s) => s.completed).length;
    const isDone = ex.sets.length > 0 && doneSets === ex.sets.length;
    const index = workoutLabels[eIndex] ?? String(eIndex + 1);
    // The exercise on screen shows in the queue only inside its superset, to make the group whole
    if (eIndex === activeExerciseIndex) {
      return (
        <div key={ex.exerciseId + eIndex} className="queue-item is-current" aria-current="step">
          <span className="queue-index">{index}</span>
          <span className="queue-name">{exerciseLabel(ex.name)}</span>
          <span className="queue-detail">En cours</span>
        </div>
      );
    }
    return (
      <button
        key={ex.exerciseId + eIndex}
        type="button"
        className={`queue-item${isDone ? ' is-done' : ''}`}
        onClick={() => setFocusedExercise(eIndex)}
        title={isDone ? 'Revoir cet exercice' : 'Ouvrir cet exercice'}
      >
        <span className="queue-index">{index}</span>
        <span className="queue-name">{exerciseLabel(ex.name)}</span>
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
  };
  // Dashboard: the movements whose best set moves up over four weeks. A short week is no drop:
  // only a real drop of load reads warm
  const overloadSummary: OverloadSummary | null = dashboardStats.overload ?? null;
  const overload = describeOverload(overloadSummary);
  const overloadTrend = overload?.trend ?? null;
  const weekVolume = Number(dashboardStats.weekVolume) || 0;

  const goalName = (GOAL_OPTIONS.find((g) => g.id === (profile.goal || 'BODYBUILDING')) || GOAL_OPTIONS[1]).name.replace(/ \(.*\)/, '');
  const sessionKicker = activeTestStep
    ? `Semaine test · étape ${activeTestStep}/3`
    : `${goalName} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // Render Authentication Screen
  if (!isAuthenticated) {
    const isSignupProfile = !isLoginMode && signupStep === 2;
    const authSubtitle = signupCalibration
      ? 'Ton profil règle tes charges de départ et les séances test.'
      : 'Ton profil règle tes charges de départ et les séances d’Atlas.';
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
              {isSignupProfile ? (
                <p>{authSubtitle}</p>
              ) : (
                <>
                  <p className="auth-pitch">Ton carnet de musculation qui te dit quoi soulever à la prochaine séance.</p>
                  <ul className="auth-promises">
                    {AUTH_PROMISES.map((promise) => (
                      <li key={promise}>
                        <Icon name="check" size={16} strokeWidth={2.2} />
                        <span>{promise}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
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

              <form onSubmit={handleAuthSubmit} className="auth-form" noValidate={!isSignupProfile}>
                {isSignupProfile ? (
                  <>
                    <AthleteProfileFields value={signupAthlete} onChange={setSignupAthlete} idPrefix="signup" />
                    <label className="auth-contrast">
                      <input
                        type="checkbox"
                        checked={highContrast}
                        onChange={(e) => {
                          setHighContrast(e.target.checked);
                          setHighContrastState(e.target.checked);
                        }}
                      />
                      <span>
                        Contraste élevé
                        <span className="checkbox-hint">
                          Texte plus clair et filets plus nets, pour les salles très éclairées ou dehors. Appliqué tout
                          de suite, sur cet appareil.
                        </span>
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="auth-field">
                      <label htmlFor="auth-username">Identifiant</label>
                      <input
                        id="auth-username"
                        className="auth-input"
                        type="text"
                        name="username"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          clearFieldError('username');
                        }}
                        placeholder="alex_lifts"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={!!authFieldErrors.username}
                        aria-describedby={authFieldErrors.username || !isLoginMode ? 'auth-username-hint' : undefined}
                      />
                      {authFieldErrors.username ? (
                        <span id="auth-username-hint" className="auth-hint auth-hint-error">
                          {authFieldErrors.username}
                        </span>
                      ) : (
                        !isLoginMode && (
                          <span id="auth-username-hint" className="auth-hint">
                            3 à 24 caractères : lettres, chiffres, « . », « _ » ou « - ».
                          </span>
                        )
                      )}
                    </div>

                    <div className="auth-field">
                      <label htmlFor="auth-password">Mot de passe</label>
                      <div className="auth-input-wrap">
                        <input
                          id="auth-password"
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearFieldError('password');
                          }}
                          placeholder="••••••••••••"
                          autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                          aria-invalid={!!authFieldErrors.password}
                          aria-describedby={authFieldErrors.password || !isLoginMode ? 'auth-password-hint' : undefined}
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
                      {authFieldErrors.password ? (
                        <span id="auth-password-hint" className="auth-hint auth-hint-error">
                          {authFieldErrors.password}
                        </span>
                      ) : (
                        !isLoginMode && (
                          <span id="auth-password-hint" className="auth-hint">
                            {MIN_PASSWORD_LENGTH} caractères minimum.
                          </span>
                        )
                      )}
                    </div>

                    {!isLoginMode && (
                      <div className="auth-field">
                        <label htmlFor="auth-password-confirm">Confirmer le mot de passe</label>
                        <input
                          id="auth-password-confirm"
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          name="password-confirm"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            clearFieldError('confirm');
                          }}
                          placeholder="••••••••••••"
                          autoComplete="new-password"
                          aria-invalid={!!authFieldErrors.confirm}
                          aria-describedby={authFieldErrors.confirm ? 'auth-confirm-hint' : undefined}
                        />
                        {authFieldErrors.confirm ? (
                          <span id="auth-confirm-hint" className="auth-hint auth-hint-error">
                            {authFieldErrors.confirm}
                          </span>
                        ) : confirmPassword && (
                          <span className={`auth-hint ${confirmPassword === password ? 'auth-hint-ok' : 'auth-hint-error'}`}>
                            {confirmPassword === password ? '✓ Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
                          </span>
                        )}
                      </div>
                    )}

                    {!isLoginMode && (
                      <div className="auth-field">
                        <label>Ton objectif</label>
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
                            ? '3 séances test pour mesurer tes vraies charges. Ensuite, Atlas prépare tes séances.'
                            : 'Pas de séance test : Atlas prépare tes séances tout de suite, à partir de ton profil. Tu pourras faire la calibration plus tard, depuis ton profil.'}
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
              <h1>{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</h1>
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
                  <h2 className="home-card-title">3 séances pour mesurer tes charges</h2>
                  <p className="home-card-text">Tu fais les séances test une par une. Ensuite, Atlas prépare tes séances à partir de tes vraies charges.</p>
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

                {/* The test session starts from the "Aujourd'hui" card below: one button, not two. This one
                    only shows when that card has no test session to offer */}
                <div className="home-actions">
                  {!nextRecommendation?.isTestWeek && (
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
                        : `Lancer la séance test ${testWeekStatus.currentStep} sur ${testWeekStatus.totalSteps}`}
                    </button>
                  )}
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
                    <h2>Aujourd'hui</h2>
                    {/* Who made the session, said honestly: Atlas, or the local engine when Atlas did not answer */}
                    {nextRecommendation?.isTestWeek ? (
                      <span className="plan-source">
                        <span className="source-dot is-protocol" aria-hidden="true" />
                        Protocole · étape {nextRecommendation.testStep}/{nextRecommendation.totalTestSteps}
                      </span>
                    ) : nextRecommendation && !nextRecommendation.aiGenerated ? (
                      <span
                        className="plan-source"
                        title="Atlas n'a pas répondu : cette séance vient du calcul de surcharge local. Régénère pour lui redemander."
                      >
                        <span className="source-dot is-engine" aria-hidden="true" />
                        Calcul local
                      </span>
                    ) : (
                      <span className="plan-source" title={nextRecommendation ? 'Séance préparée par Atlas, ton coach IA' : undefined}>
                        <span className="source-dot is-atlas" aria-hidden="true" />
                        Atlas
                      </span>
                    )}
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

                      {/* What was left out or lightened for a sensitive area, said before the lifts */}
                      <PainNotes avoided={nextRecommendation.avoided} prevention={nextRecommendation.prevention} />

                      {nextRecommendation.exercises?.length > 0 && (
                        <ul className="today-lifts">
                          {nextRecommendation.exercises.slice(0, TODAY_KEY_LIFTS).map((ex: any, idx: number) => {
                            const planned = (ex.sets || []).map(toTarget).filter(Boolean) as SetTarget[];
                            const target = topSet(planned);
                            const stats = exerciseStats[ex.exerciseId];
                            // No gap until the history of the movement has loaded
                            const gap = stats ? describeGap(target, topSet(stats.previousSets)) : null;
                            // On bodyweight work the load is a belt, never the whole weight lifted
                            const bodyweight = detectEquipment(ex.name) === 'bodyweight';
                            return (
                              <li key={idx} className="today-lift">
                                <div className="today-lift-text">
                                  <p className="today-lift-name">
                                    <ExerciseName name={ex.name} />
                                  </p>
                                  <p className="today-lift-sets">
                                    {ex.sets?.length || 3} séries
                                    {target && target.weight === 0 ? ' · poids du corps' : ''}
                                    {target && target.weight > 0 && bodyweight ? ' · poids du corps + lest' : ''}
                                  </p>
                                </div>
                                {target ? (
                                  <div className="today-lift-target">
                                    <span className="today-lift-load">
                                      {target.weight > 0 && (
                                        <>
                                          {bodyweight && '+ '}
                                          {formatKg(target.weight)}
                                          <small>kg</small>
                                          <span className="today-lift-times">×</span>
                                        </>
                                      )}
                                      {target.reps}
                                      {target.weight === 0 && <small>reps</small>}
                                    </span>
                                    {gap && <span className={`today-gap is-${gap.tone}`}>{gap.label}</span>}
                                  </div>
                                ) : (
                                  <span className="today-lift-sets">Charge à définir</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {nextRecommendation.exercises?.length > TODAY_KEY_LIFTS && (
                        <p className="today-more">
                          Puis{' '}
                          {nextRecommendation.exercises
                            .slice(TODAY_KEY_LIFTS)
                            .map((ex: any) => ex.name)
                            .join(', ')}
                        </p>
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
                              {nextRecommendation.rationale && <p className="next-rationale">{frenchifyText(nextRecommendation.rationale)}</p>}
                              {nextRecommendation.coachingTips?.length > 0 && (
                                <ul className="next-tips">
                                  {nextRecommendation.coachingTips.map((tip: string, idx: number) => (
                                    <li key={idx}>{frenchifyText(tip)}</li>
                                  ))}
                                </ul>
                              )}
                              {nextRecommendation.exercises?.some((ex: any) => ex.reason || ex.targetAdvice) && (
                                <dl className="next-reasons">
                                  {nextRecommendation.exercises
                                    .filter((ex: any) => ex.reason || ex.targetAdvice)
                                    .map((ex: any, idx: number) => (
                                      <div key={idx}>
                                        <dt>
                                          <ExerciseName name={ex.name} />
                                        </dt>
                                        {ex.targetAdvice && <dd className="next-advice">{frenchifyText(ex.targetAdvice)}</dd>}
                                        {ex.reason && <dd>{frenchifyText(ex.reason)}</dd>}
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
                            ? `Lancer la séance test ${nextRecommendation.testStep} sur ${nextRecommendation.totalTestSteps}`
                            : 'Commencer la séance'}
                        </button>
                        {/* During the test week, the protocol opens from the calibration card above */}
                        {!nextRecommendation.isTestWeek && (
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
                {/* Progressive overload: the movements that move up over four weeks, not the weekly tonnage */}
                <section className="home-card overload-card">
                  <div className="home-card-head">
                    <span className="home-card-label">
                      Surcharge progressive
                      <GlossaryTerm term="overload" />
                    </span>
                    {overloadTrend && (
                      <span className={`trend-chip is-${overloadTrend}`}>
                        <Icon name={overloadTrend === 'down' ? 'activity' : 'trendingUp'} size={14} />
                        {overloadTrend === 'up' ? 'En hausse' : overloadTrend === 'down' ? 'En baisse' : 'Stable'}
                      </span>
                    )}
                  </div>
                  <div className="overload-value">
                    <strong>{overload ? overload.value : '—'}</strong>
                    <span>{overload ? overload.caption : 'à mesurer'}</span>
                  </div>
                  <p className="home-card-text">
                    {overload
                      ? overload.text
                      : Number(dashboardStats.totalWorkouts) > 0
                      ? 'Refais un mouvement au moins deux fois en 4 semaines : sa progression apparaîtra ici.'
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

                {/* Regularity: the last twelve weeks, day by day */}
                <section className="home-section home-streak">
                  <div className="home-section-head">
                    <h2>Régularité</h2>
                  </div>
                  <div className="home-card">
                    <ConsistencyHeatmap sessions={history} />
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
              <div
                className={`session${showRestTimer ? ' has-rest-drawer' : ''}${
                  sessionView === 'gym' && workout.length > 0 ? ' is-gym-view' : ''
                }`}
              >
                {/* Active Test Week Session Notice */}
                {activeTestStep && (
                  <div className="session-notice">
                    <Icon name="flask" size={16} />
                    <p>
                      <strong>Séance test.</strong> Monte la charge jusqu’à ce qu’il te reste 1 ou 2 reps en réserve
                      <GlossaryTerm term="rir" />, avec une technique propre. Tes charges règlent tes prochaines séances.
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

                {workout.length > 0 && (
                  <div className="session-toolbar">
                    <div className="view-switch" role="group" aria-label="Affichage de la séance">
                      <button type="button" aria-pressed={sessionView === 'list'} onClick={() => changeSessionView('list')}>
                        <Icon name="list" size={15} />
                        Liste
                      </button>
                      <button type="button" aria-pressed={sessionView === 'gym'} onClick={() => changeSessionView('gym')}>
                        <Icon name="focus" size={15} />
                        Salle
                      </button>
                    </div>
                  </div>
                )}

                <div className={`session-layout${sessionView === 'gym' ? ' is-gym' : ''}`}>
                  <div className="session-main">
                    {activeExercise && sessionView === 'gym' ? (
                      <GymFocus
                        workout={workout}
                        index={activeExerciseIndex}
                        stats={exerciseStats[activeExercise.exerciseId]}
                        goal={profile.goal}
                        onNavigate={setFocusedExercise}
                        onSetChange={(sIndex, field, value) => updateSet(activeExerciseIndex, sIndex, field, value)}
                        onToggleSet={(sIndex) => toggleSetCompleted(activeExerciseIndex, sIndex)}
                        onEditSetType={(sIndex) => setTypingSet({ eIndex: activeExerciseIndex, sIndex })}
                        onAddSet={() => addSet(activeExerciseIndex)}
                        onWarmup={() => openWarmupForExercise(activeExerciseIndex)}
                        onCalculator={() => openPlateCalculator(activeExercise)}
                        onReplace={() => setReplacingIndex(activeExerciseIndex)}
                      />
                    ) : activeExercise ? (
                      <ActiveExerciseCard
                        key={activeExercise.exerciseId}
                        exercise={activeExercise}
                        position={activeExerciseIndex + 1}
                        total={workout.length}
                        stats={exerciseStats[activeExercise.exerciseId]}
                        goal={profile.goal}
                        onSetChange={(sIndex, field, value) => updateSet(activeExerciseIndex, sIndex, field, value)}
                        onToggleSet={(sIndex) => toggleSetCompleted(activeExerciseIndex, sIndex)}
                        onEditSetType={(sIndex) => setTypingSet({ eIndex: activeExerciseIndex, sIndex })}
                        onAddSet={() => addSet(activeExerciseIndex)}
                        onRemoveSet={(sIndex) => removeSet(activeExerciseIndex, sIndex)}
                        onCompleteAll={() => completeAllSets(activeExerciseIndex)}
                        onWarmup={() => openWarmupForExercise(activeExerciseIndex)}
                        onCalculator={() => openPlateCalculator(activeExercise)}
                        onReplace={() => setReplacingIndex(activeExerciseIndex)}
                        onRemove={() => removeExerciseFromSession(activeExerciseIndex)}
                        superset={activeSuperset}
                        nextName={canLinkNext ? exerciseLabel(workout[activeExerciseIndex + 1].name) : undefined}
                        onLinkNext={canLinkNext ? () => linkWithNext(activeExerciseIndex) : undefined}
                        onUnlink={activeSuperset ? () => unlinkFromSuperset(activeExerciseIndex) : undefined}
                      />
                    ) : (
                      <div className="session-empty">
                        <h3>Ta séance est prête</h3>
                        <p>Choisis un premier exercice ci-dessous pour commencer à noter tes séries.</p>
                      </div>
                    )}

                    {/* Rest of the session (the gym view has its own dots) */}
                    {workout.length > 1 && sessionView === 'list' && (
                      <section className="session-queue">
                        <div className="session-section-head">
                          <span className="eyebrow">Suite du programme</span>
                          <span className="session-section-count">
                            {remainingExercises} {remainingExercises > 1 ? 'restants' : 'restant'}
                          </span>
                        </div>
                        <div className="queue-list">
                          {segmentBySuperset(workout).map(({ run, items }) =>
                            run ? (
                              <div key={`superset-${items[0].index}`} className="queue-superset" role="group" aria-label="Superset">
                                <span className="queue-superset-label">
                                  <Icon name="link" size={13} />
                                  Superset
                                </span>
                                {items.map(({ item, index }) => renderQueueItem(item, index))}
                              </div>
                            ) : items[0].index === activeExerciseIndex ? null : (
                              renderQueueItem(items[0].item, items[0].index)
                            ),
                          )}
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
                            exercises={catalog}
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
                        <span className="eyebrow eyebrow-term">
                          Effort perçu de la séance (RPE)
                          <GlossaryTerm term="rpe" />
                        </span>
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
                            aria-label={`${num} : ${RPE_MEANINGS[num]}`}
                            title={RPE_MEANINGS[num]}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                      {/* The scale in words: reps left in the tank, not a number to decode */}
                      <p className="rpe-meaning" aria-live="polite">
                        <span className="rpe-meaning-value">{sessionRpe}</span>
                        {RPE_MEANINGS[sessionRpe]}
                      </p>

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
                            <li key={idx}>{frenchifyText(tip)}</li>
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
                          <span>
                            <ExerciseName name={ex.name} />
                          </span>
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

            {syncState.pending > 0 && (
              <p className="history-pending" role="status">
                <Icon name="cloud" size={16} />
                <span>
                  {syncState.pending} séance{syncState.pending > 1 ? 's' : ''} en attente d'envoi : elle
                  {syncState.pending > 1 ? 's apparaîtront' : ' apparaîtra'} ici dès le retour du réseau.
                </span>
              </p>
            )}

            {history.map((session) => {
              const isExpanded = expandedHistoryId === session.id;
              let sessionVolume = 0;
              (session.exercises || []).forEach((ex: any) => {
                (ex.sets || []).forEach((s: any) => {
                  if (isWorkSet(s) && (s.completed || (s.weight > 0 && s.reps > 0))) {
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
                        onClick={() => setRecapSession(session)}
                        title="Partager le récap de la séance"
                        aria-label="Partager le récap de la séance"
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
                        segmentBySuperset<any>(session.exercises).map(({ run, items }) => {
                          const block = items.map(({ item: exLog }) => (
                          <div key={exLog.id} className="history-exercise">
                            <div className="history-exercise-head">
                              <strong>
                                <ExerciseName name={exLog.exercise?.name} />
                              </strong>
                              <span>{exLog.exercise?.category || 'Général'}</span>
                            </div>

                            <div className="history-sets">
                              {exLog.sets?.map((st: any, idx: number) => {
                                const mark = markOf(st);
                                const kind = mark ? `${SET_TYPE_LABELS[typeOf(st)]} · ` : '';
                                return (
                                  <span
                                    key={st.id || idx}
                                    className={`history-set${st.completed ? ' is-done' : ''}${mark ? ` is-${typeOf(st)}` : ''}`}
                                    title={`${kind}${st.completed ? 'Série validée' : 'Série non validée'}`}
                                  >
                                    {mark && <span className="history-set-mark">{mark}</span>}
                                    {formatKg(Number(st.weight) || 0)} × {st.reps}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          ));
                          return run ? (
                            <div key={`superset-${items[0].item.id}`} className="history-superset" role="group" aria-label="Superset">
                              <span className="history-superset-label">
                                <Icon name="link" size={13} />
                                Superset
                              </span>
                              {block}
                            </div>
                          ) : (
                            <Fragment key={items[0].item.id}>{block}</Fragment>
                          );
                        })
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
                  <span className="exercise-card-name">
                    <ExerciseName name={ex.name} />
                  </span>
                  <span className="exercise-card-cat">
                    {ex.category || 'Général'}
                    {ex.isVariant ? ' · variante' : ''}
                  </span>
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

            {!searching && (hiddenVariants > 0 || showVariants) && filteredExercises.length <= libraryLimit && (
              <div className="load-more">
                <button className="btn-secondary" onClick={() => setVariantsCategory(showVariants ? null : selectedCategory)}>
                  {showVariants ? 'Masquer les variantes' : `Voir plus de variantes (${hiddenVariants})`}
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

                <div className="form-group">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(e) => {
                        setHighContrast(e.target.checked);
                        setHighContrastState(e.target.checked);
                      }}
                    />
                    <span>
                      Contraste élevé
                      <span className="checkbox-hint">
                        Texte plus clair et filets plus nets, pour les salles très éclairées ou dehors. Sur cet appareil,
                        appliqué tout de suite.
                      </span>
                    </span>
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

      <RecapModal
        session={recapSession}
        history={history}
        onClose={() => setRecapSession(null)}
        onCopyText={shareSession}
        onResult={showToast}
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
          rememberCatalog([...exercises, newEx]);
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
        exercises={catalog}
        onSuccess={(newRoutine) => {
          setRoutines([...routines, newRoutine]);
          showToast(`Programme « ${newRoutine.name} » enregistré`);
        }}
      />

      {(() => {
        const set = typingSet ? workout[typingSet.eIndex]?.sets[typingSet.sIndex] : undefined;
        return (
          <SetTypeSheet
            setNumber={typingSet && set ? typingSet.sIndex + 1 : null}
            current={set ? typeOf(set) : 'normal'}
            onPick={(type) => typingSet && changeSetType(typingSet.eIndex, typingSet.sIndex, type)}
            onClose={() => setTypingSet(null)}
          />
        );
      })()}

      {/* The picker steps aside while the loss of validated sets is confirmed, and comes back on cancel */}
      <ReplaceExerciseModal
        exercise={replacingIndex !== null && !pendingReplacement ? workout[replacingIndex] ?? null : null}
        library={catalog}
        sessionIds={workout.map((ex) => ex.exerciseId)}
        onPick={pickReplacement}
        onClose={() => setReplacingIndex(null)}
      />

      {(() => {
        const original = replacingIndex !== null ? workout[replacingIndex] : undefined;
        const done = original ? original.sets.filter((s) => s.completed).length : 0;
        return (
          <ConfirmDialog
            isOpen={!!pendingReplacement && !!original}
            tone="danger"
            icon="swap"
            title={`Remplacer par ${pendingReplacement ? exerciseLabel(pendingReplacement.name) : ''} ?`}
            message={`${done} série${done > 1 ? 's' : ''} validée${done > 1 ? 's' : ''} sur ${original ? exerciseLabel(original.name) : ''} ${done > 1 ? 'seront supprimées' : 'sera supprimée'}.`}
            confirmLabel="Remplacer"
            onConfirm={() => replaceExerciseInSession(replacingIndex!, pendingReplacement)}
            onCancel={() => setPendingReplacement(null)}
          />
        );
      })()}

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
        onOpenProfile={() => {
          setIsTestWeekModalOpen(false);
          setActiveTab('profile');
        }}
      />
    </div>
  );
}

export default App;
