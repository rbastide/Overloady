import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { WorkoutModule } from './workout/workout.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ExerciseModule } from './exercise/exercise.module';
import { RoutineModule } from './routine/routine.module';

@Module({
  imports: [PrismaModule, WorkoutModule, AuthModule, UserModule, ExerciseModule, RoutineModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
