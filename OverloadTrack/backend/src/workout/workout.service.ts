import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, CoachChatMessage } from '../ai/ai.service';
import {
  athleteConstraints,
  calibrationLoadFactor,
  describeAthlete,
  painAreasOf,
  scaleCalibrationLoad,
} from '../user/athlete-profile';
import { orderRoutineExercises } from '../routine/routine.service';
import { drivesTarget, isWorkSet, parseSetType } from './set-type';
import { sanitizeSupersetIds } from './superset';
import { summarizeOverload } from './overload-summary';
import {
  CAUTION_ADVICE,
  PainReportBuilder,
  cautionLoad,
  checkMovement,
  protocolMovement,
  screenMovement,
  sensitiveAreas,
} from './pain-guard';
import {
  KnownLift,
  Performance,
  detectEquipment,
  fitsEquipment,
  guardSets,
  nextTarget,
  startingTarget,
  topPerformance,
  usesRelatedLifts,
} from './progression';

const COACH_MAX_MESSAGES = 12;
const COACH_MAX_MESSAGE_LENGTH = 2000;
const REGENERATE_MAX_INSTRUCTIONS = 500;
/** Treads sent per movement for the progression staircases: about two years of weekly sessions. */
const KEY_LIFT_MAX_POINTS = 120;

interface FinishSetDto {
  reps: number;
  weight: number;
  completed: boolean;
  /** normal (default), warmup, drop or failure. */
  type?: string;
}

interface FinishExerciseDto {
  exerciseId: string;
  sets: FinishSetDto[];
  /** Shared by neighbouring exercises done as a superset. */
  supersetId?: string | null;
}

export interface FinishWorkoutDto {
  sessionId: string;
  rpe: number;
  notes?: string;
  exercises?: FinishExerciseDto[];
  /** Real end of the session: its end may reach the server later, queued on the device offline. */
  endedAt?: string;
  /** How to create the session if the server lacks it: started offline, under the id the app gave it. */
  offline?: { startedAt?: string; title?: string; routineId?: string };
}

/** Ids the app gives to sessions started offline ("local-…"); the server's own are cuids. */
const OFFLINE_SESSION_ID = /^local-[a-z0-9-]{8,60}$/;

/** A date sent by the app, kept only if it is real and not in the future (5 min of clock drift). */
const parseClientDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) && time > Date.UTC(2020, 0, 1) && time <= Date.now() + 5 * 60_000 ? date : null;
};

@Injectable()
export class WorkoutService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkoutService.name);
  private recommendationCache = new Map<string, { data: any; timestamp: number }>();
  /** Generation running per athlete: the AI allows one call every 15s, so concurrent loads share it. */
  private recommendationInFlight = new Map<string, Promise<any>>();

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  onApplicationBootstrap() {
    this.migrateLegacySessionTitles().catch((err) => this.logger.warn(`Session title migration failed: ${err.message}`));
  }

  /**
   * One-off, idempotent: older sessions kept their title (and calibration marker) in the notes.
   * Moves it to `title`/`testWeekStep` so the notes field only holds the athlete's text.
   */
  private async migrateLegacySessionTitles() {
    const legacy = await this.prisma.workoutSession.findMany({
      where: {
        title: null,
        OR: [{ notes: { startsWith: 'Séance Recommandée : ' } }, { notes: { startsWith: 'Programme: ' } }, { notes: { startsWith: '[SEMAINE_TEST_' } }],
      } as any,
      select: { id: true, notes: true },
    });
    for (const session of legacy) {
      const notes = session.notes || '';
      const step = Number(/\[SEMAINE_TEST_([1-3])\]/.exec(notes)?.[1]) || null;
      const title =
        notes
          .replace(/^Séance Recommandée : |^Programme: /, '')
          .replace(/\[SEMAINE_TEST_[1-3]\]\s*/, '')
          .replace(/^Semaine Test \(Séance (\d)\/3\)/, 'Semaine test $1/3')
          .trim() || (step ? `Semaine test ${step}/3` : null);
      await this.prisma.workoutSession.update({
        where: { id: session.id },
        data: { title, testWeekStep: step, notes: null } as any,
      });
    }
    if (legacy.length > 0) this.logger.log(`Moved ${legacy.length} legacy session titles out of the notes`);
  }

  async startWorkout(userId: string, routineId?: string) {
    let routine = null;
    if (routineId) {
      routine = await this.prisma.routine.findUnique({
        where: { id: routineId },
        include: { exercises: true },
      });
    }

    const newSession = await this.prisma.workoutSession.create({
      data: {
        userId,
        ...(routineId && { routineId }),
        ...(routine && { title: routine.name }),
        rpe: 0,
      } as any,
    });

    // Starting from a routine: same number of sets as last time (3 the first time), left empty for
    // the athlete to fill in; the previous loads are shown next to each set, not pre-filled.
    if (routine && routine.exercises.length > 0) {
      for (const ex of orderRoutineExercises(routine.exercises, routine.exerciseOrder)) {
        const newExerciseLog = await this.prisma.exerciseLog.create({
          data: {
            sessionId: newSession.id,
            exerciseId: ex.id,
          },
        });

        const lastLog = await this.prisma.exerciseLog.findFirst({
          where: { exerciseId: ex.id, session: { userId, endedAt: { not: null } } },
          orderBy: { session: { startedAt: 'desc' } },
          // Same number of work sets: neither the warm-ups nor the drop sets become full sets
          select: { sets: { where: { completed: true, type: { in: ['normal', 'failure'] } }, select: { id: true } } },
        });

        await this.createEmptySets(newExerciseLog.id, lastLog?.sets.length || 3);
      }
    }

    return this.prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          // cuid ids grow with insertion: keeps the order the logs were created in
          orderBy: { id: 'asc' },
          include: {
            exercise: true,
            sets: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
  }

  async finishWorkout(userId: string, data: FinishWorkoutDto) {
    let session = await this.prisma.workoutSession.findUnique({
      where: { id: data.sessionId },
    });
    // Started offline: the first sync creates it. Sent again (answer lost), it finds the same one.
    if (!session && data.offline && typeof data.sessionId === 'string' && OFFLINE_SESSION_ID.test(data.sessionId)) {
      session = await this.createOfflineSession(userId, data.sessionId, data.offline);
    }

    if (!session) {
      throw new NotFoundException('Session introuvable');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Non autorisé');
    }

    // Save actual logged exercises and sets if sent from client. One transaction that first locks
    // the session row: an end sent twice at once (answer lost, then queued and sent again) replaces
    // the logs one after the other instead of leaving both copies.
    if (data.exercises && data.exercises.length > 0) {
      const anyCompletedExplicitly = data.exercises.some((ex) =>
        ex.sets?.some((s) => s.completed === true),
      );

      // Neighbours judged on the list as sent: a dropped entry never glues two supersets together
      const supersetIds = sanitizeSupersetIds(data.exercises.map((ex) => ex.supersetId));

      // Created in session order: the cuid ids keep the supersets' exercises next to each other,
      // and the sets in the order they were logged
      const logs = data.exercises.flatMap((exDto, index) =>
        exDto.exerciseId
          ? [
              this.prisma.exerciseLog.create({
                data: {
                  sessionId: data.sessionId,
                  exerciseId: exDto.exerciseId,
                  supersetId: supersetIds[index],
                  ...(exDto.sets?.length
                    ? {
                        sets: {
                          createMany: {
                            data: exDto.sets.map((set) => ({
                              reps: Number(set.reps) || 0,
                              weight: Number(set.weight) || 0,
                              completed: anyCompletedExplicitly
                                ? Boolean(set.completed)
                                : Number(set.weight) > 0 && Number(set.reps) > 0,
                              type: parseSetType(set.type),
                            })),
                          },
                        },
                      }
                    : {}),
                },
              }),
            ]
          : [],
      );

      await this.prisma.$transaction([
        this.prisma.workoutSession.update({ where: { id: data.sessionId }, data: { rpe: data.rpe ?? 7 } }),
        // Remove any temporary exercise logs
        this.prisma.exerciseLog.deleteMany({ where: { sessionId: data.sessionId } }),
        ...logs,
      ]);
    }

    this.recommendationCache.delete(userId);

    const sessionBefore = await this.prisma.workoutSession.findUnique({
      where: { id: data.sessionId },
    });
    const legacyNotes = data.notes || (sessionBefore as any)?.notes || '';
    const legacyStep = /\[SEMAINE_TEST_([1-3])\]/.exec(legacyNotes)?.[1];
    const testStep = Number((sessionBefore as any)?.testWeekStep) || Number(legacyStep) || 0;
    if (testStep === 1) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 1 } as any,
      }).catch(() => null);
    } else if (testStep === 2) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 2 } as any,
      }).catch(() => null);
    } else if (testStep === 3) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 3, testWeekCompleted: true } as any,
      }).catch(() => null);
    }

    // The real end of the session, not the time its queued end reached the server
    const sentEnd = parseClientDate(data.endedAt);
    const endedAt = sentEnd && sentEnd >= session.startedAt ? sentEnd : new Date();

    return this.prisma.workoutSession.update({
      where: { id: data.sessionId },
      data: {
        endedAt,
        rpe: data.rpe ?? 7,
        // Notes are the athlete's own text: an emptied field clears them.
        notes: stripLegacyMarkers(data.notes) || null,
      } as any,
      include: {
        exercises: {
          orderBy: { id: 'asc' },
          include: {
            exercise: true,
            sets: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
  }

  /** A session started without network, created at its first sync with the app's id and start time. */
  private async createOfflineSession(
    userId: string,
    id: string,
    offline: NonNullable<FinishWorkoutDto['offline']>,
  ) {
    const startedAt = parseClientDate(offline.startedAt) ?? new Date();
    const title = typeof offline.title === 'string' ? offline.title.trim().slice(0, 120) || null : null;
    const routine =
      typeof offline.routineId === 'string'
        ? await this.prisma.routine.findFirst({ where: { id: offline.routineId, userId }, select: { id: true } })
        : null;
    try {
      return await this.prisma.workoutSession.create({
        data: { id, userId, startedAt, rpe: 0, title, routineId: routine?.id ?? null } as any,
      });
    } catch (err: any) {
      // Two syncs of the same session at once: the id is the primary key, the second finds the first
      if (err?.code === 'P2002') return this.prisma.workoutSession.findUnique({ where: { id } });
      throw err;
    }
  }

  async getHistory(userId: string) {
    return this.prisma.workoutSession.findMany({
      where: {
        userId,
        endedAt: {
          not: null,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      include: {
        routine: true,
        exercises: {
          // Session order, so the exercises of a superset come out side by side
          orderBy: { id: 'asc' },
          include: {
            exercise: true,
            // cuid ids grow with insertion: warm-ups stay ahead of the work sets
            sets: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
  }

  /** Lets the app check that a session saved on the device can still be resumed. */
  async getSessionStatus(userId: string, sessionId: string) {
    const session = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, startedAt: true, endedAt: true },
    });
    if (!session || session.userId !== userId) throw new NotFoundException('Session introuvable');
    return { id: session.id, startedAt: session.startedAt, endedAt: session.endedAt };
  }

  async deleteSession(userId: string, sessionId: string) {
    const session = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session introuvable');
    if (session.userId !== userId) throw new ForbiddenException('Non autorisé');

    await this.prisma.workoutSession.delete({
      where: { id: sessionId },
    });
    return { success: true };
  }

  async getExerciseStats(userId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) throw new NotFoundException('Exercice introuvable');

    const logs = await this.prisma.exerciseLog.findMany({
      where: {
        exerciseId,
        session: {
          userId,
          endedAt: { not: null },
        },
      },
      orderBy: {
        session: { startedAt: 'asc' },
      },
      include: {
        session: { select: { startedAt: true, rpe: true } },
        // cuid ids grow with insertion: keeps the sets in the order they were logged
        sets: { orderBy: { id: 'asc' } },
      },
    });

    let maxWeight = 0;
    let maxEstimated1RM = 0;
    let lastSet: { weight: number; reps: number; completed: boolean } | null = null;
    // Sets done on this exercise during the latest session, shown as "Précédent" in the logger and
    // progressed into the next targets: no warm-up nor drop set, and a set to failure says so
    let previousSets: Array<{ weight: number; reps: number; type: string }> = [];
    // Session RPE of that latest session: the next target holds the load after an all-out session
    let lastRpe: number | null = null;
    // When that latest session took place: a long break lowers the next target
    let lastDate: Date | null = null;
    let lastPerformance: Performance | null = null;
    const bodyweight = detectEquipment(exercise.name) === 'bodyweight';
    const historyPoints: Array<{ date: string; maxWeight: number; totalVolume: number; estimated1RM: number }> = [];

    for (const log of logs) {
      let sessionMaxWeight = 0;
      let sessionMax1RM = 0;
      let sessionVolume = 0;

      for (const set of log.sets) {
        if (set.completed && set.reps > 0 && isWorkSet(set) && (set.weight > 0 || bodyweight)) {
          if (drivesTarget(set)) lastSet = { weight: set.weight, reps: set.reps, completed: set.completed };
        }
        if (set.completed && set.weight > 0 && set.reps > 0 && isWorkSet(set)) {
          const estimated1RM = Math.round(set.weight * (1 + set.reps / 30) * 10) / 10;
          if (set.weight > maxWeight) maxWeight = set.weight;
          if (estimated1RM > maxEstimated1RM) maxEstimated1RM = estimated1RM;
          if (set.weight > sessionMaxWeight) sessionMaxWeight = set.weight;
          if (estimated1RM > sessionMax1RM) sessionMax1RM = estimated1RM;
          sessionVolume += set.weight * set.reps;
        }
      }

      // A bodyweight set at 0 kg is the movement done without a belt: it counts as last time
      const doneSets = log.sets.filter(
        (set) => set.completed && (set.weight > 0 || bodyweight) && set.reps > 0 && drivesTarget(set),
      );
      if (doneSets.length > 0) {
        previousSets = doneSets.map((set) => ({ weight: set.weight, reps: set.reps, type: set.type }));
        lastRpe = log.session.rpe || null;
        lastDate = log.session.startedAt;
        lastPerformance = topPerformance(exercise.name, log.sets, log.session.startedAt, log.session.rpe);
      }

      if (sessionMaxWeight > 0) {
        historyPoints.push({
          date: log.session.startedAt.toISOString().split('T')[0],
          maxWeight: sessionMaxWeight,
          totalVolume: sessionVolume,
          estimated1RM: sessionMax1RM,
        });
      }
    }

    // Next target, with the same rules as the session proposed on the dashboard
    const [profile, known] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      // Related lifts only help a movement never done that has some (deadlift from the squat...)
      lastPerformance || !usesRelatedLifts(exercise.name) ? Promise.resolve(new Map()) : this.lastPerformances(userId),
    ]);
    const goal = (profile as any)?.goal;
    const target = lastPerformance
      ? nextTarget(lastPerformance, exercise.name, goal)
      : startingTarget(exercise.name, goal, knownLifts(known), calibrationLoadFactor(profile as any));
    const recommendedOverload = {
      weight: target.weight,
      reps: target.reps,
      reason: target.note || describeTarget(target, detectEquipment(exercise.name) === 'bodyweight'),
    };

    return {
      exercise,
      maxWeight,
      maxEstimated1RM,
      lastSet,
      previousSets,
      lastRpe,
      lastDate: lastDate ? lastDate.toISOString() : null,
      recommendedOverload,
      historyPoints,
    };
  }

  async getDashboardStats(userId: string) {
    const allSessions = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        endedAt: { not: null },
      },
      include: {
        exercises: {
          include: { sets: true, exercise: { select: { name: true } } },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    const weekSessions = allSessions.filter(
      (s) => new Date(s.startedAt) >= oneWeekAgo,
    );

    let weekVolume = 0;
    let totalVolumeAllTime = 0;

    for (const session of allSessions) {
      let sessionVolume = 0;
      for (const ex of session.exercises) {
        for (const set of ex.sets) {
          if (set.completed && isWorkSet(set)) {
            sessionVolume += (set.weight || 0) * (set.reps || 0);
          }
        }
      }
      totalVolumeAllTime += sessionVolume;
      const startedAt = new Date(session.startedAt);
      if (startedAt >= oneWeekAgo) weekVolume += sessionVolume;
    }

    return {
      totalWorkouts: allSessions.length,
      workoutsThisWeek: weekSessions.length,
      weekVolume: Math.round(weekVolume),
      totalVolumeAllTime: Math.round(totalVolumeAllTime),
      recentSessionsCount: allSessions.length,
      // The overload signal: movements whose best set moves up over four weeks, whatever the session count
      overload: summarizeOverload(
        allSessions.flatMap((session) =>
          session.exercises.map((ex) => ({
            date: session.startedAt,
            exerciseId: ex.exerciseId,
            name: ex.exercise.name,
            sets: ex.sets,
          })),
        ),
        now,
      ),
    };
  }

  async getWarmupSets(targetWeight: number, barWeight = 20) {
    if (targetWeight <= barWeight) {
      return [
        { setNumber: 1, weight: barWeight, reps: 10, label: 'Barre à vide' }
      ];
    }

    const roundToPlate = (w: number) => Math.max(barWeight, Math.round(w / 2.5) * 2.5);

    const step1 = barWeight;
    const step2 = roundToPlate(targetWeight * 0.5);
    const step3 = roundToPlate(targetWeight * 0.7);
    const step4 = roundToPlate(targetWeight * 0.85);

    const sets = [
      { setNumber: 1, weight: step1, reps: 10, label: 'Barre à vide, pour chauffer les articulations' },
    ];

    if (step2 > step1 && step2 < targetWeight) {
      sets.push({ setNumber: 2, weight: step2, reps: 5, label: '50 % : on monte doucement' });
    }
    if (step3 > step2 && step3 < targetWeight) {
      sets.push({ setNumber: 3, weight: step3, reps: 3, label: '70 % : on prépare la charge' });
    }
    if (step4 > step3 && step4 < targetWeight) {
      sets.push({ setNumber: 4, weight: step4, reps: 1, label: '85 % : une rep pour sentir le poids' });
    }

    return sets;
  }

  async getAnalytics(userId: string) {
    const sessions = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        endedAt: { not: null },
      },
      include: {
        routine: true,
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    const muscleMap: Record<string, { volume: number; sets: number }> = {};
    let totalVolume = 0;

    const prMap: Record<string, {
      exerciseId: string;
      exerciseName: string;
      category: string;
      maxWeight: number;
      bestSet: { weight: number; reps: number };
      max1RM: number;
      date: string;
    }> = {};

    const weeksMap: Record<string, { volume: number; count: number }> = {};
    // Heaviest set of each session per exercise: the steps of the progression chart
    const liftMap: Record<string, {
      exerciseId: string;
      exerciseName: string;
      category: string;
      points: Array<{ date: string; weight: number; reps: number }>;
    }> = {};

    for (const session of sessions) {
      const sessionDate = new Date(session.startedAt);
      const year = sessionDate.getFullYear();
      const firstDayOfYear = new Date(year, 0, 1);
      const pastDaysOfYear = (sessionDate.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      const weekKey = `Sem ${weekNum}`;

      if (!weeksMap[weekKey]) {
        weeksMap[weekKey] = { volume: 0, count: 0 };
      }
      weeksMap[weekKey].count += 1;

      for (const exLog of session.exercises) {
        const exerciseData = exLog.exercise as any;
        const cat = exerciseData.category || 'Général';
        if (!muscleMap[cat]) {
          muscleMap[cat] = { volume: 0, sets: 0 };
        }

        const exId = exLog.exerciseId;
        if (!prMap[exId]) {
          prMap[exId] = {
            exerciseId: exId,
            exerciseName: exerciseData.name,
            category: cat,
            maxWeight: 0,
            bestSet: { weight: 0, reps: 0 },
            max1RM: 0,
            date: session.startedAt.toISOString().split('T')[0],
          };
        }

        let topSet: { weight: number; reps: number } | null = null;
        for (const set of exLog.sets) {
          if (set.completed && set.weight > 0 && set.reps > 0 && isWorkSet(set)) {
            if (!topSet || set.weight > topSet.weight || (set.weight === topSet.weight && set.reps > topSet.reps)) {
              topSet = { weight: set.weight, reps: set.reps };
            }
            const vol = set.weight * set.reps;
            totalVolume += vol;
            muscleMap[cat].volume += vol;
            muscleMap[cat].sets += 1;
            weeksMap[weekKey].volume += vol;

            const est1RM = Math.round(set.weight * (1 + set.reps / 30) * 10) / 10;
            if (set.weight > prMap[exId].maxWeight) {
              prMap[exId].maxWeight = set.weight;
              prMap[exId].bestSet = { weight: set.weight, reps: set.reps };
              prMap[exId].date = session.startedAt.toISOString().split('T')[0];
            }
            if (est1RM > prMap[exId].max1RM) {
              prMap[exId].max1RM = est1RM;
            }
          }
        }

        if (topSet) {
          if (!liftMap[exId]) {
            liftMap[exId] = { exerciseId: exId, exerciseName: exerciseData.name, category: cat, points: [] };
          }
          liftMap[exId].points.push({
            date: session.startedAt.toISOString().split('T')[0],
            weight: topSet.weight,
            reps: topSet.reps,
          });
        }
      }
    }

    // Key lifts: every movement trained twice, with its history (the last 120 sessions). The client
    // picks the period (4 weeks, 3 months, all) and the movements trained most within it
    const keyLifts = Object.values(liftMap)
      .filter((lift) => lift.points.length >= 2)
      .sort((a, b) => b.points.length - a.points.length || b.points[b.points.length - 1].weight - a.points[a.points.length - 1].weight)
      .map((lift) => ({ ...lift, points: lift.points.slice(-KEY_LIFT_MAX_POINTS) }));

    const muscleDistribution = Object.keys(muscleMap).map((cat) => ({
      category: cat,
      volume: Math.round(muscleMap[cat].volume),
      sets: muscleMap[cat].sets,
      percentage: totalVolume > 0 ? Math.round((muscleMap[cat].volume / totalVolume) * 100) : 0,
    })).sort((a, b) => b.volume - a.volume);

    const personalRecords = Object.values(prMap).filter(p => p.maxWeight > 0).sort((a, b) => b.maxWeight - a.maxWeight);

    const weeklyTrends = Object.keys(weeksMap).slice(-8).map((k) => ({
      label: k,
      volume: Math.round(weeksMap[k].volume),
      count: weeksMap[k].count,
    }));

    const has100kgLift = personalRecords.some(p => p.maxWeight >= 100);
    const routinesCount = await this.prisma.routine.count({ where: { userId } });

    const achievements = [
      {
        id: 'first_workout',
        title: 'Premier Pas 🎯',
        description: 'Enregistrer sa première séance d\'entraînement.',
        unlocked: sessions.length >= 1,
        progress: `${Math.min(1, sessions.length)}/1`,
      },
      {
        id: 'consistency_warrior',
        title: 'Guerrier Régulier 🔥',
        description: 'Compléter au moins 5 séances.',
        unlocked: sessions.length >= 5,
        progress: `${Math.min(5, sessions.length)}/5`,
      },
      {
        id: 'club_100kg',
        title: 'Club des 100 kg 🏆',
        description: 'Soulever 100 kg ou plus sur n\'importe quel exercice.',
        unlocked: has100kgLift,
        progress: has100kgLift ? 'Débloqué !' : 'À accomplir',
      },
      {
        id: 'volume_colossus',
        title: 'Colosse du Volume ⚡',
        description: 'Soulever plus de 10 000 kg au total.',
        unlocked: totalVolume >= 10000,
        progress: `${Math.min(10000, Math.round(totalVolume)).toLocaleString()} / 10 000 kg`,
      },
      {
        id: 'routine_master',
        title: 'Maître des Routines 📋',
        description: 'Créer au moins 1 programme d\'entraînement.',
        unlocked: routinesCount >= 1,
        progress: `${Math.min(1, routinesCount)}/1`,
      },
    ];

    return {
      totalVolume: Math.round(totalVolume),
      totalSessions: sessions.length,
      muscleDistribution,
      personalRecords,
      weeklyTrends,
      keyLifts,
      achievements,
    };
  }

  // Local and custom exercises come first so name matching and fallbacks
  // prefer the user's library over the wger import.
  private async getExercisePool() {
    const all = await this.prisma.exercise.findMany();
    return [...all.filter((e) => e.source !== 'wger'), ...all.filter((e) => e.source === 'wger')];
  }

  private findMatchingExercise(aiName: string, aiCategory: string, allExercises: any[]): any {
    if (!allExercises || allExercises.length === 0) return null;
    const cleanAi = (aiName || '').toLowerCase().trim();

    // 1. Exact match
    const exact = allExercises.find((e) => e.name.toLowerCase() === cleanAi);
    if (exact) return exact;

    // 2. Substring match
    const contains = allExercises.find((e) => {
      const dbName = e.name.toLowerCase();
      return dbName.includes(cleanAi) || cleanAi.includes(dbName);
    });
    if (contains) return contains;

    // 3. Keyword matching (bench, squat, deadlift, curl, press, row, pull, dips, crunch)
    const keywords = ['bench', 'squat', 'deadlift', 'curl', 'press', 'row', 'pull', 'dips', 'crunch', 'extension', 'raise'];
    for (const kw of keywords) {
      if (cleanAi.includes(kw)) {
        const match = allExercises.find((e) => e.name.toLowerCase().includes(kw));
        if (match) return match;
      }
    }

    // 4. Category match
    if (aiCategory) {
      const catMatch = allExercises.find(
        (e) => (e.category || '').toLowerCase() === aiCategory.toLowerCase(),
      );
      if (catMatch) return catMatch;
    }

    // 5. Fallback: first available
    return allExercises[0];
  }

  /** Last performance of each movement the athlete trained, by exercise id, in one query. */
  private async lastPerformances(userId: string): Promise<Map<string, Performance & { name: string }>> {
    // The whole history: a movement left for months still has its last load, lowered by the break
    const logs = await this.prisma.exerciseLog.findMany({
      where: { session: { userId, endedAt: { not: null } } },
      orderBy: { session: { startedAt: 'desc' } },
      select: {
        exerciseId: true,
        exercise: { select: { name: true } },
        session: { select: { startedAt: true, rpe: true } },
        sets: { select: { weight: true, reps: true, completed: true, type: true } },
      },
    });
    const performances = new Map<string, Performance & { name: string }>();
    for (const log of logs) {
      if (performances.has(log.exerciseId)) continue;
      // A log with nothing validated (session cut short) leaves the older one in charge
      const top = topPerformance(log.exercise.name, log.sets, log.session.startedAt, log.session.rpe);
      if (top) performances.set(log.exerciseId, { ...top, name: log.exercise.name });
    }
    return performances;
  }

  /** Target of one movement: its progression when the athlete trained it, else a starting load. */
  private targetFor(
    exercise: { id: string; name: string },
    goal: string,
    performances: Map<string, Performance & { name: string }>,
    loadFactor: number,
  ): { weight: number; reps: number; note?: string } {
    const last = performances.get(exercise.id);
    return last ? nextTarget(last, exercise.name, goal) : startingTarget(exercise.name, goal, knownLifts(performances), loadFactor);
  }

  /** The sets Atlas planned for one movement, kept within the same rules as the local engine. */
  private guardAtlasSets(
    exercise: { id: string; name: string },
    sets: Array<{ weight: number; reps: number }>,
    goal: string,
    performances: Map<string, Performance & { name: string }>,
    loadFactor: number,
  ) {
    const last = performances.get(exercise.id) || null;
    const start = startingTarget(exercise.name, goal, knownLifts(performances), loadFactor);
    return guardSets(sets, exercise.name, { goal, last, start });
  }

  async getNextRecommendedWorkout(userId: string, forceFreshAi = false, instructions?: string) {
    const pending = this.recommendationInFlight.get(userId);
    // Dashboard loads (often two at once) share the running generation instead of queueing another AI call
    if (pending && !forceFreshAi) return pending;
    // A regeneration waits for it: it then edits the session just proposed, without competing for the AI
    if (pending) await pending.catch(() => undefined);

    const run = this.computeNextRecommendedWorkout(userId, forceFreshAi, instructions);
    this.recommendationInFlight.set(userId, run);
    try {
      return await run;
    } finally {
      if (this.recommendationInFlight.get(userId) === run) this.recommendationInFlight.delete(userId);
    }
  }

  private async computeNextRecommendedWorkout(userId: string, forceFreshAi: boolean, instructions?: string) {
    const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    // What the athlete wants changed in the session currently proposed ("plus court", "pas de squat"...)
    const athleteRequest =
      typeof instructions === 'string' ? instructions.trim().slice(0, REGENERATE_MAX_INSTRUCTIONS) : '';
    const proposedSession = athleteRequest ? this.recommendationCache.get(userId)?.data : null;

    if (!forceFreshAi && this.recommendationCache.has(userId)) {
      const cached = this.recommendationCache.get(userId)!;
      // A profile edit (weight, experience...) makes the cached loads stale.
      const profileChangedAt = profile?.updatedAt ? profile.updatedAt.getTime() : 0;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.timestamp >= profileChangedAt) {
        return cached.data;
      }
    }
    const goal = ((profile as any)?.goal || 'BODYBUILDING').toUpperCase();

    // Last session to detect muscle fatigue & rotation
    const lastSession = await this.prisma.workoutSession.findFirst({
      where: { userId, endedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
        },
      },
    });

    // Only the movements the athlete's equipment allows, for Atlas as for the local engine
    const pool = await this.getExercisePool();
    const equipment = (profile as any)?.equipment;
    const allExercises = pool.filter((e) => fitsEquipment(e.name, equipment));
    // Sensitive areas of the profile and of the request: both Atlas and the local engine leave out
    // what the pain table rules out, and lighten the single-joint work around the area
    // A pain written at a regeneration still holds for the next one, which edits that session
    const areas = sensitiveAreas(
      [...painAreasOf((profile as any)?.painAreas), ...(proposedSession?.sensitiveAreas || [])],
      athleteRequest,
    );
    const pain = new PainReportBuilder();
    const appLibrary = allExercises.filter((e) => e.source !== 'wger');

    const goalMetadata: Record<
      string,
      {
        label: string;
        icon: string;
        description: string;
        repRange: string;
        restTime: string;
        repTarget: string;
        restTarget: string;
      }
    > = {
      FORCE: {
        label: 'Force Maximale',
        icon: '🔴',
        description:
          'Développement de la force pure et de la puissance. Séries courtes et lourdes pour maximiser le recrutement des unités motrices.',
        repRange: '3 - 5 reps',
        repTarget: '3 - 5 reps lourdes',
        restTime: '3 - 4 min',
        restTarget: '3 - 4 min',
      },
      BODYBUILDING: {
        label: 'Bodybuilding / Hypertrophie',
        icon: '🟣',
        description:
          'Construction de volume musculaire et esthétique. Séries moyennes avec surcharge progressive et temps sous tension.',
        repRange: '8 - 12 reps',
        repTarget: '8 - 12 reps',
        restTime: '75 - 90s',
        restTarget: '75 - 90s',
      },
      ENDURANCE: {
        label: 'Endurance Musculaire',
        icon: '🟢',
        description:
          'Résistance à la fatigue, tonicité et capacité cardiovasculaire. Séries longues avec repos minimaux pour congestion dense.',
        repRange: '15 - 20 reps',
        repTarget: '15 - 20 reps',
        restTime: '30 - 45s',
        restTarget: '30 - 45s',
      },
      HEALTH: {
        label: 'Santé / remise en forme',
        icon: '🔵',
        description:
          'Bouger mieux et se renforcer sans se mettre dans le rouge. Séries de 12 à 15 reps en gardant de la marge, jamais jusqu’à l’échec.',
        repRange: '12 - 15 reps',
        repTarget: '12 - 15 reps, avec de la marge',
        restTime: '60s',
        restTarget: '60s',
      },
    };

    const currentMeta = goalMetadata[goal] || goalMetadata.BODYBUILDING;

    // Phase d'évaluation : Semaine Test de calibration pour l'athlète
    const isTestWeekActive =
      !Boolean((profile as any)?.testWeekCompleted) &&
      Number((profile as any)?.testWeekProgress || 0) < 3;

    if (isTestWeekActive) {
      const nextStep = Math.min(3, Number((profile as any)?.testWeekProgress || 0) + 1);
      return this.generateTestWeekRecommendation(userId, goal, nextStep, pool, currentMeta, profile);
    }

    // Last performance of each movement, read while Atlas thinks: his loads and the local
    // engine's follow the same rules. A failure is raised where it is awaited, below.
    const performancesQuery = this.lastPerformances(userId);
    performancesQuery.catch(() => undefined);

    // Try AI Generation with Pollinations Bodybuilding Coach
    let aiWorkout = null;
    try {
      let lastSessionContext = null;
      if (lastSession) {
        lastSessionContext = {
          title: (lastSession as any)?.title || 'Dernière séance',
          startedAt: lastSession.startedAt.toISOString().split('T')[0],
          exercises: lastSession.exercises.map((el) => {
            // Atlas reads the work sets only: a warm-up or a drop set says nothing of the working load
            const workSets = el.sets.filter((s) => s.completed && drivesTarget(s));
            const maxW = workSets.reduce((max, s) => (s.weight > max ? s.weight : max), 0);
            const rep = workSets.find((s) => s.weight === maxW)?.reps || 10;
            return {
              name: el.exercise.name,
              category: (el.exercise as any).category,
              maxWeight: maxW,
              reps: rep,
            };
          }),
        };
      }

      const testedBenchmarks = await this.getTestedBenchmarks(userId);

      aiWorkout = await this.aiService.generateWorkoutSession({
        goal,
        weight: (profile as any)?.weight || 75,
        height: (profile as any)?.height || 178,
        athlete: describeAthlete(profile as any),
        constraints: athleteConstraints(profile as any),
        sensitiveAreas: areas,
        benchmarks: testedBenchmarks,
        lastSession: lastSessionContext,
        athleteRequest: athleteRequest || undefined,
        proposedSession: proposedSession?.exercises?.length
          ? {
              title: proposedSession.title,
              exercises: proposedSession.exercises.map((ex: any) => ({
                name: ex.name,
                sets: ex.sets?.length || 0,
                reps: ex.sets?.[0]?.reps,
                weight: ex.sets?.[0]?.weight,
              })),
            }
          : null,
        // The wger import adds ~900 exercises: only the app library is offered to the AI.
        availableExercises: allExercises.filter((e) => e.source !== 'wger').map((e) => ({
          id: e.id,
          name: e.name,
          category: (e as any).category || 'Général',
        })),
        // A regeneration is asked by the athlete, who waits for it: it gets more time than the dashboard load
      }, forceFreshAi ? 45000 : 28000);
    } catch (aiErr: any) {
      this.logger.warn(`AI Generation invocation error: ${aiErr.message}`);
    }

    const performances = await performancesQuery;
    const loadFactor = calibrationLoadFactor(profile as any);

    if (aiWorkout && aiWorkout.exercises && aiWorkout.exercises.length > 0) {
      // Map AI exercises to DB exercises
      const mappedExercises: any[] = [];
      const usedIds = new Set<string>();

      for (const aiEx of aiWorkout.exercises) {
        let matchedDbEx = this.findMatchingExercise(aiEx.name, aiEx.category, allExercises);
        // Avoid duplicate exercise in the same session if possible
        if (matchedDbEx && usedIds.has(matchedDbEx.id)) {
          const alternate = allExercises.find(
            (e) => !usedIds.has(e.id) && ((e as any).category || '').toLowerCase() === (aiEx.category || '').toLowerCase(),
          );
          if (alternate) matchedDbEx = alternate;
        }
        // Checked against the pain table after generation: swapped for a safe movement, without asking the AI again
        const screened = matchedDbEx ? screenMovement(matchedDbEx, areas, appLibrary, usedIds, pain) : null;
        // A stand-in does not inherit the advice written for the movement it replaces
        const swapped = !!screened && screened.exercise !== matchedDbEx;
        matchedDbEx = screened?.exercise;

        if (matchedDbEx) {
          usedIds.add(matchedDbEx.id);
          // Atlas's loads are bounded by the athlete's history: no jump, no drop on a target held
          // A stand-in gets no load from Atlas: its own last load, or its starting load
          const aiSets = aiEx.sets?.length
            ? aiEx.sets.map((s) => (swapped ? { ...s, weight: 0 } : s))
            : Array.from({ length: 3 }, (_, i) => ({ setNumber: i + 1, weight: 0, reps: 0 }));
          const guarded = this.guardAtlasSets(matchedDbEx, aiSets, goal, performances, loadFactor);
          const note = guarded.note;
          const careful = screened!.careful;
          const sets = guarded.sets.map((s, idx) => ({
            setNumber: aiSets[idx].setNumber || idx + 1,
            weight: careful ? cautionLoad(s.weight, matchedDbEx.name) : s.weight,
            reps: s.reps,
            completed: false,
          }));

          mappedExercises.push({
            exerciseId: matchedDbEx.id,
            name: matchedDbEx.name,
            category: (matchedDbEx as any).category || aiEx.category || 'Général',
            targetAdvice: careful ? CAUTION_ADVICE : (!swapped && aiEx.targetAdvice) || currentMeta.repTarget,
            reason: note || (swapped ? 'Remplace un mouvement écarté pour ta douleur' : aiEx.reason) || 'Recommandé pour ta progression',
            sets,
          });
        }
      }

      if (mappedExercises.length > 0) {
        pain.noteRuledOut(
          mappedExercises.map((ex) => ex.category),
          appLibrary,
          areas,
        );
        const result = {
          aiGenerated: true,
          aiModel: 'Coach IA Musculation (Pollinations CSCS)',
          title: aiWorkout.title || `Séance ${currentMeta.label} — ${aiWorkout.focusMuscle || 'Full Body'}`,
          goal,
          goalDetails: currentMeta,
          focusMuscle: aiWorkout.focusMuscle || 'Haut / Bas du corps',
          rationale: aiWorkout.rationale,
          coachingTips: aiWorkout.coachingTips || [
            'Échauffe bien tes articulations et tes épaules.',
            'Descends en 2 à 3 secondes.',
            'Respecte les temps de repos indiqués.',
          ],
          exercises: mappedExercises,
          sensitiveAreas: areas,
          ...pain.build(),
        };

        this.recommendationCache.set(userId, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    // Fallback: Deterministic Overload Engine
    const lastCategories: string[] = [];
    if (lastSession) {
      for (const exLog of lastSession.exercises) {
        const cat = (exLog.exercise as any).category;
        if (cat && !lastCategories.includes(cat)) {
          lastCategories.push(cat);
        }
      }
    }

    let targetFocus = 'Pectoraux & Triceps';
    let targetCategories = ['Pectoraux', 'Épaules', 'Bras'];

    if (lastCategories.some((c) => c === 'Pectoraux' || c === 'Épaules')) {
      targetFocus = 'Dos & Biceps';
      targetCategories = ['Dos', 'Bras'];
    } else if (lastCategories.some((c) => c === 'Dos')) {
      targetFocus = 'Jambes & Abdominaux';
      targetCategories = ['Jambes', 'Abdominaux'];
    } else if (lastCategories.some((c) => c === 'Jambes')) {
      targetFocus = 'Pectoraux & Épaules';
      targetCategories = ['Pectoraux', 'Épaules', 'Bras'];
    }

    // The first movements of the focus the pain table allows, then what it ruled out for those groups.
    // Atlas may have left notes in the report before failing: the local session starts afresh.
    const localPain = new PainReportBuilder();
    const pickAllowed = (candidates: typeof allExercises, count: number) => {
      const picked: Array<{ exercise: (typeof allExercises)[number]; careful: boolean }> = [];
      for (const exercise of candidates) {
        if (picked.length >= count) break;
        const check = checkMovement(exercise.name, areas);
        if (check.status === 'avoid') continue;
        if (check.status === 'caution') localPain.noteCaution(check.area);
        picked.push({ exercise, careful: check.status === 'caution' });
      }
      return picked;
    };
    const selectedExercises = pickAllowed(
      allExercises.filter((ex) => targetCategories.includes((ex as any).category)),
      4,
    );
    const finalExercises = selectedExercises.length > 0 ? selectedExercises : pickAllowed(allExercises, 3);
    localPain.noteRuledOut(
      finalExercises.map(({ exercise }) => (exercise as any).category),
      appLibrary,
      areas,
    );

    const fallbackExercises = [];

    const setsCount = goal === 'ENDURANCE' || goal === 'HEALTH' ? 3 : 4;
    const targetAdvice =
      goal === 'FORCE'
        ? 'Charge lourde • Repos 3-4 min • Intensité 85% 1RM'
        : goal === 'ENDURANCE'
        ? 'Cadence continue • Repos 45s • Densité musculaire'
        : goal === 'HEALTH'
        ? 'Garde 3 reps en réserve • Repos 60s • Jamais jusqu’à l’échec'
        : 'Tension continue • Repos 75-90s • Focus congestion';

    for (const { exercise: ex, careful } of finalExercises) {
      // Double progression on the last performance, else a starting load scaled to the athlete
      const target = this.targetFor(ex, goal, performances, loadFactor);
      fallbackExercises.push({
        exerciseId: ex.id,
        name: ex.name,
        category: (ex as any).category || 'Général',
        targetAdvice: careful ? CAUTION_ADVICE : targetAdvice,
        reason: target.note || 'Surcharge progressive calculée sur ton historique',
        sets: Array.from({ length: setsCount }, (_, i) => ({
          setNumber: i + 1,
          weight: careful ? cautionLoad(target.weight, ex.name) : target.weight,
          reps: target.reps,
          completed: false,
        })),
      });
    }

    const fallbackResult = {
      aiGenerated: false,
      aiModel: 'Moteur Algorithmique Local (Surcharge)',
      title: `Séance ${currentMeta.label} — ${targetFocus}`,
      goal,
      goalDetails: currentMeta,
      focusMuscle: targetFocus,
      rationale: lastSession
        ? `Préparée après ta dernière séance : d’autres muscles cette fois, pour que les premiers récupèrent.`
        : `Ta première séance, réglée pour ton objectif : ${currentMeta.label.toLowerCase()}.`,
      coachingTips: [
        'Échauffe-toi 5 à 10 minutes avant les séries lourdes.',
        'Freine chaque descente : tes articulations te remercieront.',
        'Prends le temps de récupérer entre les séries.',
      ],
      exercises: fallbackExercises,
      sensitiveAreas: areas,
      ...localPain.build(),
    };

    this.recommendationCache.set(userId, { data: fallbackResult, timestamp: Date.now() });
    return fallbackResult;
  }

  /**
   * Chat with the AI coach. Returns the coach's message and the proposed sessions, each one
   * mapped to real exercises and ready to be started with startRecommendedWorkout.
   */
  async coachChat(userId: string, rawMessages: unknown) {
    const messages: CoachChatMessage[] = (Array.isArray(rawMessages) ? rawMessages : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-COACH_MAX_MESSAGES)
      .map((m: any) => ({ role: m.role, content: m.content.trim().slice(0, COACH_MAX_MESSAGE_LENGTH) }));

    // The conversation sent to the model must start and end with the athlete.
    while (messages.length > 0 && messages[0].role !== 'user') messages.shift();
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Dis à Atlas ce que tu veux travailler.');
    }

    const [profile, benchmarks, recent, fullPool, performances] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.getTestedBenchmarks(userId),
      this.prisma.workoutSession.findMany({
        where: { userId, endedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: 3,
        include: { exercises: { include: { exercise: true } } },
      }),
      this.getExercisePool(),
      this.lastPerformances(userId),
    ]);
    const goal = (profile as any)?.goal || 'BODYBUILDING';
    const loadFactor = calibrationLoadFactor(profile as any);
    const pool = fullPool.filter((e) => fitsEquipment(e.name, (profile as any)?.equipment));
    const appLibrary = pool.filter((e) => e.source !== 'wger');
    // Pains of the profile and those the athlete wrote anywhere in the conversation
    const areas = sensitiveAreas(
      painAreasOf((profile as any)?.painAreas),
      ...messages.filter((m) => m.role === 'user').map((m) => m.content),
    );

    const reply = await this.aiService.coachChat({
      goal,
      weight: (profile as any)?.weight,
      height: (profile as any)?.height,
      athlete: describeAthlete(profile as any),
      constraints: athleteConstraints(profile as any),
      sensitiveAreas: areas,
      benchmarks,
      recentSessions: recent.map((s) => ({
        date: s.startedAt.toISOString().split('T')[0],
        title: ((s as any).title || 'Séance libre').slice(0, 80),
        exercises: s.exercises.map((e) => e.exercise.name),
      })),
      availableExercises: appLibrary.map((e) => e.name),
      messages,
    });

    if (!reply) {
      throw new ServiceUnavailableException('Atlas ne répond pas pour le moment. Réessaie dans quelques secondes.');
    }

    const workouts = reply.workouts
      .map((w) => {
        // Each session is checked against the pain table, without asking the AI again
        const pain = new PainReportBuilder();
        const usedIds = new Set<string>();
        const exercises = w.exercises.flatMap((ex) => {
          const matched = this.findMatchingExercise(ex.name, '', pool);
          const screened = matched ? screenMovement(matched, areas, appLibrary, usedIds, pain) : null;
          if (!screened) return [];
          const dbEx = screened.exercise;
          usedIds.add(dbEx.id);
          // Same guard-rails as the dashboard session: no jump, no drop on a target held
          // A stand-in gets no load from Atlas: its own last load, or its starting load
          const asked = dbEx === matched ? ex.weight : 0;
          const guarded = this.guardAtlasSets(dbEx, [{ weight: asked, reps: ex.reps }], goal, performances, loadFactor);
          const target = { ...guarded.sets[0], note: guarded.note };
          const weight = screened.careful ? cautionLoad(target.weight, dbEx.name) : target.weight;
          // A stand-in keeps the sets and rest, not the tip written for the movement it replaces
          const tip = screened.careful ? CAUTION_ADVICE : target.note || (dbEx === matched ? ex.tip : '');
          return [
            {
              exerciseId: dbEx.id,
              name: dbEx.name,
              category: dbEx.category,
              rest: ex.rest,
              targetAdvice: [`${ex.sets}×${target.reps}`, ex.rest && `repos ${ex.rest}`, tip].filter(Boolean).join(' · '),
              sets: Array.from({ length: ex.sets }, (_, i) => ({ setNumber: i + 1, weight, reps: target.reps })),
            },
          ];
        });
        pain.noteRuledOut(
          exercises.map((ex) => ex.category),
          appLibrary,
          areas,
        );
        return {
          title: w.title,
          focus: w.focus,
          durationMin: w.durationMin,
          notes: w.notes,
          exercises,
          ...pain.build(),
        };
      });
    const kept = workouts.filter((w) => w.exercises.length > 0);
    const dropped = workouts.length - kept.length;
    return {
      message:
        dropped > 0
          ? `${reply.message}\n${
              dropped > 1 ? `${dropped} séances proposées ne gardaient` : 'Une séance proposée ne gardait'
            } que des mouvements à éviter pour ta douleur : je ${dropped > 1 ? 'les ai retirées' : "l'ai retirée"}.`
          : reply.message,
      workouts: kept,
    };
  }

  async startRecommendedWorkout(userId: string, customRec?: any) {
    const recommendation = customRec?.exercises?.length
      ? customRec
      : await this.getNextRecommendedWorkout(userId);

    const newSession = await this.prisma.workoutSession.create({
      data: {
        userId,
        rpe: 0,
        title: recommendation.title,
        testWeekStep: recommendation.isTestWeek ? Number(recommendation.testStep) || null : null,
      } as any,
    });

    for (const exRec of recommendation.exercises) {
      const exLog = await this.prisma.exerciseLog.create({
        data: {
          sessionId: newSession.id,
          exerciseId: exRec.exerciseId,
        },
      });

      // The recommended loads stay in the recommendation: the athlete enters what they actually lift
      await this.createEmptySets(exLog.id, exRec.sets?.length || 3);
    }

    return this.prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          // cuid ids grow with insertion: keeps the order the logs were created in
          orderBy: { id: 'asc' },
          include: {
            exercise: true,
            sets: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
  }

  /** Sets with no load nor reps yet: the athlete fills them in while training. */
  private async createEmptySets(exerciseLogId: string, count: number) {
    await this.prisma.setLog.createMany({
      data: Array.from({ length: count }, () => ({ exerciseLogId, reps: 0, weight: 0, completed: false })),
    });
  }

  getTestWeekTemplates(goal = 'BODYBUILDING') {
    const upperGoal = (goal || 'BODYBUILDING').toUpperCase();

    if (upperGoal === 'FORCE') {
      return [
        {
          step: 1,
          dayName: 'Jour 1 (Lundi)',
          name: 'Poussée lourde',
          focus: 'Pectoraux, Épaules, Triceps',
          badge: '3 à 5 reps lourdes · Poussée',
          testingGoal: 'Trouver la charge que tu soulèves 3 à 5 fois au développé couché, et ta force aux épaules.',
          instructions: [
            'Échauffe-toi avec les séries de montée proposées.',
            'Monte la charge par paliers jusqu’à une série de 3 à 5 reps lourdes, en gardant 1 ou 2 reps en réserve.',
            'Repose-toi 3 minutes entre les séries.',
            'Arrête la série dès que ta technique se dégrade.',
          ],
          exercises: [
            {
              name: 'Bench Press (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM estimé au développé couché',
              defaultWeight: 60,
              sets: 4,
              reps: 5,
              targetAdvice: 'Mouvement de référence. Vise 3 à 5 reps propres, avec 1 ou 2 reps en réserve. Repos 3 min.',
              reason: 'Mesure ta force de poussée devant toi.',
            },
            {
              name: 'Overhead Press (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force de poussée au-dessus de la tête',
              defaultWeight: 16,
              sets: 3,
              reps: 5,
              targetAdvice: 'Séries lourdes et stables. Serre les abdos. Repos 2 à 3 min.',
              reason: 'Mesure la force et la stabilité de tes épaules.',
            },
            {
              name: 'Incline Dumbbell Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force du haut des pectoraux',
              defaultWeight: 22,
              sets: 3,
              reps: 5,
              targetAdvice: 'Descends en 2 secondes, pousse fort. Repos 2 à 3 min.',
              reason: 'Mesure ta force sur banc incliné.',
            },
            {
              name: 'Tricep Extension (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force des triceps',
              defaultWeight: 25,
              sets: 3,
              reps: 6,
              targetAdvice: 'Coudes collés au corps, bras tendus en bas. Repos 90 s.',
              reason: 'Mesure la force de tes triceps.',
            },
          ],
        },
        {
          step: 2,
          dayName: 'Jour 2 (Mercredi)',
          name: 'Tirage lourd',
          focus: 'Dos, Ischios, Biceps',
          badge: '3 à 5 reps lourdes · Tirage',
          testingGoal: 'Mesurer ta force au soulevé de terre et sur les tirages lourds.',
          instructions: [
            'Garde le dos plat et gainé au soulevé de terre.',
            'Vise une série de 3 à 5 reps lourdes mais maîtrisées.',
            'Repose-toi 3 minutes entre les séries de soulevé de terre.',
          ],
          exercises: [
            {
              name: 'Deadlift (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM estimé au soulevé de terre',
              defaultWeight: 80,
              sets: 4,
              reps: 5,
              targetAdvice: 'Mouvement de référence. Tire fort, serre les fessiers en haut. Repos 3 min.',
              reason: 'Mesure la force de tout l’arrière du corps.',
            },
            {
              name: 'Barbell Row',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force de tirage vers toi',
              defaultWeight: 50,
              sets: 3,
              reps: 5,
              targetAdvice: 'Buste penché à 45°, tire les coudes vers les hanches. Repos 2 min.',
              reason: 'Mesure la force de ton dos.',
            },
            {
              name: 'Lat Pulldown (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force de tirage vers le bas',
              defaultWeight: 55,
              sets: 3,
              reps: 5,
              targetAdvice: 'Poitrine sortie, tire la barre vers le haut de la poitrine. Repos 2 min.',
              reason: 'Mesure la force de tes dorsaux.',
            },
            {
              name: 'Bicep Curl (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force des biceps',
              defaultWeight: 14,
              sets: 3,
              reps: 6,
              targetAdvice: 'Freine la descente. Repos 90 s.',
              reason: 'Mesure la force de tes biceps.',
            },
          ],
        },
        {
          step: 3,
          dayName: 'Jour 3 (Vendredi)',
          name: 'Jambes et tronc, lourd',
          focus: 'Quadriceps, Fessiers, Ischios, Tronc',
          badge: '3 à 5 reps lourdes · Jambes',
          testingGoal: 'Mesurer ta force au squat et ton gainage sous charge.',
          instructions: [
            'Descends au moins jusqu’aux cuisses horizontales.',
            'Inspire et bloque ton ventre avant de descendre.',
            'Repose-toi 3 minutes entre les séries lourdes.',
          ],
          exercises: [
            {
              name: 'Squat (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM estimé au squat',
              defaultWeight: 70,
              sets: 4,
              reps: 5,
              targetAdvice: 'Mouvement de référence. Descends complètement, pousse dans les talons. Repos 3 min.',
              reason: 'Mesure la force de tes jambes.',
            },
            {
              name: 'Leg Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force à la presse',
              defaultWeight: 120,
              sets: 3,
              reps: 5,
              targetAdvice: 'Pieds largeur d’épaules, descends bas sans décoller le bassin. Repos 2 min.',
              reason: 'Mesure ta force de jambes sans charger le dos.',
            },
            {
              name: 'Romanian Deadlift',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force des ischios',
              defaultWeight: 60,
              sets: 3,
              reps: 5,
              targetAdvice: 'Pousse les hanches en arrière, sens l’étirement derrière les cuisses. Repos 2 min.',
              reason: 'Mesure la force de l’arrière de tes cuisses.',
            },
            {
              name: 'Cable Crunch / Abs',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force des abdos',
              defaultWeight: 30,
              sets: 3,
              reps: 8,
              targetAdvice: 'Enroule le dos lentement, serre fort les abdos. Repos 60 s.',
              reason: 'Mesure la force de tes abdos.',
            },
          ],
        },
      ];
    }

    if (upperGoal === 'ENDURANCE') {
      return [
        {
          step: 1,
          dayName: 'Jour 1 (Lundi)',
          name: 'Poussée en endurance',
          focus: 'Pectoraux, Épaules, Triceps',
          badge: '15 à 20 reps · Poussée',
          testingGoal: 'Mesurer ton endurance sur les poussées, avec des repos courts.',
          instructions: [
            'Fais des séries de 15 à 20 reps, à rythme régulier.',
            'Repose-toi 45 secondes, pas plus.',
            'Tiens malgré la brûlure, sans bloquer ta respiration.',
          ],
          exercises: [
            {
              name: 'Bench Press (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance au développé couché',
              defaultWeight: 40,
              sets: 3,
              reps: 18,
              targetAdvice: 'Mouvement de référence. 15 à 20 reps fluides, charge modérée : 2 secondes pour descendre, 1 pour monter. Repos 45 s.',
              reason: 'Mesure l’endurance de tes pectoraux.',
            },
            {
              name: 'Incline Dumbbell Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance du haut des pectoraux',
              defaultWeight: 14,
              sets: 3,
              reps: 15,
              targetAdvice: 'Mouvement continu, sans pause en bas. Repos 45 s.',
              reason: 'Mesure l’endurance du haut de ta poitrine.',
            },
            {
              name: 'Lateral Raise (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance des épaules',
              defaultWeight: 8,
              sets: 3,
              reps: 20,
              targetAdvice: 'Monte en contrôlant, la brûlure est normale. Repos 30 s.',
              reason: 'Mesure l’endurance de tes épaules.',
            },
            {
              name: 'Tricep Extension (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance des triceps',
              defaultWeight: 18,
              sets: 3,
              reps: 20,
              targetAdvice: 'Bras tendus en bas, sans pause. Repos 30 s.',
              reason: 'Mesure l’endurance de tes triceps.',
            },
          ],
        },
        {
          step: 2,
          dayName: 'Jour 2 (Mercredi)',
          name: 'Tirage en endurance',
          focus: 'Dos, Biceps, Arrière d’épaules',
          badge: '15 à 20 reps · Tirage',
          testingGoal: 'Mesurer l’endurance de ton dos et de ta prise.',
          instructions: [
            'Tire sur toute l’amplitude.',
            'Garde ton souffle et repose-toi 45 secondes.',
          ],
          exercises: [
            {
              name: 'Lat Pulldown (Cable)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance des dorsaux',
              defaultWeight: 40,
              sets: 3,
              reps: 18,
              targetAdvice: 'Mouvement de référence. 15 à 20 reps continues, sans à-coups. Repos 45 s.',
              reason: 'Mesure l’endurance de ton dos.',
            },
            {
              name: 'Barbell Row',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance au rowing',
              defaultWeight: 35,
              sets: 3,
              reps: 15,
              targetAdvice: 'Dos fixe, rythme constant. Repos 45 s.',
              reason: 'Mesure ta tenue du dos dans la fatigue.',
            },
            {
              name: 'Romanian Deadlift',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance des ischios et du bas du dos',
              defaultWeight: 40,
              sets: 3,
              reps: 15,
              targetAdvice: 'Charge légère, rythme continu, sens l’étirement. Repos 45 s.',
              reason: 'Mesure l’endurance de l’arrière du corps.',
            },
            {
              name: 'Bicep Curl (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance des biceps',
              defaultWeight: 10,
              sets: 3,
              reps: 18,
              targetAdvice: 'Monte sans élan. Repos 30 s.',
              reason: 'Mesure l’endurance de tes biceps.',
            },
          ],
        },
        {
          step: 3,
          dayName: 'Jour 3 (Vendredi)',
          name: 'Jambes en endurance',
          focus: 'Quadriceps, Fessiers, Abdos',
          badge: '15 à 20 reps · Jambes',
          testingGoal: 'Mesurer combien de travail tes jambes encaissent.',
          instructions: [
            'Fais des séries longues sur les jambes.',
            'Bois entre les séries et garde un rythme régulier.',
          ],
          exercises: [
            {
              name: 'Squat (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance au squat',
              defaultWeight: 45,
              sets: 3,
              reps: 18,
              targetAdvice: 'Mouvement de référence. 15 à 20 squats profonds et dynamiques. Repos 45 à 60 s.',
              reason: 'Mesure l’endurance de tes jambes et ton souffle.',
            },
            {
              name: 'Leg Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance à la presse',
              defaultWeight: 80,
              sets: 3,
              reps: 20,
              targetAdvice: 'Pousse en continu, sans verrouiller les genoux en haut. Repos 45 s.',
              reason: 'Mesure l’endurance de tes cuisses et fessiers.',
            },
            {
              name: 'Cable Crunch / Abs',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance des abdos',
              defaultWeight: 25,
              sets: 3,
              reps: 20,
              targetAdvice: 'Enroule le buste à rythme constant. Repos 30 s.',
              reason: 'Mesure l’endurance de ta sangle abdominale.',
            },
          ],
        },
      ];
    }

    // Default: BODYBUILDING
    return [
      {
        step: 1,
        dayName: 'Jour 1 (Lundi)',
        name: 'Poussée',
        focus: 'Pectoraux, Épaules, Triceps',
        badge: '8 à 10 reps · Poussée',
        testingGoal: 'Trouver la charge que tu soulèves 8 à 10 fois en gardant 1 ou 2 reps en réserve.',
        instructions: [
          'Descends en 2 à 3 secondes.',
          'À la 10e rep, il doit te rester 1 ou 2 reps en réserve.',
          'Repose-toi 90 secondes entre les séries.',
          'Note les charges que tu as vraiment soulevées : elles règlent tes prochaines séances.',
        ],
        exercises: [
          {
            name: 'Bench Press (Barbell)',
            isKeyBenchmark: true,
            benchmarkMetric: 'Ta charge pour 10 reps au développé couché',
            defaultWeight: 50,
            sets: 4,
            reps: 10,
            targetAdvice: 'Mouvement de référence. 8 à 10 reps, 2 secondes pour descendre, 1 ou 2 reps en réserve. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour les pectoraux.',
          },
          {
            name: 'Incline Dumbbell Press',
            isKeyBenchmark: false,
            benchmarkMetric: 'Volume du haut des pectoraux',
            defaultWeight: 18,
            sets: 3,
            reps: 10,
            targetAdvice: 'Coudes à 45°, sens l’étirement en haut de la poitrine. Repos 90 s.',
            reason: 'Mesure le travail du haut de ta poitrine.',
          },
          {
            name: 'Overhead Press (Dumbbell)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail aux épaules',
            defaultWeight: 14,
            sets: 3,
            reps: 10,
            targetAdvice: 'Pousse droit vers le haut, sans cambrer le bas du dos. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour l’avant et le côté des épaules.',
          },
          {
            name: 'Tricep Extension (Cable)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail aux triceps',
            defaultWeight: 22,
            sets: 3,
            reps: 12,
            targetAdvice: 'Bras tendus en bas, serre 1 seconde. Repos 60 à 75 s.',
            reason: 'Fixe ta charge de travail pour les triceps.',
          },
        ],
      },
      {
        step: 2,
        dayName: 'Jour 2 (Mercredi)',
        name: 'Tirage',
        focus: 'Dos, Arrière d’épaules, Biceps',
        badge: '8 à 10 reps · Tirage',
        testingGoal: 'Trouver tes charges de travail pour la largeur et l’épaisseur du dos.',
        instructions: [
          'Tire avec le dos avant de tirer avec les bras.',
          'Serre 1 seconde en fin de mouvement.',
          'Repose-toi 90 secondes entre les séries.',
        ],
        exercises: [
          {
            name: 'Barbell Row',
            isKeyBenchmark: true,
            benchmarkMetric: 'Charge de travail pour l’épaisseur du dos',
            defaultWeight: 45,
            sets: 4,
            reps: 10,
            targetAdvice: 'Mouvement de référence. Tire vers le nombril, serre les omoplates. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour le haut et le milieu du dos.',
          },
          {
            name: 'Lat Pulldown (Cable)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail pour la largeur du dos',
            defaultWeight: 45,
            sets: 3,
            reps: 10,
            targetAdvice: 'Poitrine sortie, tire la barre sous le menton. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour les dorsaux.',
          },
          {
            name: 'Romanian Deadlift',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail aux ischios',
            defaultWeight: 50,
            sets: 3,
            reps: 10,
            targetAdvice: 'Plie aux hanches, dos droit, descends lentement. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour l’arrière du corps.',
          },
          {
            name: 'Bicep Curl (Dumbbell)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail aux biceps',
            defaultWeight: 12,
            sets: 3,
            reps: 10,
            targetAdvice: 'Tourne les paumes vers le haut, descends en 2 secondes sans balancer. Repos 60 s.',
            reason: 'Fixe ta charge de travail pour les bras.',
          },
        ],
      },
      {
        step: 3,
        dayName: 'Jour 3 (Vendredi)',
        name: 'Jambes et tronc',
        focus: 'Quadriceps, Fessiers, Mollets, Abdos',
        badge: '8 à 10 reps · Jambes',
        testingGoal: 'Trouver tes charges de travail pour l’avant et l’arrière des cuisses.',
        instructions: [
          'Freine bien chaque descente.',
          'Descends complètement au squat pour faire travailler fessiers et cuisses.',
          'Repose-toi 90 secondes entre les séries.',
        ],
        exercises: [
          {
            name: 'Squat (Barbell)',
            isKeyBenchmark: true,
            benchmarkMetric: 'Ta charge pour 10 reps au squat',
            defaultWeight: 60,
            sets: 4,
            reps: 10,
            targetAdvice: 'Mouvement de référence. Descends au moins aux cuisses horizontales, 1 ou 2 reps en réserve. Repos 90 s.',
            reason: 'Fixe ta charge de travail pour les cuisses.',
          },
          {
            name: 'Leg Press',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail à la presse',
            defaultWeight: 100,
            sets: 3,
            reps: 12,
            targetAdvice: 'Garde la tension sur les cuisses, sans pause. Repos 90 s.',
            reason: 'Ajoute du travail aux cuisses sans charger le dos.',
          },
          {
            name: 'Cable Crunch / Abs',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge de travail aux abdos',
            defaultWeight: 30,
            sets: 3,
            reps: 15,
            targetAdvice: 'Enroule le buste, souffle tout l’air en fin de mouvement. Repos 60 s.',
            reason: 'Fixe ta charge de travail pour les abdos.',
          },
        ],
      },
    ];
  }

  async generateTestWeekRecommendation(
    userId: string,
    goal: string,
    step: number,
    allExercises: any[],
    currentMeta: any,
    profile?: any,
  ) {
    const templates = this.getPersonalizedTestTemplates(goal, profile);
    const template = templates.find((t) => t.step === step) || templates[0];

    // Sensitive areas of the profile: the protocol keeps its movements, lighter where they load the area
    const areas = sensitiveAreas(painAreasOf(profile?.painAreas));
    const pain = new PainReportBuilder();
    const mappedExercises: any[] = [];
    for (const exPlan of template.exercises) {
      const dbEx = this.findMatchingExercise(exPlan.name, '', allExercises);
      if (dbEx) {
        const planned = protocolMovement(dbEx.name, exPlan.defaultWeight, areas, pain);
        const sets = [];
        for (let i = 0; i < exPlan.sets; i++) {
          sets.push({
            setNumber: i + 1,
            weight: planned.weight,
            reps: exPlan.reps,
            completed: false,
          });
        }
        mappedExercises.push({
          exerciseId: dbEx.id,
          name: dbEx.name,
          category: (dbEx as any).category || 'Général',
          targetAdvice: planned.careful ? CAUTION_ADVICE : exPlan.targetAdvice,
          reason: exPlan.reason,
          isKeyBenchmark: exPlan.isKeyBenchmark,
          benchmarkMetric: exPlan.benchmarkMetric,
          sets,
        });
      }
    }

    const result = {
      isTestWeek: true,
      testStep: step,
      totalTestSteps: 3,
      aiGenerated: false,
      aiModel: 'Protocole de calibration Overloady',
      title: `Semaine test ${step}/3 — ${template.name}`,
      goal,
      goalDetails: currentMeta,
      focusMuscle: template.focus,
      rationale: `Séance test ${step} sur 3. ${template.testingGoal} Note les charges que tu soulèves vraiment, avec une technique propre : Atlas s’en sert pour régler tes séances suivantes.`,
      coachingTips: template.instructions,
      exercises: mappedExercises,
      ...pain.build(),
    };

    this.recommendationCache.set(userId, { data: result, timestamp: Date.now() });
    return result;
  }

  /** Test-week templates with starting loads scaled to the athlete's weight, lean mass and experience. */
  getPersonalizedTestTemplates(goal: string, profile?: any) {
    const factor = calibrationLoadFactor(profile);
    return this.getTestWeekTemplates(goal).map((template) => ({
      ...template,
      exercises: template.exercises.map((ex) => ({
        ...ex,
        defaultWeight: scaleCalibrationLoad(ex.name, ex.defaultWeight, factor),
      })),
    }));
  }

  async getTestWeekStatus(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    const goal = ((profile as any)?.goal || 'BODYBUILDING').toUpperCase();
    const testWeekCompleted = Boolean((profile as any)?.testWeekCompleted);
    const testWeekProgress = Number((profile as any)?.testWeekProgress) || 0;
    const currentStep = Math.min(3, testWeekProgress + 1);

    const templates = this.getPersonalizedTestTemplates(goal, profile);
    const sessions = templates.map((t) => {
      let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
      if (t.step <= testWeekProgress) {
        status = 'completed';
      } else if (t.step === currentStep) {
        status = 'current';
      }

      return {
        ...t,
        status,
      };
    });

    const benchmarks = await this.getTestedBenchmarks(userId);

    return {
      testWeekCompleted,
      testWeekSkipped: Boolean((profile as any)?.testWeekSkipped),
      testWeekProgress,
      currentStep,
      totalSteps: 3,
      goal,
      sessions,
      benchmarks,
      canUnlockAi: testWeekCompleted,
    };
  }

  async getTestedBenchmarks(userId: string) {
    const sessions = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        endedAt: { not: null },
      },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const keyExercises = ['Bench Press (Barbell)', 'Squat (Barbell)', 'Deadlift (Barbell)', 'Overhead Press (Dumbbell)'];
    const benchmarks: Record<string, { maxWeight: number; bestReps: number; estimated1RM: number; sessionDate: string }> = {};

    for (const session of sessions) {
      for (const exLog of session.exercises) {
        const exName = exLog.exercise.name;
        if (keyExercises.some((k) => exName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(exName.toLowerCase()))) {
          for (const s of exLog.sets) {
            if (s.completed && s.weight > 0 && s.reps > 0 && isWorkSet(s)) {
              const e1RM = Math.round(s.weight * (1 + s.reps / 30) * 10) / 10;
              if (!benchmarks[exName] || e1RM > benchmarks[exName].estimated1RM) {
                benchmarks[exName] = {
                  maxWeight: s.weight,
                  bestReps: s.reps,
                  estimated1RM: e1RM,
                  sessionDate: session.startedAt.toISOString().split('T')[0],
                };
              }
            }
          }
        }
      }
    }

    return benchmarks;
  }

  async startTestWeekSession(userId: string, step: number) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const goal = ((profile as any)?.goal || 'BODYBUILDING').toUpperCase();
    const allExercises = await this.getExercisePool();
    const goalMeta = { label: goal };
    const rec = await this.generateTestWeekRecommendation(userId, goal, step, allExercises, goalMeta, profile);
    return this.startRecommendedWorkout(userId, rec);
  }

  async skipTestWeek(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { testWeekCompleted: true, testWeekProgress: 3, testWeekSkipped: true } as any,
    });
    this.recommendationCache.delete(userId);
    return { success: true, message: 'Semaine de test validée. Le Coach IA est activé !' };
  }

  async resetTestWeek(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { testWeekCompleted: false, testWeekProgress: 0, testWeekSkipped: false } as any,
    });
    this.recommendationCache.delete(userId);
    return { success: true, message: 'Semaine de test réinitialisée. Prêt pour une nouvelle calibration.' };
  }
}

/** Movements already measured, to guess the starting load of a related one. */
function knownLifts(performances: Map<string, Performance & { name: string }>): KnownLift[] {
  return [...performances.values()].map(({ name, weight, reps }) => ({ name, weight, reps }));
}

/** The next target in one sentence, e.g. "Objectif : 52,5 kg × 11 reps". */
function describeTarget(target: { weight: number; reps: number }, bodyweight: boolean): string {
  const load =
    target.weight > 0
      ? `${bodyweight ? '+ ' : ''}${String(target.weight).replace('.', ',')} kg${bodyweight ? ' de lest' : ''} × `
      : bodyweight
      ? 'poids du corps × '
      : '';
  return `Objectif : ${load}${target.reps} reps`;
}

/**
 * Sessions used to store their title and calibration marker in the notes
 * ("Séance Recommandée : [SEMAINE_TEST_1] ..."): only the athlete's own text is kept.
 */
function stripLegacyMarkers(notes?: string): string {
  if (!notes) return '';
  const text = notes.trim();
  if (/^\[SEMAINE_TEST_[1-3]\]$/.test(text) || /^(Séance Recommandée : |Programme: )/.test(text)) return '';
  return text;
}
