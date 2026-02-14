import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withOrg } from '../../tenancy/with-org';
import { SecretsService } from '../../integrations/secrets.service';
import { JobsService } from '../../jobs/jobs.service';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class MetaLeadgenService {
  private readonly logger = new Logger('MetaLeadgenService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly jobsService: JobsService,
  ) {}

  // ─── CRUD MetaLeadSource ────────────────────────────────

  async listSources(orgId: string) {
    const items: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).metaLeadSource.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
      }),
    ) as any[];
    return { items };
  }

  async createSource(orgId: string, data: {
    integrationId: string;
    pageId: string;
    pageName?: string;
    formId: string;
    formName?: string;
    routingStrategy?: string;
    defaultOwnerUserId?: string;
    fieldMappingJson?: Record<string, string>;
  }) {
    // Verify integration exists and is META_LEADGEN
    const integ: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.findFirst({
        where: { id: data.integrationId, type: 'META_LEADGEN' },
      }),
    );
    if (!integ) {
      throw new AppError('INTEGRATION_NOT_FOUND', 404, 'Meta Leadgen integration not found');
    }

    // Validate defaultOwnerUserId is org member
    if (data.defaultOwnerUserId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: data.defaultOwnerUserId, orgId } },
      });
      if (!membership) {
        throw new AppError('OWNER_NOT_MEMBER', 400, 'Default owner is not a member of this organization');
      }
    }

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).metaLeadSource.create({
        data: {
          organizationId: orgId,
          integrationId: data.integrationId,
          pageId: data.pageId,
          pageName: data.pageName ?? null,
          formId: data.formId,
          formName: data.formName ?? null,
          routingStrategy: (data.routingStrategy as any) ?? 'ROUND_ROBIN',
          defaultOwnerUserId: data.defaultOwnerUserId ?? null,
          fieldMappingJson: data.fieldMappingJson ?? undefined,
        },
      }),
    );
  }

  async updateSource(orgId: string, id: string, data: {
    pageName?: string;
    formName?: string;
    isActive?: boolean;
    routingStrategy?: string;
    defaultOwnerUserId?: string | null;
    fieldMappingJson?: Record<string, string>;
  }) {
    const existing: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).metaLeadSource.findFirst({ where: { id } }),
    );
    if (!existing) {
      throw new AppError('META_SOURCE_NOT_FOUND', 404, 'Meta lead source not found');
    }

    if (data.defaultOwnerUserId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: data.defaultOwnerUserId, orgId } },
      });
      if (!membership) {
        throw new AppError('OWNER_NOT_MEMBER', 400, 'Default owner is not a member of this organization');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.pageName !== undefined) updateData.pageName = data.pageName;
    if (data.formName !== undefined) updateData.formName = data.formName;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.routingStrategy !== undefined) updateData.routingStrategy = data.routingStrategy;
    if (data.defaultOwnerUserId !== undefined) updateData.defaultOwnerUserId = data.defaultOwnerUserId;
    if (data.fieldMappingJson !== undefined) updateData.fieldMappingJson = data.fieldMappingJson;

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).metaLeadSource.update({ where: { id }, data: updateData }),
    );
  }

  async getSource(orgId: string, id: string) {
    const source: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).metaLeadSource.findFirst({ where: { id } }),
    );
    if (!source) {
      throw new AppError('META_SOURCE_NOT_FOUND', 404, 'Meta lead source not found');
    }
    return source;
  }

  // ─── Backfill trigger ───────────────────────────────────

  async triggerBackfill(orgId: string, sourceId: string, sinceHours = 72) {
    const source = await this.getSource(orgId, sourceId);
    await this.jobsService.enqueue('META_LEADGEN_BACKFILL' as any, {
      metaLeadSourceId: source.id,
      organizationId: orgId,
      sinceHours,
    });
    return { ok: true, data: { enqueued: true } };
  }
}
