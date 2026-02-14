import { IsOptional, IsIn, IsDateString } from 'class-validator';

export class CollaboratorsQueryDto {
  @IsIn(['today', 'week', 'month', 'custom'])
  period!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['leadsWon', 'visitsCompleted', 'callsLogged', 'tasksOverdue'])
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: string;
}
