import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AuthModule } from './auth/auth.module';
import { OrgModule } from './org/org.module';
import { LeadModule } from './lead/lead.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

@Module({
  imports: [PrismaModule, TenancyModule, AuthModule, OrgModule, LeadModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
