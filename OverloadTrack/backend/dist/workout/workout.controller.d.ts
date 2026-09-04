import { WorkoutService } from './workout.service';
export declare class WorkoutController {
    private readonly workoutService;
    constructor(workoutService: WorkoutService);
    startWorkout(startWorkoutDto: {
        userId: string;
        routineId: string;
    }): Promise<import(".prisma/client").WorkoutSession & {
        exercises: (import(".prisma/client").ExerciseLog & {
            sets: import(".prisma/client").SetLog[];
        })[];
    }>;
    finishWorkout(finishWorkoutDto: {
        sessionId: string;
        rpe: number;
    }): Promise<import(".prisma/client").WorkoutSession>;
}
