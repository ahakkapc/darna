import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycAdminController } from './kyc-admin.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [KycController, KycAdminController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
