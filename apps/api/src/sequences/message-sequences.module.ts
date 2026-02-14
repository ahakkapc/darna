import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MessageTemplatesModule } from '../templates/message-templates.module';
import { MessageSequencesService } from './message-sequences.service';
import { MessageSequencesController, SequenceRunsController } from './message-sequences.controller';
import { SequenceTickService } from './sequence-tick.service';
import { SequenceRendererService } from './sequence-renderer.service';

@Module({
  imports: [PrismaModule, AuthModule, IntegrationsModule, MessageTemplatesModule],
  controllers: [MessageSequencesController, SequenceRunsController],
  providers: [MessageSequencesService, SequenceTickService, SequenceRendererService],
  exports: [MessageSequencesService, SequenceTickService],
})
export class MessageSequencesModule {}
