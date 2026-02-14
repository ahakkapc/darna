import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { JobsService } from '../jobs/jobs.service';
import { INTEGRATION_NOT_FOUND } from './integration.errors';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger('IntegrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    data: { type: string; provider: string; name: string; configJson?: Record<string, unknown> },
  ) {
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.create({
        data: {
          organizationId: orgId,
          type: data.type as any,
          provider: data.provider as any,
          name: data.name,
          configJson: data.configJson ?? undefined,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      }),
    );
  }

  async findAll(orgId: string, filters?: { type?: string; status?: string }) {
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.findMany({
        where: {
          ...(filters?.type ? { type: filters.type as any } : {}),
          ...(filters?.status ? { status: filters.status as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async findOne(orgId: string, id: string) {
    const item = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.findFirst({ where: { id } }),
    );
    if (!item) throw INTEGRATION_NOT_FOUND();
    return item;
  }

  async update(
    orgId: string,
    id: string,
    userId: string,
    data: { name?: string; configJson?: Record<string, unknown> },
  ) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.configJson !== undefined ? { configJson: data.configJson } : {}),
          updatedByUserId: userId,
        },
      }),
    );
  }

  async disable(orgId: string, id: string, userId: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.update({
        where: { id },
        data: { status: 'DISABLED', updatedByUserId: userId },
      }),
    );
  }

  async enable(orgId: string, id: string, userId: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.update({
        where: { id },
        data: { status: 'ACTIVE', updatedByUserId: userId },
      }),
    );
  }

  async triggerHealthCheck(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.jobsService.enqueue('INTEGRATION_HEALTHCHECK', {
      integrationId: id,
      organizationId: orgId,
    });
    return { enqueued: true };
  }
}
