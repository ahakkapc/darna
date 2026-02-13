import { IsString } from 'class-validator';

export class ChoosePlanDto {
  @IsString()
  planCode!: string;
}
