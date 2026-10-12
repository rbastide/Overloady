import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushSubscriptionDto {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** Longest rest a notification can be scheduled for (seconds). */
const MAX_REST_SECONDS = 30 * 60;

/**
 * Rest timer notifications. A web app can't wake itself once iOS has put it in the background,
 * so the end of the rest is pushed by the server to every device the athlete enabled.
 * Pending notifications live in memory: a restart only drops the rest running at that moment.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private publicKey = '';
  private restTimers = new Map<string, NodeJS.Timeout>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.loadKeys();
    } catch (err: any) {
      // Push is a bonus: the app still starts without it (e.g. database not migrated yet)
      this.logger.warn(`Web Push disabled: ${err.message}`);
    }
  }

  private async loadKeys() {
    let publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    let privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

    if (!publicKey || !privateKey) {
      // No keys in the environment: the pair generated on first start is kept in the database
      const stored = await this.prisma.pushConfig.findUnique({ where: { id: 1 } });
      if (stored) {
        ({ publicKey, privateKey } = stored);
      } else {
        ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
        await this.prisma.pushConfig.create({ data: { id: 1, publicKey, privateKey } });
        this.logger.log('Generated the Web Push key pair');
      }
    }

    // Apple's push service rejects a missing or localhost contact
    webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || 'mailto:contact@overloady.app', publicKey, privateKey);
    this.publicKey = publicKey;
  }

  getPublicKey() {
    return this.publicKey;
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    const endpoint = dto?.endpoint;
    const p256dh = dto?.keys?.p256dh;
    const auth = dto?.keys?.auth;
    if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
      throw new BadRequestException('Abonnement aux notifications invalide');
    }

    // A device shared by two accounts notifies the one signed in last
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });
    return { success: true };
  }

  async unsubscribe(userId: string, endpoint?: string) {
    if (endpoint) await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { success: true };
  }

  scheduleRestEnd(userId: string, seconds: number) {
    if (!this.publicKey) return { success: false };
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_REST_SECONDS) {
      throw new BadRequestException('Durée de repos invalide');
    }

    this.cancelRestEnd(userId);
    const timer = setTimeout(() => {
      this.restTimers.delete(userId);
      this.notify(userId, {
        title: 'Repos terminé',
        body: "C'est reparti : place à la série suivante !",
        tag: 'rest-timer',
      }).catch((err) => this.logger.warn(`Rest notification failed: ${err.message}`));
    }, seconds * 1000);
    this.restTimers.set(userId, timer);
    return { success: true };
  }

  cancelRestEnd(userId: string) {
    const timer = this.restTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.restTimers.delete(userId);
    return { success: true };
  }

  private async notify(userId: string, payload: { title: string; body: string; tag: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            // Delivered right away or not at all: a late "rest over" is worse than none
            { TTL: 60, urgency: 'high' },
          );
        } catch (err: any) {
          // The device unsubscribed or the app was removed: forget it
          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Push to a device failed (${err.statusCode || err.message})`);
          }
        }
      }),
    );
  }
}
