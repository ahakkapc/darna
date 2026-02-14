import { Module, forwardRef } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { TasksModule } from '../crm/tasks/tasks.module';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    forwardRef(() => TasksModule),
  ],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
