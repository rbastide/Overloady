import { Body, Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PushService, PushSubscriptionDto } from './push.service';

@Controller('push')
@UseGuards(AuthGuard('jwt'))
export class PushController {
  constructor(private pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  subscribe(@Request() req: any, @Body() body: PushSubscriptionDto) {
    return this.pushService.subscribe(req.user.userId, body);
  }

  @Post('unsubscribe')
  unsubscribe(@Request() req: any, @Body() body: { endpoint?: string }) {
    return this.pushService.unsubscribe(req.user.userId, body?.endpoint);
  }

  /** The rest timer is running: notify the athlete's devices when it ends. */
  @Post('rest')
  scheduleRest(@Request() req: any, @Body() body: { seconds?: number }) {
    return this.pushService.scheduleRestEnd(req.user.userId, Number(body?.seconds));
  }

  /** Paused, skipped or closed: the pending notification is dropped. */
  @Delete('rest')
  cancelRest(@Request() req: any) {
    return this.pushService.cancelRestEnd(req.user.userId);
  }
}
