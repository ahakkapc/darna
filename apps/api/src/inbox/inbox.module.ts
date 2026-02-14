import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../crm/activities/activities.module';
import { CommModule } from '../comm/comm.module';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { WhatsAppInboundProcessor } from './whatsapp-inbound.processor';
import { WhatsAppInboundController } from '../webhooks/whatsapp/whatsapp-inbound.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    IntegrationsModule,
    NotificationsModule,
    forwardRef(() => ActivitiesModule),
    CommModule,
  ],
  controllers: [InboxController, WhatsAppInboundController],
  providers: [InboxService, WhatsAppInboundProcessor],
  exports: [InboxService],
})
export class InboxModule {}
