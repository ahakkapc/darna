import { Module, forwardRef } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { LeadModule } from '../../lead/lead.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => LeadModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
