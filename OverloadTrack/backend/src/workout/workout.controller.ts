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

  @Get('next-recommendation')
  getNextRecommendation(@Request() req: any) {
    return this.workoutService.getNextRecommendedWorkout(req.user.userId);
  }

  @Post('regenerate-recommendation')
  regenerateRecommendation(@Request() req: any) {
    return this.workoutService.getNextRecommendedWorkout(req.user.userId, true);
  }

  @Get('test-week')
  getTestWeekStatus(@Request() req: any) {
    return this.workoutService.getTestWeekStatus(req.user.userId);
  }

  @Post('test-week/start/:step')
  startTestWeekSession(@Request() req: any, @Param('step') step: string) {
    return this.workoutService.startTestWeekSession(req.user.userId, parseInt(step, 10) || 1);
  }

  @Post('test-week/skip')
  skipTestWeek(@Request() req: any) {
    return this.workoutService.skipTestWeek(req.user.userId);
  }

  @Post('test-week/reset')
  resetTestWeek(@Request() req: any) {
    return this.workoutService.resetTestWeek(req.user.userId);
  }

  @Post('start-recommended')
  startRecommended(@Request() req: any, @Body() body?: { customRec?: any }) {
    return this.workoutService.startRecommendedWorkout(req.user.userId, body?.customRec);
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
