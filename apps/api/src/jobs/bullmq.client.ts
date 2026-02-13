import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class BullMQClient implements OnModuleDestroy {
  private readonly logger = new Logger('BullMQClient');
  readonly connection: IORedis;
  readonly queue: Queue;
  readonly queueName: string;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.queueName = process.env.JOBS_QUEUE_NAME ?? 'darna-jobs';

    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(this.queueName, { connection: this.connection as any });

    this.logger.log(`BullMQ queue "${this.queueName}" connected to ${redisUrl}`);
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.connection.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async add(jobId: string, type: string, data: Record<string, unknown>) {
    await this.queue.add(type, data, {
      jobId,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
