import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { RoutineService } from './routine.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('routines')
@UseGuards(AuthGuard('jwt'))
export class RoutineController {
  constructor(private readonly routineService: RoutineService) {}

  @Get()
  getRoutines(@Request() req: any) {
    return this.routineService.getRoutines(req.user.userId);
  }

  @Post()
  createRoutine(
    @Request() req: any,
    @Body() body: { name: string; exerciseIds: string[] },
  ) {
    return this.routineService.createRoutine(req.user.userId, body);
  }

  @Delete(':id')
  deleteRoutine(@Request() req: any, @Param('id') routineId: string) {
    return this.routineService.deleteRoutine(req.user.userId, routineId);
  }
}
