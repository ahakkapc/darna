import { IsIn } from 'class-validator';

export class ChangeStatusDto {
  @IsIn(['OPEN', 'PENDING', 'CLOSED'])
  status!: string;
}
