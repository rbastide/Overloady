import { Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Keep-alive and warm-up endpoint, public.
   * - `GET /health`: answers without touching the database. The external uptime pinger calls it
   *   every 5 minutes so Render never spins the service down, while Neon is left free to sleep.
   * - `GET /health?db=1`: also runs `SELECT 1`. The login screen calls it on load, so the database
   *   wakes up while the athlete is typing.
   */
  @Get('health')
  async health(@Query('db') db?: string) {
    if (db !== '1') return { status: 'ok' };
    try {
      const dbMs = await this.appService.pingDatabase();
      return { status: 'ok', db: 'ok', dbMs };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
