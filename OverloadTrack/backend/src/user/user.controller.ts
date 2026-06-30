import { Controller, Post, Body } from '@nestjs/common';
import { UserService } from './user.service';

class OnboardingDto {
  email: string;
  dateOfBirth: string; // Format YYYY-MM-DD attendu
  height: number;
  weight: number;
}

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('onboarding')
  async completeOnboarding(@Body() onboardingDto: OnboardingDto) {
    // Validation basique
    if (!onboardingDto.email || !onboardingDto.dateOfBirth || !onboardingDto.height || !onboardingDto.weight) {
      throw new Error('Tous les champs sont requis');
    }

    return this.userService.createUser({
      ...onboardingDto,
      height: Number(onboardingDto.height),
      weight: Number(onboardingDto.weight),
    });
  }
}
