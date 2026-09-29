import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(data: any) {
    if (!data?.email || !data?.password) {
      throw new BadRequestException('Veuillez renseigner un email et un mot de passe.');
    }

    const email = data.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Un compte existe déjà avec cette adresse email.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          profile: {
            create: {
              dateOfBirth: new Date(),
              height: 175,
              weight: 70
            }
          }
        }
      });

      return this.login(user);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Un compte existe déjà avec cette adresse email.');
      }
      throw error;
    }
  }

  async login(user: any) {
    const email = user.email ? user.email.trim().toLowerCase() : undefined;
    let dbUser = user.id ? user : await this.prisma.user.findUnique({ where: { email } });
    
    if (!dbUser) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (!user.id) {
      const isPasswordValid = await bcrypt.compare(user.password, dbUser.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Identifiants incorrects.');
      }
    }

    const payload = { email: dbUser.email, sub: dbUser.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: dbUser.id,
        email: dbUser.email
      }
    };
  }
}
