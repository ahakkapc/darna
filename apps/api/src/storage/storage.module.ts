import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { S3ClientService } from './s3.client';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StorageController],
  providers: [S3ClientService, StorageService],
  exports: [StorageService, S3ClientService],
})
export class StorageModule {}
