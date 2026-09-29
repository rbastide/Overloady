import { Controller, Post, Body, Get, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { WorkoutService, FinishWorkoutDto } from './workout.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('workout')
@UseGuards(AuthGuard('jwt'))
export class WorkoutController {
  constructor(private readonly workoutService: WorkoutService) {}

  @Get('history')
  getHistory(@Request() req: any) {
    return this.workoutService.getHistory(req.user.userId);
  }

  @Get('dashboard-stats')
  getDashboardStats(@Request() req: any) {
    return this.workoutService.getDashboardStats(req.user.userId);
  }

  @Get('analytics')
  getAnalytics(@Request() req: any) {
    return this.workoutService.getAnalytics(req.user.userId);
  }

  @Post('warmup')
  getWarmupSets(@Body() body: { targetWeight: number; barWeight?: number }) {
    return this.workoutService.getWarmupSets(Number(body.targetWeight) || 60, body.barWeight ? Number(body.barWeight) : 20);
  }

  @Get('stats/:exerciseId')
  getExerciseStats(@Request() req: any, @Param('exerciseId') exerciseId: string) {
    return this.workoutService.getExerciseStats(req.user.userId, exerciseId);
  }

  @Post('start')
  startWorkout(@Request() req: any, @Body() startWorkoutDto: { routineId?: string }) {
    return this.workoutService.startWorkout(req.user.userId, startWorkoutDto.routineId);
  }

  @Post('finish')
  finishWorkout(@Request() req: any, @Body() finishWorkoutDto: FinishWorkoutDto) {
    return this.workoutService.finishWorkout(req.user.userId, finishWorkoutDto);
  }

  @Delete('session/:id')
  deleteSession(@Request() req: any, @Param('id') sessionId: string) {
    return this.workoutService.deleteSession(req.user.userId, sessionId);
  }
}
