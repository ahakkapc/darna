import { IsUUID } from 'class-validator';

export class AssignThreadDto {
  @IsUUID()
  userId!: string;
}
