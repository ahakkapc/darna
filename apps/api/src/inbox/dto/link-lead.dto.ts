import { IsUUID } from 'class-validator';

export class LinkLeadDto {
  @IsUUID()
  leadId!: string;
}
