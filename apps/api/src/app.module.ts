import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AuthModule } from './auth/auth.module';
import { OrgModule } from './org/org.module';
import { LeadModule } from './lead/lead.module';
import { KycModule } from './kyc/kyc.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ListingModule } from './listing/listing.module';
import { ModerationModule } from './moderation/moderation.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { JobsModule } from './jobs/jobs.module';
import { ActivitiesModule } from './crm/activities/activities.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './crm/tasks/tasks.module';
import { PlanningModule } from './planning/planning.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MetaLeadgenModule } from './meta/leadgen/meta-leadgen.module';
import { InboxModule } from './inbox/inbox.module';
import { CommModule } from './comm/comm.module';
import { MessageTemplatesModule } from './templates/message-templates.module';
import { MessageSequencesModule } from './sequences/message-sequences.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';

@Module({
  imports: [PrismaModule, TenancyModule, AuthModule, OrgModule, LeadModule, KycModule, SubscriptionModule, ListingModule, ModerationModule, OnboardingModule, AuditModule, StorageModule, JobsModule, ActivitiesModule, NotificationsModule, TasksModule, PlanningModule, DashboardModule, IntegrationsModule, MetaLeadgenModule, InboxModule, CommModule, MessageTemplatesModule, MessageSequencesModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
}
