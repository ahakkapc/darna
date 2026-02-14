import { IsString, MinLength, MaxLength } from 'class-validator';

export class PutSecretDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  value!: string;
}
