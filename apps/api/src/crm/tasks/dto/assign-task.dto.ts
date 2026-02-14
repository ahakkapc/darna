import { IsOptional, IsUUID } from 'class-validator';

export class AssignTaskDto {
  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null;
}
