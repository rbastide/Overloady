import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async createUser(data: {
    email: string;
    dateOfBirth: string;
    height: number;
    weight: number;
  }): Promise<User> {
    // Dans une vraie app, le mot de passe devrait être unique et hashé.
    // Pour ce cas, nous utilisons un mot de passe factice.
    const password = 'password123';

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: password, // ATTENTION: Mot de passe en clair pour l'exemple
        profile: {
          create: {
            dateOfBirth: new Date(data.dateOfBirth),
            height: data.height,
            weight: data.weight,
          },
        },
      },
      include: {
        profile: true,
      },
    });
  }
}
