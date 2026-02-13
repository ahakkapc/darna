import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  orgId?: string;
  userId?: string;
  actorRole: 'ORG' | 'EXTERNAL' | 'SYSTEM';
  actorLabel?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metaJson?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.orgId ?? null,
          userId: entry.userId ?? null,
          actorRole: entry.actorRole,
          actorLabel: entry.actorLabel ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          ip: entry.ip ? this.maskIp(entry.ip) : null,
          userAgent: entry.userAgent ? entry.userAgent.substring(0, 200) : null,
          metaJson: entry.metaJson ? (entry.metaJson as any) : undefined,
        },
      });
    } catch (err) {
      this.logger.error(`AUDIT_WRITE_FAILED: ${entry.action} — ${(err as Error).message}`);
    }
  }

  async query(params: {
    orgId?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params.orgId) where.organizationId = params.orgId;
    if (params.action) where.action = params.action;

    const dateFilter: Record<string, Date> = {};
    if (params.from) dateFilter.gte = new Date(params.from);
    if (params.to) dateFilter.lte = new Date(params.to);
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private maskIp(ip: string): string {
    if (ip.includes('.')) {
      const parts = ip.split('.');
      return `${parts[0]}.${parts[1]}.***.***.`;
    }
    return ip.substring(0, 10) + '***';
  }
}
