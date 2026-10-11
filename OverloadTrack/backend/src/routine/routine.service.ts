import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Puts a routine's exercises in the order the athlete arranged them.
 * Exercises missing from the order (routines created before it was stored) keep their place at the end.
 */
export function orderRoutineExercises<T extends { id: string }>(exercises: T[], exerciseOrder?: string[] | null): T[] {
  const rank = new Map((exerciseOrder ?? []).map((id, index) => [id, index]));
  return [...exercises].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

@Injectable()
export class RoutineService {
  constructor(private prisma: PrismaService) {}

  async getRoutines(userId: string) {
    const routines = await this.prisma.routine.findMany({
      where: { userId },
      include: {
        exercises: true,
        _count: { select: { sessions: true } },
      },
      orderBy: { name: 'asc' },
    });
    return routines.map((routine) => ({
      ...routine,
      exercises: orderRoutineExercises(routine.exercises, routine.exerciseOrder),
    }));
  }

  async createRoutine(userId: string, data: { name: string; exerciseIds: string[] }) {
    if (!data?.name?.trim()) {
      throw new BadRequestException('Le nom de la routine est obligatoire.');
    }

    const exerciseIds = Array.from(new Set(data.exerciseIds || []));
    const routine = await this.prisma.routine.create({
      data: {
        name: data.name.trim(),
        userId,
        exerciseOrder: exerciseIds,
        exercises: {
          connect: exerciseIds.map((id) => ({ id })),
        },
      },
      include: {
        exercises: true,
      },
    });
    return { ...routine, exercises: orderRoutineExercises(routine.exercises, routine.exerciseOrder) };
  }

  async deleteRoutine(userId: string, routineId: string) {
    const routine = await this.prisma.routine.findUnique({
      where: { id: routineId },
    });

    if (!routine) throw new NotFoundException('Routine introuvable');
    if (routine.userId !== userId) throw new ForbiddenException('Non autorisé');

    await this.prisma.routine.delete({
      where: { id: routineId },
    });

    return { success: true };
  }
}
