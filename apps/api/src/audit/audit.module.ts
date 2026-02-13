import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditAdminController } from './audit-admin.controller';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AuditAdminController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
