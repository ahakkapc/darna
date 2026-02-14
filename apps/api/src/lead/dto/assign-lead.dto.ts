import { IsUUID, IsOptional } from 'class-validator';

export class AssignLeadDto {
  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;
}
