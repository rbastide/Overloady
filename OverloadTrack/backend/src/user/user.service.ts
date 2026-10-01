import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeBodyFat, normalizeExperience, normalizeHeight, normalizeWeight } from './athlete-profile';
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
    if (data.bodyFat !== undefined) {
      // Body fat is optional: an empty value clears it.
      const cleared = data.bodyFat === null || data.bodyFat === '';
      updateData.bodyFat = cleared ? null : normalizeBodyFat(data.bodyFat);
      if (updateData.bodyFat === undefined) throw new BadRequestException('Masse grasse invalide (3 à 60 %).');
    }
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.goal) updateData.goal = data.goal.toUpperCase();

    return this.prisma.profile.update({
      where: { userId },
      data: updateData,
    });
  }
}
