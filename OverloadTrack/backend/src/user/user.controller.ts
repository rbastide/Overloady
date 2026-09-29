import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  getProfile(@Request() req: any) {
    return this.userService.getProfile(req.user.userId);
  }

  @Put()
  updateProfile(@Request() req: any, @Body() body: any) {
    return this.userService.updateProfile(req.user.userId, body);
  }
}
