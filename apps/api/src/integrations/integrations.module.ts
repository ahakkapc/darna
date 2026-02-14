import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { SecretsService } from './secrets.service';
import { SecretsController } from './secrets.controller';
import { SecretsVaultService } from './crypto/secrets-vault.service';
import { InboundEventsService } from './inbound/inbound-events.service';
import { InboundEventsController } from './inbound/inbound-events.controller';
import { OutboundJobsService } from './outbound/outbound-jobs.service';
import { OutboundJobsController } from './outbound/outbound-jobs.controller';
import { InboundProcessorRegistry } from './runtime/inbound-processor.registry';
import { OutboundProviderRegistry } from './runtime/outbound-provider.registry';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [
    InboundEventsController,
    OutboundJobsController,
    SecretsController,
    IntegrationsController,
  ],
  providers: [
    IntegrationsService,
    SecretsService,
    SecretsVaultService,
    InboundEventsService,
    OutboundJobsService,
    InboundProcessorRegistry,
    OutboundProviderRegistry,
  ],
  exports: [
    IntegrationsService,
    SecretsService,
    SecretsVaultService,
    InboundEventsService,
    OutboundJobsService,
    InboundProcessorRegistry,
    OutboundProviderRegistry,
  ],
})
export class IntegrationsModule {}
