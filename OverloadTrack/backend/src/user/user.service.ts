import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } }
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async updateProfile(userId: string, data: { height?: number; weight?: number; dateOfBirth?: string; goal?: string }) {
    const updateData: any = {};
    if (data.height) updateData.height = data.height;
    if (data.weight) updateData.weight = data.weight;
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.goal) updateData.goal = data.goal.toUpperCase();

    return this.prisma.profile.update({
      where: { userId },
      data: updateData,
    });
  }
}
