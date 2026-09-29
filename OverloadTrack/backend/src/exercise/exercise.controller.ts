import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('exercises')
export class ExerciseController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll() {
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
