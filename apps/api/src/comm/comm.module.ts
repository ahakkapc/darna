import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { CommHubService } from './comm-hub.service';
import { LeadActivityBridgeService } from './lead-activity-bridge.service';
import { ReplyDetectorService } from './reply-detector.service';
import { CommController } from './comm.controller';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [CommController],
  providers: [CommHubService, LeadActivityBridgeService, ReplyDetectorService],
  exports: [CommHubService, ReplyDetectorService],
})
export class CommModule {}
