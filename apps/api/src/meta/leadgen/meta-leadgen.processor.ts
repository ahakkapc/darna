import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withOrg } from '../../tenancy/with-org';
import { SecretsService } from '../../integrations/secrets.service';
import { NotificationService } from '../../notifications/notification.service';
import { ActivitiesService } from '../../crm/activities/activities.service';
import {
  InboundProcessor,
  InboundProcessResult,
  InboundProcessorRegistry,
} from '../../integrations/runtime/inbound-processor.registry';
import { MetaGraphClient, MetaLeadData } from './meta-graph.client';
import { LeadRoutingService } from './lead-routing.service';

const CRM_FIELD_WHITELIST = new Set([
  'fullName', 'phone', 'email', 'wilaya', 'commune', 'quartier',
  'budgetMin', 'budgetMax', 'notes', 'propertyType', 'surfaceMin',
]);

const DEFAULT_LEAD_RESPONSE_SLA_MINUTES = 15;

@Injectable()
export class MetaLeadgenProcessor implements InboundProcessor, OnModuleInit {
  private readonly logger = new Logger('MetaLeadgenProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly notificationService: NotificationService,
    private readonly activitiesService: ActivitiesService,
    private readonly routingService: LeadRoutingService,
    private readonly registry: InboundProcessorRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('META_LEADGEN', this);
  }

  async process(
    ctx: { orgId: string; integrationId?: string },
    event: any,
  ): Promise<InboundProcessResult> {
    const { orgId } = ctx;
    const integrationId = ctx.integrationId ?? event.integrationId;
    const leadgenId = event.externalId;
    const metaJson = event.metaJson ?? {};
    const metaLeadSourceId = metaJson.metaLeadSourceId;

    try {
      // 1. Load integration (must be ACTIVE)
      const integ: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).integration.findFirst({
          where: { id: integrationId, status: 'ACTIVE' },
        }),
      );
      if (!integ) {
        return { success: false, errorCode: 'INTEGRATION_DISABLED', errorMsg: 'Integration not active', retriable: false };
      }

      // 2. Load MetaLeadSource
      const source: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).metaLeadSource.findFirst({
          where: { id: metaLeadSourceId, isActive: true },
        }),
      );
      if (!source) {
        return { success: false, errorCode: 'META_SOURCE_MISMATCH', errorMsg: 'Source not found or inactive', retriable: false };
      }

      // 3. Get access token
      const accessToken = await this.secretsService.getDecrypted(orgId, integrationId, 'access_token');
      if (!accessToken) {
        return { success: false, errorCode: 'INTEGRATION_SECRET_MISSING', errorMsg: 'access_token missing', retriable: false };
      }

      // 4. Fetch lead from Meta Graph API
      const config = (integ.configJson as any) ?? {};
      const client = new MetaGraphClient(
        accessToken,
        config.graphBaseUrl ?? 'https://graph.facebook.com',
        config.apiVersion ?? 'v20.0',
      );

      let leadData: MetaLeadData;
      try {
        leadData = await client.fetchLead(leadgenId, config.leadFetchFields);
      } catch (err: any) {
        const metaError = err.metaErrorType ?? 'META_LEAD_FETCH_FAILED';
        const retriable = metaError === 'META_RATE_LIMIT';
        return { success: false, errorCode: metaError, errorMsg: err.message, retriable };
      }

      // 5. Normalize field_data → kvMap
      const kvMap: Record<string, string> = {};
      for (const field of leadData.field_data ?? []) {
        if (field.name && field.values?.[0]) {
          kvMap[field.name] = field.values[0];
        }
      }

      // 6. Build CRM input via fieldMappingJson
      const mapping: Record<string, string> = (source.fieldMappingJson as any) ?? {};
      const crmInput: Record<string, unknown> = {};
      const customFields: Record<string, string> = {};

      for (const [metaField, metaValue] of Object.entries(kvMap)) {
        const crmField = mapping[metaField] ?? metaField;
        if (CRM_FIELD_WHITELIST.has(crmField)) {
          crmInput[crmField] = metaValue;
        } else {
          customFields[metaField] = metaValue;
        }
      }

      // 7. Normalize fields
      if (typeof crmInput.phone === 'string') {
        crmInput.phone = normalizePhone(crmInput.phone as string);
      }
      if (typeof crmInput.email === 'string') {
        crmInput.email = (crmInput.email as string).toLowerCase().trim();
      }
      if (typeof crmInput.budgetMin === 'string') {
        const parsed = parseInt(crmInput.budgetMin as string, 10);
        crmInput.budgetMin = isNaN(parsed) ? undefined : parsed;
        if (isNaN(parsed)) customFields['budgetMin_raw'] = crmInput.budgetMin as string;
      }
      if (typeof crmInput.budgetMax === 'string') {
        const parsed = parseInt(crmInput.budgetMax as string, 10);
        crmInput.budgetMax = isNaN(parsed) ? undefined : parsed;
        if (isNaN(parsed)) customFields['budgetMax_raw'] = crmInput.budgetMax as string;
      }

      // Ensure fullName
      if (!crmInput.fullName) {
        const fn = kvMap['full_name'] ?? kvMap['first_name'] ?? '';
        const ln = kvMap['last_name'] ?? '';
        crmInput.fullName = `${fn} ${ln}`.trim() || `Meta Lead ${leadgenId.slice(-6)}`;
      }

      // 8. Determine owner via routing
      const ownerUserId = await this.routingService.resolveOwner(
        this.prisma,
        orgId,
        source.routingStrategy,
        source.defaultOwnerUserId,
      );

      // 9. Source meta
      const sourceMetaJson = {
        pageId: source.pageId,
        formId: source.formId,
        adId: leadData.ad_id ?? null,
        adName: leadData.ad_name ?? null,
        campaignId: leadData.campaign_id ?? null,
        campaignName: leadData.campaign_name ?? null,
        createdTime: leadData.created_time ?? null,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      };

      // 10. Upsert Lead (transaction)
      let leadId: string;
      let isNewLead = false;

      await withOrg(this.prisma, orgId, async (tx) => {
        // Check existing
        const existing = await tx.lead.findFirst({
          where: {
            externalProvider: 'META',
            externalLeadId: leadgenId,
          },
        });

        if (existing) {
          // Merge: update missing phone/email + sourceMetaJson
          const updateData: Record<string, unknown> = {};
          if (!existing.phone && crmInput.phone) updateData.phone = crmInput.phone;
          if (!existing.email && crmInput.email) updateData.email = crmInput.email;

          // Merge sourceMetaJson
          const existingMeta = (existing.sourceMetaJson as any) ?? {};
          updateData.sourceMetaJson = { ...existingMeta, ...sourceMetaJson } as Prisma.InputJsonValue;

          if (Object.keys(updateData).length > 0) {
            await tx.lead.update({ where: { id: existing.id }, data: updateData });
          }
          leadId = existing.id;
        } else {
          const newLead = await tx.lead.create({
            data: {
              organizationId: orgId,
              fullName: crmInput.fullName as string,
              phone: (crmInput.phone as string) ?? null,
              email: (crmInput.email as string) ?? null,
              type: 'BUYER',
              status: 'TO_CONTACT',
              priority: 'MEDIUM',
              ownerUserId: ownerUserId ?? null,
              sourceType: 'META_LEAD_ADS',
              externalProvider: 'META',
              externalLeadId: leadgenId,
              sourceMetaJson: sourceMetaJson as Prisma.InputJsonValue,
              wilaya: (crmInput.wilaya as string) ?? null,
              commune: (crmInput.commune as string) ?? null,
              quartier: (crmInput.quartier as string) ?? null,
              budgetMin: crmInput.budgetMin as number | undefined ?? null,
              budgetMax: crmInput.budgetMax as number | undefined ?? null,
              propertyType: (crmInput.propertyType as string) ?? null,
              surfaceMin: crmInput.surfaceMin as number | undefined ?? null,
              notes: (crmInput.notes as string) ?? null,
            },
          });
          leadId = newLead.id;
          isNewLead = true;
        }

        // 11. Create LeadActivity
        await this.activitiesService.createSystemEvent(
          tx, orgId, leadId!, null,
          'META_LEAD_RECEIVED',
          {},
          {
            pageId: source.pageId,
            formId: source.formId,
            campaignId: leadData.campaign_id ?? null,
            adId: leadData.ad_id ?? null,
          },
          `Lead Meta reçu — ${source.formName || source.formId}`,
        );

        // 12. Create Task (only for new leads)
        if (isNewLead) {
          const assignee = ownerUserId ?? await this.getFirstManager(orgId);
          const dueAt = new Date(Date.now() + DEFAULT_LEAD_RESPONSE_SLA_MINUTES * 60 * 1000);

          await tx.task.create({
            data: {
              organizationId: orgId,
              leadId: leadId!,
              title: 'Rappeler ce lead',
              status: 'OPEN',
              priority: 'HIGH',
              dueAt,
              assigneeUserId: assignee ?? null,
            },
          });

          // 13. Notification
          const recipients: string[] = [];
          if (assignee) recipients.push(assignee);

          // Also notify managers
          const managers = await this.prisma.orgMembership.findMany({
            where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
            select: { userId: true },
          });
          for (const m of managers) {
            if (!recipients.includes(m.userId)) recipients.push(m.userId);
          }

          if (recipients.length > 0) {
            await this.notificationService.notifyUsers({
              organizationId: orgId,
              userIds: recipients,
              templateKey: 'lead.new',
              meta: { leadId: leadId!, leadName: crmInput.fullName as string, source: 'META_LEAD_ADS' },
              dedupe: { key: `lead.meta:new:${leadId}`, windowSeconds: 600 },
            });
          }
        }
      });

      return {
        success: true,
        resultMeta: { leadId: leadId!, isNewLead },
      };
    } catch (err: any) {
      this.logger.error(`MetaLeadgen processor error: ${err.message}`, err.stack);
      return {
        success: false,
        errorCode: 'META_LEAD_FETCH_FAILED',
        errorMsg: err.message,
        retriable: true,
      };
    }
  }

  private async getFirstManager(orgId: string): Promise<string | null> {
    const m = await this.prisma.orgMembership.findFirst({
      where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return m?.userId ?? null;
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  // Algerian format normalization
  if (cleaned.startsWith('00213')) {
    cleaned = '+213' + cleaned.slice(5);
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+213' + cleaned.slice(1);
  } else if (!cleaned.startsWith('+') && cleaned.length >= 9) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}
