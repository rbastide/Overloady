import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoutineService {
  constructor(private prisma: PrismaService) {}

  async getRoutines(userId: string) {
    return this.prisma.routine.findMany({
      where: { userId },
      include: {
        exercises: true,
        _count: { select: { sessions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createRoutine(userId: string, data: { name: string; exerciseIds: string[] }) {
    if (!data?.name?.trim()) {
      throw new BadRequestException('Le nom de la routine est obligatoire.');
    }

    return this.prisma.routine.create({
      data: {
        name: data.name.trim(),
        userId,
        exercises: {
          connect: (data.exerciseIds || []).map((id) => ({ id })),
        },
      },
      include: {
        exercises: true,
      },
    });
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
