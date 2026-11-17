import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
} from './athlete-profile';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { username: true } } }
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async updateProfile(
    userId: string,
    data: {
      height?: number;
      weight?: number;
      dateOfBirth?: string;
      goal?: string;
      experience?: string;
      bodyFat?: number | string | null;
      firstName?: string | null;
      birthYear?: number | string | null;
      equipment?: string;
      sessionMinutes?: number | string | null;
      painAreas?: string[] | string | null;
      painNote?: string | null;
    },
  ) {
    const updateData: any = {};
    if (data.height) {
      updateData.height = normalizeHeight(data.height);
      if (updateData.height === undefined) throw new BadRequestException('Taille invalide (120 à 230 cm).');
    }
    if (data.weight) {
      updateData.weight = normalizeWeight(data.weight);
      if (updateData.weight === undefined) throw new BadRequestException('Poids invalide (30 à 250 kg).');
    }
    if (data.experience !== undefined) {
      updateData.experience = normalizeExperience(data.experience);
      if (!updateData.experience) throw new BadRequestException("Niveau d'expérience invalide.");
    }
    // Optional fields: an empty value clears them
    const cleared = (value: unknown) => value === null || value === '';
    if (data.bodyFat !== undefined) {
      updateData.bodyFat = cleared(data.bodyFat) ? null : normalizeBodyFat(data.bodyFat);
      if (updateData.bodyFat === undefined) throw new BadRequestException('Masse grasse invalide (3 à 60 %).');
    }
    if (data.firstName !== undefined) updateData.firstName = normalizeShortText(data.firstName, 30);
    if (data.birthYear !== undefined) {
      updateData.birthYear = cleared(data.birthYear) ? null : normalizeBirthYear(data.birthYear);
      if (updateData.birthYear === undefined) throw new BadRequestException('Année de naissance invalide.');
    }
    if (data.sessionMinutes !== undefined) {
      updateData.sessionMinutes = cleared(data.sessionMinutes) ? null : normalizeSessionMinutes(data.sessionMinutes);
      if (updateData.sessionMinutes === undefined) throw new BadRequestException('Durée de séance invalide (15 à 180 min).');
    }
    if (data.equipment !== undefined) {
      updateData.equipment = normalizeEquipment(data.equipment);
      if (!updateData.equipment) throw new BadRequestException('Matériel invalide.');
    }
    if (data.painAreas !== undefined) updateData.painAreas = normalizePainAreas(data.painAreas);
    if (data.painNote !== undefined) updateData.painNote = normalizeShortText(data.painNote, 80);
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.goal) {
      updateData.goal = normalizeGoal(data.goal);
      if (!updateData.goal) throw new BadRequestException('Objectif invalide.');
    }

    return this.prisma.profile.update({
      where: { userId },
      data: updateData,
    });
  }
}
