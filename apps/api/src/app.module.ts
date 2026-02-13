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
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

@Module({
  imports: [PrismaModule, TenancyModule, AuthModule, OrgModule, LeadModule, KycModule, SubscriptionModule, ListingModule, ModerationModule, OnboardingModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
