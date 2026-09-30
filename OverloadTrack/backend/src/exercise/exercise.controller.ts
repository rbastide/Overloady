import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_EXERCISES = [
  { wgerId: 101, name: 'Bench Press (Barbell)', category: 'Pectoraux' },
  { wgerId: 102, name: 'Squat (Barbell)', category: 'Jambes' },
  { wgerId: 103, name: 'Deadlift (Barbell)', category: 'Dos' },
  { wgerId: 104, name: 'Overhead Press (Dumbbell)', category: 'Épaules' },
  { wgerId: 105, name: 'Pull-up', category: 'Dos' },
  { wgerId: 106, name: 'Barbell Row', category: 'Dos' },
  { wgerId: 107, name: 'Leg Press', category: 'Jambes' },
  { wgerId: 108, name: 'Bicep Curl (Dumbbell)', category: 'Bras' },
  { wgerId: 109, name: 'Tricep Extension (Cable)', category: 'Bras' },
  { wgerId: 110, name: 'Lat Pulldown (Cable)', category: 'Dos' },
  { wgerId: 111, name: 'Incline Dumbbell Press', category: 'Pectoraux' },
  { wgerId: 112, name: 'Romanian Deadlift', category: 'Jambes' },
  { wgerId: 113, name: 'Lateral Raise (Dumbbell)', category: 'Épaules' },
  { wgerId: 114, name: 'Dips (Chest / Triceps)', category: 'Pectoraux' },
  { wgerId: 115, name: 'Cable Crunch / Abs', category: 'Abdominaux' },
];

@Controller('exercises')
export class ExerciseController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll() {
    const count = await this.prisma.exercise.count();
    if (count === 0) {
      for (const ex of DEFAULT_EXERCISES) {
        await (this.prisma.exercise as any).upsert({
          where: { wgerId: ex.wgerId },
          update: { name: ex.name, category: ex.category },
          create: { wgerId: ex.wgerId, name: ex.name, category: ex.category },
        });
      }
    }
    return this.prisma.exercise.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  @Post()
  async create(@Body() body: { name: string; category?: string }) {
    if (!body?.name?.trim()) {
      throw new BadRequestException("Le nom de l'exercice est obligatoire.");
    }
    const name = body.name.trim();
    const category = body.category?.trim() || 'Général';

    return this.prisma.exercise.create({
      data: {
        name,
        category,
        wgerId: Math.floor(100000 + Math.random() * 900000),
      },
    });
  }
}
