import { Module } from '@nestjs/common';
import { ExerciseController } from './exercise.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExerciseController],
})
export class ExerciseModule {}
