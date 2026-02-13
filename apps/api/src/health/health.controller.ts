import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BullMQClient } from '../jobs/bullmq.client';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmq: BullMQClient,
  ) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.prisma.user.count({ take: 1 });
      db = true;
    } catch {
      db = false;
    }

    let queue = false;
    let workerStatus = 'unknown';
    try {
      queue = await this.bullmq.ping();
      if (queue) {
        const hb = await this.bullmq.connection.get('worker:heartbeat');
        if (hb) {
          const age = Date.now() - parseInt(hb, 10);
          workerStatus = age < 60_000 ? 'up' : 'stale';
        } else {
          workerStatus = 'no-heartbeat';
        }
      }
    } catch {
      queue = false;
    }

    return {
      ok: db && queue,
      db: db ? 'up' : 'down',
      queue: queue ? 'up' : 'down',
      worker: workerStatus,
      ts: new Date().toISOString(),
    };
  }
}
