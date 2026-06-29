import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { WorkoutService } from './workout.service';

@Controller('workout')
export class WorkoutController {
  constructor(private readonly workoutService: WorkoutService) {}

  @Post('start')
  startWorkout(@Body() startWorkoutDto: { userId: string; routineId: string }) {
    return this.workoutService.startWorkout(startWorkoutDto.userId, startWorkoutDto.routineId);
  }

  @Post('finish')
  finishWorkout(@Body() finishWorkoutDto: { sessionId: string; rpe: number }) {
    return this.workoutService.finishWorkout(finishWorkoutDto.sessionId, finishWorkoutDto.rpe);
  }
}
