import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

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
    if (!forceFreshAi && this.recommendationCache.has(userId)) {
      const cached = this.recommendationCache.get(userId)!;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
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

    const allExercises = await this.prisma.exercise.findMany();

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

      aiWorkout = await this.aiService.generateWorkoutSession({
        goal,
        weight: (profile as any)?.weight || 75,
        height: (profile as any)?.height || 178,
        lastSession: lastSessionContext,
        availableExercises: allExercises.map((e) => ({
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
}
