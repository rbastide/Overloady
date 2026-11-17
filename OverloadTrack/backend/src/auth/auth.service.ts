import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  normalizeBirthYear,
  normalizeBodyFat,
  normalizeEquipment,
  normalizeExperience,
  normalizeGoal,
  normalizeHeight,
  normalizePainAreas,
  normalizeSessionMinutes,
  normalizeShortText,
  normalizeWeight,
} from '../user/athlete-profile';

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;
const MIN_PASSWORD_LENGTH = 6;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  private normalizeUsername(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  async register(data: any) {
    const username = this.normalizeUsername(data?.username);

    if (!username || !data?.password) {
      throw new BadRequestException('Veuillez renseigner un identifiant et un mot de passe.');
    }

    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        "L'identifiant doit contenir 3 à 24 caractères : lettres, chiffres, « . », « _ » ou « - »."
      );
    }

    if (data.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('Cet identifiant est déjà utilisé.');
    }

    const goal = normalizeGoal(data.goal) ?? 'BODYBUILDING';

    // Calibration is asked at sign-up (the web app now defaults to "no"): declining it opens the AI coach straight away
    const skipCalibration = data.calibration === false;

    // The year of birth is typed: a wrong one is said, not dropped (the profile update does the same)
    const birthYear = normalizeBirthYear(data.birthYear);
    if (data.birthYear !== undefined && data.birthYear !== null && data.birthYear !== '' && birthYear === undefined) {
      throw new BadRequestException('Année de naissance invalide.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          profile: {
            create: {
              dateOfBirth: new Date(),
              // Athlete profile is optional at sign-up: defaults until the athlete fills it.
              height: normalizeHeight(data.height) ?? 175,
              weight: normalizeWeight(data.weight) ?? 70,
              experience: normalizeExperience(data.experience) ?? 'BEGINNER',
              bodyFat: normalizeBodyFat(data.bodyFat) ?? null,
              firstName: normalizeShortText(data.firstName, 30),
              birthYear: birthYear ?? null,
              equipment: normalizeEquipment(data.equipment) ?? 'FULL_GYM',
              sessionMinutes: normalizeSessionMinutes(data.sessionMinutes) ?? null,
              painAreas: normalizePainAreas(data.painAreas),
              painNote: normalizeShortText(data.painNote, 80),
              goal,
              ...(skipCalibration && { testWeekCompleted: true, testWeekProgress: 3, testWeekSkipped: true }),
            } as any
          }
        }
      });

      return this.login(user);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Cet identifiant est déjà utilisé.');
      }
      throw error;
    }
  }

  async login(user: any) {
    let dbUser = user.id ? user : null;

    if (!dbUser) {
      const username = this.normalizeUsername(user?.username);
      if (!username || !user?.password) {
        throw new UnauthorizedException('Identifiants incorrects.');
      }
      dbUser = await this.prisma.user.findUnique({ where: { username } });
      if (!dbUser || !(await bcrypt.compare(user.password, dbUser.password))) {
        throw new UnauthorizedException('Identifiants incorrects.');
      }
    }

    const payload = { username: dbUser.username, sub: dbUser.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: dbUser.id,
        username: dbUser.username
      }
    };
  }
}
