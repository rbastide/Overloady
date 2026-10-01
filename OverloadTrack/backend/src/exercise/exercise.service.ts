import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { importWgerExercises, syncLocalCatalog } from './exercise-sync';

@Injectable()
export class ExerciseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExerciseService.name);
  private wgerImport: Promise<{ fetched: number; imported: number }> | null = null;

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const added = await syncLocalCatalog(this.prisma);
    if (added > 0) this.logger.log(`Local catalog: ${added} exercises added`);

    // The wger import hits an external API, so it runs in the background and never blocks startup.
    this.importFromWger().catch(() => undefined);
  }

  importFromWger() {
    if (!this.wgerImport) {
      this.wgerImport = importWgerExercises(this.prisma)
        .then((result) => {
          this.logger.log(`wger import: ${result.imported} new exercises (${result.fetched} fetched)`);
          return result;
        })
        .catch((err) => {
          this.logger.warn(`wger import failed: ${err.message}`);
          throw err;
        })
        .finally(() => {
          this.wgerImport = null;
        });
    }
    return this.wgerImport;
  }
}
