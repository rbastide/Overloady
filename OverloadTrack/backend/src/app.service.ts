import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /** Smallest possible query: wakes a scaled-to-zero database (Neon) and tells how long it took. */
  async pingDatabase(): Promise<number> {
    const started = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return Date.now() - started;
  }
}
