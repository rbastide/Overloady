import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkoutService {
  constructor(private prisma: PrismaService) {}

  async startWorkout(userId: string, routineId: string) {
    const lastSession = await this.prisma.workoutSession.findFirst({
      where: {
        userId,
        routineId,
        endedAt: {
          not: null,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      include: {
        exercises: {
          include: {
            sets: true,
          },
        },
      },
    });

    const newSession = await this.prisma.workoutSession.create({
      data: {
        userId,
        routineId,
        rpe: 0, // Will be set at the end
      },
    });

    if (lastSession) {
      for (const lastExerciseLog of lastSession.exercises) {
        const newExerciseLog = await this.prisma.exerciseLog.create({
          data: {
            sessionId: newSession.id,
            exerciseId: lastExerciseLog.exerciseId,
          },
        });

        for (const lastSet of lastExerciseLog.sets) {
          let newWeight = lastSet.weight;
          if (lastSet.completed) {
            newWeight += 2.5; // Progressive overload
          }

          await this.prisma.setLog.create({
            data: {
              exerciseLogId: newExerciseLog.id,
              reps: lastSet.reps,
              weight: newWeight,
              completed: false, // To be updated by the user
            },
          });
        }
      }
    }

    return this.prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          include: {
            sets: true,
          },
        },
      },
    });
  }

  async finishWorkout(sessionId: string, rpe: number) {
    return this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        rpe,
      },
    });
  }
}
