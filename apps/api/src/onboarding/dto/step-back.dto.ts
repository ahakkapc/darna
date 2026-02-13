import { IsEnum } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class StepBackDto {
  @IsEnum(OnboardingStep)
  to!: OnboardingStep;
}
