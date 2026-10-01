import { Controller, Get, Post, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { ExerciseService } from './exercise.service';

@Controller('exercises')
export class ExerciseController {
  constructor(
    private prisma: PrismaService,
    private exerciseService: ExerciseService,
  ) {}

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
      data: { name, category, source: 'custom' },
    });
  }

  @Post('sync-wger')
  @UseGuards(AuthGuard('jwt'))
  syncWger() {
    return this.exerciseService.importFromWger();
  }
}
