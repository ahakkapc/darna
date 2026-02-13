import { IsUUID } from 'class-validator';

export class TransferListingDto {
  @IsUUID()
  ownerUserId!: string;
}
