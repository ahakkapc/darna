import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SequenceRendererService } from '../sequences/sequence-renderer.service';
import { MessageTemplatesService } from './message-templates.service';
import { MessageTemplatesController } from './message-templates.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService, SequenceRendererService],
  exports: [MessageTemplatesService, SequenceRendererService],
})
export class MessageTemplatesModule {}
