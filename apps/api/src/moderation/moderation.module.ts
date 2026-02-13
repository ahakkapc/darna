import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { ModerationAdminController } from './moderation-admin.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ModerationController, ModerationAdminController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
