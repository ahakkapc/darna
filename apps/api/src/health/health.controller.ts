import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.prisma.user.count({ take: 1 });
      db = true;
    } catch {
      db = false;
    }

    return {
      ok: db,
      db: db ? 'up' : 'down',
      ts: new Date().toISOString(),
    };
  }
}
