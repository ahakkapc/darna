import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { LeadModule } from './lead/lead.module';

@Module({
  imports: [PrismaModule, TenancyModule, LeadModule],
  controllers: [HealthController],
})
export class AppModule {}
