import { PrismaService } from '../prisma/prisma.service';
export declare class WorkoutService {
    private prisma;
    constructor(prisma: PrismaService);
    startWorkout(userId: string, routineId: string): Promise<import(".prisma/client").WorkoutSession & {
        exercises: (import(".prisma/client").ExerciseLog & {
            sets: import(".prisma/client").SetLog[];
        })[];
    }>;
    finishWorkout(sessionId: string, rpe: number): Promise<import(".prisma/client").WorkoutSession>;
}
