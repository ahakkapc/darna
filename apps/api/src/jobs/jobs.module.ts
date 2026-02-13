import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BullMQClient } from './bullmq.client';
import { JobsService } from './jobs.service';
import { JobsAdminController } from './jobs.controller.admin';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [JobsAdminController],
  providers: [BullMQClient, JobsService],
  exports: [JobsService, BullMQClient],
})
export class JobsModule {}
