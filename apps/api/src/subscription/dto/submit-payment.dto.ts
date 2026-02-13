import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SubmitPaymentDto {
  @IsInt()
  @Min(1)
  amountDa!: number;

  @IsString()
  method!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
