import { IsString, MinLength, MaxLength } from 'class-validator';

export class CancelCalendarEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason!: string;
}
