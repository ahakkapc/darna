import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { JobsModule } from '../../jobs/jobs.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ActivitiesModule } from '../../crm/activities/activities.module';
import { LeadModule } from '../../lead/lead.module';
import { MetaLeadgenService } from './meta-leadgen.service';
import { MetaLeadgenController } from './meta-leadgen.controller';
import { MetaLeadgenProcessor } from './meta-leadgen.processor';
import { MetaLeadgenWebhookController } from '../../webhooks/meta/meta-leadgen.controller';
import { LeadRoutingService } from './lead-routing.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JobsModule,
    IntegrationsModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => ActivitiesModule),
    forwardRef(() => LeadModule),
  ],
  controllers: [
    MetaLeadgenWebhookController,
    MetaLeadgenController,
  ],
  providers: [
    MetaLeadgenService,
    MetaLeadgenProcessor,
    LeadRoutingService,
  ],
  exports: [
    MetaLeadgenService,
    LeadRoutingService,
  ],
})
export class MetaLeadgenModule {}
