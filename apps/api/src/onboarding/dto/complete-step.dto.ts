import { IsEnum } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class CompleteStepDto {
  @IsEnum(OnboardingStep)
  step!: OnboardingStep;
}
