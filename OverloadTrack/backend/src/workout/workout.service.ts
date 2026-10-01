import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, CoachChatMessage } from '../ai/ai.service';
import { calibrationLoadFactor, describeAthlete, scaleCalibrationLoad } from '../user/athlete-profile';

const COACH_MAX_MESSAGES = 12;
const COACH_MAX_MESSAGE_LENGTH = 2000;

interface FinishSetDto {
  reps: number;
  weight: number;
  completed: boolean;
}

interface FinishExerciseDto {
  exerciseId: string;
  sets: FinishSetDto[];
}

export interface FinishWorkoutDto {
  sessionId: string;
  rpe: number;
  notes?: string;
  exercises?: FinishExerciseDto[];
}

@Injectable()
export class WorkoutService {
  private readonly logger = new Logger(WorkoutService.name);
  private recommendationCache = new Map<string, { data: any; timestamp: number }>();

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

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
        rpe: 0,
      },
    });

    // If starting from a routine, pre-fill exercises with progressive overload from past sessions
    if (routine && routine.exercises.length > 0) {
      for (const ex of routine.exercises) {
        const newExerciseLog = await this.prisma.exerciseLog.create({
          data: {
            sessionId: newSession.id,
            exerciseId: ex.id,
          },
        });

        // Find last completed log for this exercise by this user
        const lastLog = await this.prisma.exerciseLog.findFirst({
          where: {
            exerciseId: ex.id,
            session: {
              userId,
              endedAt: { not: null },
            },
          },
          orderBy: {
            session: { startedAt: 'desc' },
          },
          include: { sets: true },
        });

        if (lastLog && lastLog.sets.length > 0) {
          for (const lastSet of lastLog.sets) {
            let nextWeight = lastSet.weight;
            if (lastSet.completed) {
              nextWeight += 2.5; // Surcharge progressive
            }
            await this.prisma.setLog.create({
              data: {
                exerciseLogId: newExerciseLog.id,
                reps: lastSet.reps,
                weight: nextWeight,
                completed: false,
              },
            });
          }
        } else {
          // Default template 3 sets
          for (let i = 0; i < 3; i++) {
            await this.prisma.setLog.create({
              data: {
                exerciseLogId: newExerciseLog.id,
                reps: 10,
                weight: 20,
                completed: false,
              },
            });
          }
        }
      }
    }

    return this.prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
    });
  }

  async finishWorkout(userId: string, data: FinishWorkoutDto) {
    const session = await this.prisma.workoutSession.findUnique({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session introuvable');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Non autorisé');
    }

    // Save actual logged exercises and sets if sent from client
    if (data.exercises && data.exercises.length > 0) {
      // Remove any temporary exercise logs
      await this.prisma.exerciseLog.deleteMany({
        where: { sessionId: data.sessionId },
      });

      const anyCompletedExplicitly = data.exercises.some((ex) =>
        ex.sets?.some((s) => s.completed === true),
      );

      for (const exDto of data.exercises) {
        if (!exDto.exerciseId) continue;
        const exLog = await this.prisma.exerciseLog.create({
          data: {
            sessionId: data.sessionId,
            exerciseId: exDto.exerciseId,
          },
        });

        if (exDto.sets && exDto.sets.length > 0) {
          for (const set of exDto.sets) {
            const isCompleted = anyCompletedExplicitly
              ? Boolean(set.completed)
              : Number(set.weight) > 0 && Number(set.reps) > 0;

            await this.prisma.setLog.create({
              data: {
                exerciseLogId: exLog.id,
                reps: Number(set.reps) || 0,
                weight: Number(set.weight) || 0,
                completed: isCompleted,
              },
            });
          }
        }
      }
    }

    this.recommendationCache.delete(userId);

    const sessionBefore = await this.prisma.workoutSession.findUnique({
      where: { id: data.sessionId },
    });
    const checkNotes = data.notes || (sessionBefore as any)?.notes || '';
    if (checkNotes.includes('[SEMAINE_TEST_1]')) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 1 } as any,
      }).catch(() => null);
    } else if (checkNotes.includes('[SEMAINE_TEST_2]')) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 2 } as any,
      }).catch(() => null);
    } else if (checkNotes.includes('[SEMAINE_TEST_3]')) {
      await this.prisma.profile.update({
        where: { userId },
        data: { testWeekProgress: 3, testWeekCompleted: true } as any,
      }).catch(() => null);
    }

    return this.prisma.workoutSession.update({
      where: { id: data.sessionId },
      data: {
        endedAt: new Date(),
        rpe: data.rpe ?? 7,
        ...(data.notes ? { notes: data.notes } : {}),
      } as any,
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
    });
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
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
    });
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
        session: { select: { startedAt: true } },
        sets: true,
      },
    });

    let maxWeight = 0;
    let maxEstimated1RM = 0;
    let lastSet: { weight: number; reps: number; completed: boolean } | null = null;
    const historyPoints: Array<{ date: string; maxWeight: number; totalVolume: number; estimated1RM: number }> = [];

    for (const log of logs) {
      let sessionMaxWeight = 0;
      let sessionMax1RM = 0;
      let sessionVolume = 0;

      for (const set of log.sets) {
        if (set.completed && set.weight > 0 && set.reps > 0) {
          const estimated1RM = Math.round(set.weight * (1 + set.reps / 30) * 10) / 10;
          if (set.weight > maxWeight) maxWeight = set.weight;
          if (estimated1RM > maxEstimated1RM) maxEstimated1RM = estimated1RM;
          if (set.weight > sessionMaxWeight) sessionMaxWeight = set.weight;
          if (estimated1RM > sessionMax1RM) sessionMax1RM = estimated1RM;
          sessionVolume += set.weight * set.reps;
          lastSet = { weight: set.weight, reps: set.reps, completed: set.completed };
        }
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

    // Calcul de la recommandation de surcharge progressive
    let recommendedOverload = {
      weight: 20,
      reps: 10,
      reason: 'Premier entraînement recommandé : 20kg × 10 reps',
    };

    if (lastSet) {
      if (lastSet.completed) {
        recommendedOverload = {
          weight: lastSet.weight + 2.5,
          reps: lastSet.reps,
          reason: `Objectif Surcharge : +2.5kg (${lastSet.weight + 2.5}kg × ${lastSet.reps} reps)`,
        };
      } else {
        recommendedOverload = {
          weight: lastSet.weight,
          reps: lastSet.reps,
          reason: `Valider la charge : ${lastSet.weight}kg × ${lastSet.reps} reps`,
        };
      }
    }

    return {
      exercise,
      maxWeight,
      maxEstimated1RM,
      lastSet,
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
          include: { sets: true },
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
          if (set.completed) {
            sessionVolume += (set.weight || 0) * (set.reps || 0);
          }
        }
      }
      totalVolumeAllTime += sessionVolume;
      if (new Date(session.startedAt) >= oneWeekAgo) {
        weekVolume += sessionVolume;
      }
    }

    return {
      totalWorkouts: allSessions.length,
      workoutsThisWeek: weekSessions.length,
      weekVolume: Math.round(weekVolume),
      totalVolumeAllTime: Math.round(totalVolumeAllTime),
      recentSessionsCount: allSessions.length,
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
      { setNumber: 1, weight: step1, reps: 10, label: 'Barre à vide (échauffement articulaire)' },
    ];

    if (step2 > step1 && step2 < targetWeight) {
      sets.push({ setNumber: 2, weight: step2, reps: 5, label: '50% - Montée en gamme' });
    }
    if (step3 > step2 && step3 < targetWeight) {
      sets.push({ setNumber: 3, weight: step3, reps: 3, label: '70% - Préparation nerveuse' });
    }
    if (step4 > step3 && step4 < targetWeight) {
      sets.push({ setNumber: 4, weight: step4, reps: 1, label: '85% - Potentiation motrice' });
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

        for (const set of exLog.sets) {
          if (set.completed && set.weight > 0 && set.reps > 0) {
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
      }
    }

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

  async getNextRecommendedWorkout(userId: string, forceFreshAi = false) {
    const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

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

    const allExercises = await this.getExercisePool();

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
    };

    const currentMeta = goalMetadata[goal] || goalMetadata.BODYBUILDING;

    // Phase d'évaluation : Semaine Test de calibration pour l'athlète
    const isTestWeekActive =
      !Boolean((profile as any)?.testWeekCompleted) &&
      Number((profile as any)?.testWeekProgress || 0) < 3;

    if (isTestWeekActive) {
      const nextStep = Math.min(3, Number((profile as any)?.testWeekProgress || 0) + 1);
      return this.generateTestWeekRecommendation(userId, goal, nextStep, allExercises, currentMeta, profile);
    }

    // Try AI Generation with Pollinations Bodybuilding Coach
    let aiWorkout = null;
    try {
      let lastSessionContext = null;
      if (lastSession) {
        lastSessionContext = {
          title: (lastSession as any)?.notes || 'Dernière séance',
          startedAt: lastSession.startedAt.toISOString().split('T')[0],
          exercises: lastSession.exercises.map((el) => {
            const maxW = el.sets.reduce((max, s) => (s.completed && s.weight > max ? s.weight : max), 0);
            const rep = el.sets.find((s) => s.weight === maxW)?.reps || 10;
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
        benchmarks: testedBenchmarks,
        lastSession: lastSessionContext,
        // The wger import adds ~900 exercises: only the app library is offered to the AI.
        availableExercises: allExercises.filter((e) => e.source !== 'wger').map((e) => ({
          id: e.id,
          name: e.name,
          category: (e as any).category || 'Général',
        })),
      });
    } catch (aiErr: any) {
      this.logger.warn(`AI Generation invocation error: ${aiErr.message}`);
    }

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

        if (matchedDbEx) {
          usedIds.add(matchedDbEx.id);
          const sets = (aiEx.sets || []).map((s, idx) => ({
            setNumber: s.setNumber || idx + 1,
            weight: Number(s.weight) || 20,
            reps: Number(s.reps) || 10,
            completed: false,
          }));

          mappedExercises.push({
            exerciseId: matchedDbEx.id,
            name: matchedDbEx.name,
            category: (matchedDbEx as any).category || aiEx.category || 'Général',
            targetAdvice: aiEx.targetAdvice || currentMeta.repTarget,
            reason: aiEx.reason || 'Recommandé pour votre progression',
            sets: sets.length > 0 ? sets : [
              { setNumber: 1, weight: 20, reps: 10, completed: false },
              { setNumber: 2, weight: 20, reps: 10, completed: false },
              { setNumber: 3, weight: 20, reps: 10, completed: false },
            ],
          });
        }
      }

      if (mappedExercises.length > 0) {
        const result = {
          aiGenerated: true,
          aiModel: 'Coach IA Musculation (Pollinations CSCS)',
          title: aiWorkout.title || `Séance ${currentMeta.label} — ${aiWorkout.focusMuscle || 'Full Body'}`,
          goal,
          goalDetails: currentMeta,
          focusMuscle: aiWorkout.focusMuscle || 'Haut / Bas du corps',
          rationale: aiWorkout.rationale,
          coachingTips: aiWorkout.coachingTips || [
            'Échauffez bien les articulations et la coiffe des rotateurs.',
            'Contrôlez la descente sur 2 à 3 secondes.',
            'Respectez les temps de repos prescrits pour optimiser les performances.',
          ],
          exercises: mappedExercises,
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

    const candidateExercises = allExercises.filter((ex) => targetCategories.includes((ex as any).category));
    const selectedExercises = candidateExercises.slice(0, 4);
    const finalExercises = selectedExercises.length > 0 ? selectedExercises : allExercises.slice(0, 3);

    const fallbackExercises = [];

    for (const ex of finalExercises) {
      const lastLog = await this.prisma.exerciseLog.findFirst({
        where: {
          exerciseId: ex.id,
          session: { userId, endedAt: { not: null } },
        },
        orderBy: { session: { startedAt: 'desc' } },
        include: { sets: true },
      });

      let baseWeight = 20;
      if (lastLog && lastLog.sets.length > 0) {
        const completedSets = lastLog.sets.filter((s) => s.completed && s.weight > 0);
        if (completedSets.length > 0) {
          baseWeight = Math.max(...completedSets.map((s) => s.weight));
        }
      }

      let setsCount = 4;
      let targetReps = 8;
      let targetWeight = baseWeight;
      let targetAdvice = '';

      if (goal === 'FORCE') {
        setsCount = 4;
        targetReps = 5;
        targetWeight = baseWeight > 20 ? baseWeight + 2.5 : 40;
        targetAdvice = 'Charge lourde • Repos 3-4 min • Intensité 85% 1RM';
      } else if (goal === 'ENDURANCE') {
        setsCount = 3;
        targetReps = 15;
        targetWeight = Math.max(10, Math.round((baseWeight * 0.7) / 2.5) * 2.5);
        targetAdvice = 'Cadence continue • Repos 45s • Densité musculaire';
      } else {
        setsCount = 4;
        targetReps = 10;
        targetWeight = baseWeight > 20 ? baseWeight : 30;
        targetAdvice = 'Tension continue • Repos 75-90s • Focus congestion';
      }

      const sets = [];
      for (let i = 0; i < setsCount; i++) {
        sets.push({
          setNumber: i + 1,
          weight: targetWeight,
          reps: targetReps,
          completed: false,
        });
      }

      fallbackExercises.push({
        exerciseId: ex.id,
        name: ex.name,
        category: (ex as any).category || 'Général',
        targetAdvice,
        reason: 'Surcharge progressive calculée sur votre historique',
        sets,
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
        ? `Généré intelligemment après votre dernière séance. Alternance musculaire respectée pour une récupération optimale et progression ciblée en ${currentMeta.label.toLowerCase()}.`
        : `Première séance d'initiation optimisée pour votre objectif de ${currentMeta.label.toLowerCase()}.`,
      coachingTips: [
        'Échauffez-vous pendant 5 à 10 minutes avant les premières séries lourdes.',
        'Maîtrisez le tempo excentrique pour protéger vos articulations.',
        'Prenez des temps de repos suffisants pour maximiser la production de force.',
      ],
      exercises: fallbackExercises,
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

    const [profile, benchmarks, recent, pool] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.getTestedBenchmarks(userId),
      this.prisma.workoutSession.findMany({
        where: { userId, endedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: 3,
        include: { exercises: { include: { exercise: true } } },
      }),
      this.getExercisePool(),
    ]);

    const reply = await this.aiService.coachChat({
      goal: (profile as any)?.goal || 'BODYBUILDING',
      weight: (profile as any)?.weight,
      height: (profile as any)?.height,
      athlete: describeAthlete(profile as any),
      benchmarks,
      recentSessions: recent.map((s) => ({
        date: s.startedAt.toISOString().split('T')[0],
        title: (s.notes || 'Séance').slice(0, 80),
        exercises: s.exercises.map((e) => e.exercise.name),
      })),
      availableExercises: pool.filter((e) => e.source !== 'wger').map((e) => e.name),
      messages,
    });

    if (!reply) {
      throw new ServiceUnavailableException('Atlas ne répond pas pour le moment. Réessaie dans quelques secondes.');
    }

    return {
      message: reply.message,
      workouts: reply.workouts.map((w) => ({
        title: w.title,
        focus: w.focus,
        durationMin: w.durationMin,
        notes: w.notes,
        exercises: w.exercises.map((ex) => {
          const dbEx = this.findMatchingExercise(ex.name, '', pool);
          return {
            exerciseId: dbEx.id,
            name: dbEx.name,
            category: dbEx.category,
            rest: ex.rest,
            targetAdvice: [`${ex.sets}×${ex.reps}`, ex.rest && `repos ${ex.rest}`, ex.tip].filter(Boolean).join(' · '),
            sets: Array.from({ length: ex.sets }, (_, i) => ({ setNumber: i + 1, weight: ex.weight, reps: ex.reps })),
          };
        }),
      })),
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
        notes: `Séance Recommandée : ${recommendation.title}`,
      } as any,
    });

    for (const exRec of recommendation.exercises) {
      const exLog = await this.prisma.exerciseLog.create({
        data: {
          sessionId: newSession.id,
          exerciseId: exRec.exerciseId,
        },
      });

      for (const setRec of exRec.sets) {
        await this.prisma.setLog.create({
          data: {
            exerciseLogId: exLog.id,
            reps: setRec.reps,
            weight: setRec.weight,
            completed: false,
          },
        });
      }
    }

    return this.prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
    });
  }

  getTestWeekTemplates(goal = 'BODYBUILDING') {
    const upperGoal = (goal || 'BODYBUILDING').toUpperCase();

    if (upperGoal === 'FORCE') {
      return [
        {
          step: 1,
          dayName: 'Jour 1 (Lundi)',
          name: 'Test Poussée & 1RM Haut du Corps',
          focus: 'Pectoraux, Épaules, Triceps',
          badge: 'Benchmark 3-5RM • Force Poussée',
          testingGoal: 'Tester votre charge maximale (3-5RM) sur le Développé Couché et la force des épaules.',
          instructions: [
            'Échauffez-vous méthodiquement avec la montée en gamme proposée.',
            'Montez progressivement en charge pour trouver une série de 3 à 5 reps lourdes (RPE 8-9).',
            'Prenez 3 minutes complètes de repos entre chaque série de test.',
            'Stoppez la série dès que la technique commence à se dégrader.',
          ],
          exercises: [
            {
              name: 'Bench Press (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM Estimé Développé Couché',
              defaultWeight: 60,
              sets: 4,
              reps: 5,
              targetAdvice: '🎯 Benchmark Principal : Visez une série de 3 à 5 reps propres à RPE 8.5. Repos 3 min.',
              reason: 'Mesure de référence de la force de poussée horizontale.',
            },
            {
              name: 'Overhead Press (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Poussée Verticale',
              defaultWeight: 16,
              sets: 3,
              reps: 5,
              targetAdvice: 'Séries lourdes et stables. Verrouillez les abdominaux. Repos 2-3 min.',
              reason: 'Évaluation de la force deltoïdes et stabilité claviculaire.',
            },
            {
              name: 'Incline Dumbbell Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Pectoraux Supérieurs',
              defaultWeight: 22,
              sets: 3,
              reps: 5,
              targetAdvice: 'Descente contrôlée 2s, poussée explosive. Repos 2-3 min.',
              reason: 'Mesure de la tolérance sous charge en plan incliné.',
            },
            {
              name: 'Tricep Extension (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Extension Bras',
              defaultWeight: 25,
              sets: 3,
              reps: 6,
              targetAdvice: 'Coudes fixes au corps, extension totale. Repos 90s.',
              reason: 'Évaluation du verrouillage triceps.',
            },
          ],
        },
        {
          step: 2,
          dayName: 'Jour 2 (Mercredi)',
          name: 'Test Tirage & Chaîne Postérieure',
          focus: 'Dos, Ischios, Biceps',
          badge: 'Benchmark 3-5RM • Force Tirage & Dos',
          testingGoal: 'Mesurer votre 1RM Soulevé de Terre et votre capacité de tirage lourd.',
          instructions: [
            'Maintenez impérativement le dos plat et gainé sur le soulevé de terre.',
            'Ciblez une série de 3 à 5 reps avec une charge solide et maîtrisée.',
            'Prenez 3 minutes de repos entre les séries de deadlift.',
          ],
          exercises: [
            {
              name: 'Deadlift (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM Estimé Soulevé de Terre',
              defaultWeight: 80,
              sets: 4,
              reps: 5,
              targetAdvice: '🎯 Benchmark Principal : Tirage puissant, verrouillage des fessiers. Repos 3 min.',
              reason: 'Mesure de la force brute de la chaîne postérieure.',
            },
            {
              name: 'Barbell Row',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Tirage Horizontal',
              defaultWeight: 50,
              sets: 3,
              reps: 5,
              targetAdvice: 'Buste penché à 45°, tirez avec les coudes vers les hanches. Repos 2 min.',
              reason: 'Évaluation de la puissance des dorsaux et trapèzes.',
            },
            {
              name: 'Lat Pulldown (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Tirage Vertical',
              defaultWeight: 55,
              sets: 3,
              reps: 5,
              targetAdvice: 'Poitrine sortie, tirage franc vers le haut des pectoraux. Repos 2 min.',
              reason: 'Évaluation de la force du grand dorsal.',
            },
            {
              name: 'Bicep Curl (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Flexion Biceps',
              defaultWeight: 14,
              sets: 3,
              reps: 6,
              targetAdvice: 'Contrôlez la phase négative. Repos 90s.',
              reason: 'Mesure de la force des fléchisseurs du coude.',
            },
          ],
        },
        {
          step: 3,
          dayName: 'Jour 3 (Vendredi)',
          name: 'Test Bas du Corps & Tronc',
          focus: 'Quadriceps, Fessiers, Ischios, Tronc',
          badge: 'Benchmark 3-5RM • Force Squat & Jambes',
          testingGoal: 'Mesurer votre 1RM Squat et la solidité de votre gainage sous charge.',
          instructions: [
            'Descendez au moins au parallèle (cuisses horizontales).',
            'Respirez en blocage abdominal (manœuvre de Valsalva) pendant la descente.',
            'Prenez 3 minutes de récupération entre les séries lourdes.',
          ],
          exercises: [
            {
              name: 'Squat (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: '1RM Estimé Squat',
              defaultWeight: 70,
              sets: 4,
              reps: 5,
              targetAdvice: '🎯 Benchmark Principal : Amplitude complète, poussée par les talons. Repos 3 min.',
              reason: 'Mesure étalon de la puissance motrice des membres inférieurs.',
            },
            {
              name: 'Leg Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Capacité Poussée Machine',
              defaultWeight: 120,
              sets: 3,
              reps: 5,
              targetAdvice: 'Pieds écartement épaules, descente profonde sans décoller le bassin. Repos 2 min.',
              reason: 'Mesure de la force maximale sans contrainte rachidienne.',
            },
            {
              name: 'Romanian Deadlift',
              isKeyBenchmark: false,
              benchmarkMetric: 'Force Ischios & Charnière',
              defaultWeight: 60,
              sets: 3,
              reps: 5,
              targetAdvice: 'Poussez les hanches en arrière, étirement maximal des ischios. Repos 2 min.',
              reason: 'Évaluation de la force excentrique des ischio-jambiers.',
            },
            {
              name: 'Cable Crunch / Abs',
              isKeyBenchmark: false,
              benchmarkMetric: 'Résistance Abdominale',
              defaultWeight: 30,
              sets: 3,
              reps: 8,
              targetAdvice: 'Enroulement vertébral contrôlé, contraction intense. Repos 60s.',
              reason: 'Mesure de la force du caisson abdominal.',
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
          name: 'Test Capacité & Seuil Poussée',
          focus: 'Pectoraux, Épaules, Triceps',
          badge: 'Benchmark 15-20 reps • Seuil Lactique',
          testingGoal: 'Évaluer votre endurance musculaire sur les mouvements de poussée avec repos courts.',
          instructions: [
            'Séries de 15 à 20 répétitions à cadence régulière.',
            'Repos court de 45 secondes chrono.',
            'L objectif est de repousser la brûlure musculaire sans bloquer la respiration.',
          ],
          exercises: [
            {
              name: 'Bench Press (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance Développé Couché',
              defaultWeight: 40,
              sets: 3,
              reps: 18,
              targetAdvice: '🎯 Benchmark : 15 à 20 reps fluides, charge modérée, tempo 2-0-1. Repos 45s.',
              reason: 'Évaluation de l endurance sous tension des pectoraux.',
            },
            {
              name: 'Incline Dumbbell Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Haut Pectoraux',
              defaultWeight: 14,
              sets: 3,
              reps: 15,
              targetAdvice: 'Mouvement fluide continu sans pause en bas. Repos 45s.',
              reason: 'Résistance à la fatigue claviculaire.',
            },
            {
              name: 'Lateral Raise (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Deltoïdes',
              defaultWeight: 8,
              sets: 3,
              reps: 20,
              targetAdvice: 'Montée contrôlée, brûlure intense recherchée. Repos 30s.',
              reason: 'Capacité métabolique des épaules.',
            },
            {
              name: 'Tricep Extension (Cable)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Triceps',
              defaultWeight: 18,
              sets: 3,
              reps: 20,
              targetAdvice: 'Extension complète et continue. Repos 30s.',
              reason: 'Seuil lactique des extenseurs du bras.',
            },
          ],
        },
        {
          step: 2,
          dayName: 'Jour 2 (Mercredi)',
          name: 'Test Capacité & Seuil Tirage',
          focus: 'Dos, Biceps, Arrière d épaules',
          badge: 'Benchmark 15-20 reps • Capacité Dorsale',
          testingGoal: 'Mesurer la résistance à la fatigue des muscles du dos et de la préhension.',
          instructions: [
            'Tirages amples avec amplitude complète.',
            'Gérez le rythme cardiaque et respectez les 45 secondes de repos.',
          ],
          exercises: [
            {
              name: 'Lat Pulldown (Cable)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance Grand Dorsal',
              defaultWeight: 40,
              sets: 3,
              reps: 18,
              targetAdvice: '🎯 Benchmark : 15 à 20 reps continues sans à-coups. Repos 45s.',
              reason: 'Capacité aérobie-anaérobie du dos.',
            },
            {
              name: 'Barbell Row',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Tirage Horizontal',
              defaultWeight: 35,
              sets: 3,
              reps: 15,
              targetAdvice: 'Dos bien fixe, rythme constant. Repos 45s.',
              reason: 'Résistance posturale sous fatigue.',
            },
            {
              name: 'Romanian Deadlift',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Ischios & Lombaires',
              defaultWeight: 40,
              sets: 3,
              reps: 15,
              targetAdvice: 'Charge légère, tempo continu, étirement actif. Repos 45s.',
              reason: 'Capacité de travail de la chaîne postérieure.',
            },
            {
              name: 'Bicep Curl (Dumbbell)',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Fléchisseurs',
              defaultWeight: 10,
              sets: 3,
              reps: 18,
              targetAdvice: 'Contraction sans élan. Repos 30s.',
              reason: 'Endurance des biceps.',
            },
          ],
        },
        {
          step: 3,
          dayName: 'Jour 3 (Vendredi)',
          name: 'Test Capacité Bas du Corps & Cardio-Musculaire',
          focus: 'Quadriceps, Fessiers, Abdos',
          badge: 'Benchmark 15-20 reps • Résistance Cuisses',
          testingGoal: 'Tester le volume de travail et la résistance lactique des membres inférieurs.',
          instructions: [
            'Séries longues et intenses sur les jambes.',
            'Hydratez-vous bien et gardez une cadence régulière.',
          ],
          exercises: [
            {
              name: 'Squat (Barbell)',
              isKeyBenchmark: true,
              benchmarkMetric: 'Endurance Squat',
              defaultWeight: 45,
              sets: 3,
              reps: 18,
              targetAdvice: '🎯 Benchmark : 15 à 20 flexions profondes et dynamiques. Repos 45-60s.',
              reason: 'Endurance musculaire et capacité cardiaque sur squat.',
            },
            {
              name: 'Leg Press',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Poussée Presse',
              defaultWeight: 80,
              sets: 3,
              reps: 20,
              targetAdvice: 'Poussée fluide continue, pas de blocage des genoux en haut. Repos 45s.',
              reason: 'Tolérance au lactate quadriceps/fessiers.',
            },
            {
              name: 'Cable Crunch / Abs',
              isKeyBenchmark: false,
              benchmarkMetric: 'Endurance Tronc & Abdos',
              defaultWeight: 25,
              sets: 3,
              reps: 20,
              targetAdvice: 'Enroulement constant, brûlure abdominale. Repos 30s.',
              reason: 'Capacité d endurance du gainage.',
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
        name: 'Test Hypertrophie Poussée (Push Calibration)',
        focus: 'Pectoraux, Épaules, Triceps',
        badge: 'Benchmark 8-10 reps • Hypertrophie Push',
        testingGoal: 'Trouver votre charge de travail optimale (8-10RM, RPE 8) pour stimuler la croissance musculaire.',
        instructions: [
          'Adoptez un tempo maîtrisé : 2 à 3 secondes de descente contrôlée.',
          'La 10ème répétition doit être stimulante tout en laissant 1-2 reps en réserve (RPE 8).',
          'Prenez 90 secondes de repos entre les séries.',
          'Notez vos charges effectives pour calibrer les futurs volumes de travail.',
        ],
        exercises: [
          {
            name: 'Bench Press (Barbell)',
            isKeyBenchmark: true,
            benchmarkMetric: '10RM Référence Développé Couché',
            defaultWeight: 50,
            sets: 4,
            reps: 10,
            targetAdvice: '🎯 Benchmark Principal : 8 à 10 reps avec tempo 2-0-1. RPE 8. Repos 90s.',
            reason: 'Calibrage de la charge de travail optimale pour la masse pectorale.',
          },
          {
            name: 'Incline Dumbbell Press',
            isKeyBenchmark: false,
            benchmarkMetric: 'Volume Pectoraux Claviculaires',
            defaultWeight: 18,
            sets: 3,
            reps: 10,
            targetAdvice: 'Descendez les coudes à 45°, étirement ressenti sur le haut de la poitrine. Repos 90s.',
            reason: 'Évaluation du recrutement faisceau haut.',
          },
          {
            name: 'Overhead Press (Dumbbell)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge Travail Épaules',
            defaultWeight: 14,
            sets: 3,
            reps: 10,
            targetAdvice: 'Poussée verticale nette sans cambrure lombaire. Repos 90s.',
            reason: 'Calibration du volume deltoïdes antérieurs et latéraux.',
          },
          {
            name: 'Tricep Extension (Cable)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Isolation & Congestion Triceps',
            defaultWeight: 22,
            sets: 3,
            reps: 12,
            targetAdvice: 'Verrouillage en bas, 1s de contraction volontaire. Repos 60-75s.',
            reason: 'Mesure de la réponse hypertrophique des triceps.',
          },
        ],
      },
      {
        step: 2,
        dayName: 'Jour 2 (Mercredi)',
        name: 'Test Hypertrophie Tirage (Pull Calibration)',
        focus: 'Dos, Arrière d épaules, Biceps',
        badge: 'Benchmark 8-10 reps • Hypertrophie Pull',
        testingGoal: 'Déterminer votre capacité de travail pour la largeur et l épaisseur du dos.',
        instructions: [
          'Ressentez l activation des dorsaux avant de tirer avec les bras.',
          'Maintenez une contraction d une seconde en position finale.',
          'Repos prescrit : 90 secondes.',
        ],
        exercises: [
          {
            name: 'Barbell Row',
            isKeyBenchmark: true,
            benchmarkMetric: 'Charge Référence Épaisseur Dos',
            defaultWeight: 45,
            sets: 4,
            reps: 10,
            targetAdvice: '🎯 Benchmark Principal : Tirage vers le nombril, contraction omoplates. Repos 90s.',
            reason: 'Mesure de travail clé pour la masse du haut et milieu du dos.',
          },
          {
            name: 'Lat Pulldown (Cable)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge Référence Largeur Dos',
            defaultWeight: 45,
            sets: 3,
            reps: 10,
            targetAdvice: 'Poitrine fière, tirez la barre sous le menton. Repos 90s.',
            reason: 'Calibration de l étirement du grand dorsal.',
          },
          {
            name: 'Romanian Deadlift',
            isKeyBenchmark: false,
            benchmarkMetric: 'Tension Mécanique Ischios',
            defaultWeight: 50,
            sets: 3,
            reps: 10,
            targetAdvice: 'Charnière de hanche parfaite, contrôle lent de la descente. Repos 90s.',
            reason: 'Évaluation de la capacité sous tension de la chaîne postérieure.',
          },
          {
            name: 'Bicep Curl (Dumbbell)',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge Travail Biceps',
            defaultWeight: 12,
            sets: 3,
            reps: 10,
            targetAdvice: 'Supination en haut, descente 2s sans balancer le buste. Repos 60s.',
            reason: 'Calibration de l isolation des bras.',
          },
        ],
      },
      {
        step: 3,
        dayName: 'Jour 3 (Vendredi)',
        name: 'Test Hypertrophie Jambes & Tronc (Legs Calibration)',
        focus: 'Quadriceps, Fessiers, Mollets, Abdos',
        badge: 'Benchmark 8-10 reps • Hypertrophie Jambes',
        testingGoal: 'Établir vos charges de référence pour développer le volume des quadriceps et ischios.',
        instructions: [
          'Contrôlez parfaitement la phase excentrique pour maximiser les micro-lésions musculaires.',
          'Assurez une amplitude complète au squat pour stimuler les fessiers et quadriceps.',
          'Repos prescrit : 90 secondes.',
        ],
        exercises: [
          {
            name: 'Squat (Barbell)',
            isKeyBenchmark: true,
            benchmarkMetric: '10RM Référence Squat',
            defaultWeight: 60,
            sets: 4,
            reps: 10,
            targetAdvice: '🎯 Benchmark Principal : Cuisses au moins au niveau horizontal. RPE 8. Repos 90s.',
            reason: 'Fondation du volume musculaire des cuisses.',
          },
          {
            name: 'Leg Press',
            isKeyBenchmark: false,
            benchmarkMetric: 'Charge Travail Poussée Cuisses',
            defaultWeight: 100,
            sets: 3,
            reps: 12,
            targetAdvice: 'Tension continue sur les quadriceps. Repos 90s.',
            reason: 'Volume d hypertrophie complémentaire sans fatigue rachidienne.',
          },
          {
            name: 'Cable Crunch / Abs',
            isKeyBenchmark: false,
            benchmarkMetric: 'Résistance Hypertrophie Abdos',
            defaultWeight: 30,
            sets: 3,
            reps: 15,
            targetAdvice: 'Enroulez le buste, expirez tout l air en fin de contraction. Repos 60s.',
            reason: 'Mesure de la force et épaisseur de la sangle abdominale.',
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

    const mappedExercises: any[] = [];
    for (const exPlan of template.exercises) {
      const dbEx = this.findMatchingExercise(exPlan.name, '', allExercises);
      if (dbEx) {
        const sets = [];
        for (let i = 0; i < exPlan.sets; i++) {
          sets.push({
            setNumber: i + 1,
            weight: exPlan.defaultWeight,
            reps: exPlan.reps,
            completed: false,
          });
        }
        mappedExercises.push({
          exerciseId: dbEx.id,
          name: dbEx.name,
          category: (dbEx as any).category || 'Général',
          targetAdvice: exPlan.targetAdvice,
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
      aiModel: 'Protocole de Calibration Overloady',
      title: `[SEMAINE_TEST_${step}] Semaine Test (Séance ${step}/3) — ${template.name}`,
      goal,
      goalDetails: currentMeta,
      focusMuscle: template.focus,
      rationale: `🧪 Phase de Test & Calibration (Séance ${step}/3) : ${template.testingGoal} Effectuez cette séance d'évaluation en notant vos charges réelles avec technique propre pour calibrer votre profil neuromusculaire avant le lancement complet du Coach IA.`,
      coachingTips: template.instructions,
      exercises: mappedExercises,
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
            if (s.completed && s.weight > 0 && s.reps > 0) {
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
      data: { testWeekCompleted: true, testWeekProgress: 3 } as any,
    });
    this.recommendationCache.delete(userId);
    return { success: true, message: 'Semaine de test validée. Le Coach IA est activé !' };
  }

  async resetTestWeek(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { testWeekCompleted: false, testWeekProgress: 0 } as any,
    });
    this.recommendationCache.delete(userId);
    return { success: true, message: 'Semaine de test réinitialisée. Prêt pour une nouvelle calibration.' };
  }
}
