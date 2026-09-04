"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkoutService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let WorkoutService = class WorkoutService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async startWorkout(userId, routineId) {
        const lastSession = await this.prisma.workoutSession.findFirst({
            where: {
                userId,
                routineId,
                endedAt: {
                    not: null,
                },
            },
            orderBy: {
                startedAt: 'desc',
            },
            include: {
                exercises: {
                    include: {
                        sets: true,
                    },
                },
            },
        });
        const newSession = await this.prisma.workoutSession.create({
            data: {
                userId,
                routineId,
                rpe: 0,
            },
        });
        if (lastSession) {
            for (const lastExerciseLog of lastSession.exercises) {
                const newExerciseLog = await this.prisma.exerciseLog.create({
                    data: {
                        sessionId: newSession.id,
                        exerciseId: lastExerciseLog.exerciseId,
                    },
                });
                for (const lastSet of lastExerciseLog.sets) {
                    let newWeight = lastSet.weight;
                    if (lastSet.completed) {
                        newWeight += 2.5;
                    }
                    await this.prisma.setLog.create({
                        data: {
                            exerciseLogId: newExerciseLog.id,
                            reps: lastSet.reps,
                            weight: newWeight,
                            completed: false,
                        },
                    });
                }
            }
        }
        return this.prisma.workoutSession.findUnique({
            where: { id: newSession.id },
            include: {
                exercises: {
                    include: {
                        sets: true,
                    },
                },
            },
        });
    }
    async finishWorkout(sessionId, rpe) {
        return this.prisma.workoutSession.update({
            where: { id: sessionId },
            data: {
                endedAt: new Date(),
                rpe,
            },
        });
    }
};
WorkoutService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WorkoutService);
exports.WorkoutService = WorkoutService;
//# sourceMappingURL=workout.service.js.map