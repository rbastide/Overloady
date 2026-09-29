import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {}

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
            await this.prisma.setLog.create({
              data: {
                exerciseLogId: exLog.id,
                reps: Number(set.reps) || 0,
                weight: Number(set.weight) || 0,
                completed: Boolean(set.completed),
              },
            });
          }
        }
      }
    }

    return this.prisma.workoutSession.update({
      where: { id: data.sessionId },
      data: {
        endedAt: new Date(),
        rpe: data.rpe ?? 7,
        notes: data.notes ?? null,
      },
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
}
