import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PreferencesController } from './preferences.controller';

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [NotificationsController, PreferencesController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
