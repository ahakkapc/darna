import { Logger } from '@nestjs/common';

const logger = new Logger('MetaGraphClient');

export interface MetaLeadData {
  created_time: string;
  id: string;
  field_data: Array<{ name: string; values: string[] }>;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
}

export interface MetaLeadsListResponse {
  data: Array<{ id: string; created_time: string }>;
  paging?: { cursors?: { after?: string }; next?: string };
}

export class MetaGraphClient {
  constructor(
    private readonly accessToken: string,
    private readonly graphBaseUrl: string = 'https://graph.facebook.com',
    private readonly apiVersion: string = 'v20.0',
  ) {}

  async fetchLead(leadgenId: string, fields?: string): Promise<MetaLeadData> {
    const f = fields || 'created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id';
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${leadgenId}?fields=${f}&access_token=${this.accessToken}`;

    const res = await fetch(url);
    const body = await res.json() as any;

    if (!res.ok) {
      const code = body?.error?.code;
      const subcode = body?.error?.error_subcode;
      const msg = body?.error?.message ?? 'Unknown Meta API error';

      if (code === 190 || subcode === 463 || subcode === 467) {
        throw Object.assign(new Error(msg), { metaErrorType: 'META_TOKEN_EXPIRED' });
      }
      if (code === 4 || code === 17 || code === 32) {
        throw Object.assign(new Error(msg), { metaErrorType: 'META_RATE_LIMIT' });
      }
      if (code === 10 || code === 200 || code === 294) {
        throw Object.assign(new Error(msg), { metaErrorType: 'META_PERMISSION_MISSING' });
      }
      throw Object.assign(new Error(msg), { metaErrorType: 'META_LEAD_FETCH_FAILED' });
    }

    return body as MetaLeadData;
  }

  async fetchFormLeads(formId: string, sinceUnix: number): Promise<Array<{ id: string; created_time: string }>> {
    const allLeads: Array<{ id: string; created_time: string }> = [];
    let url: string | null =
      `${this.graphBaseUrl}/${this.apiVersion}/${formId}/leads?fields=created_time&since=${sinceUnix}&limit=100&access_token=${this.accessToken}`;

    while (url) {
      const res = await fetch(url);
      const body = await res.json() as any;

      if (!res.ok) {
        const code = body?.error?.code;
        const msg = body?.error?.message ?? 'Unknown Meta API error';
        if (code === 190) {
          throw Object.assign(new Error(msg), { metaErrorType: 'META_TOKEN_EXPIRED' });
        }
        if (code === 4 || code === 17) {
          throw Object.assign(new Error(msg), { metaErrorType: 'META_RATE_LIMIT' });
        }
        throw Object.assign(new Error(msg), { metaErrorType: 'META_LEAD_FETCH_FAILED' });
      }

      const data = (body as MetaLeadsListResponse).data ?? [];
      allLeads.push(...data);

      url = (body as MetaLeadsListResponse).paging?.next ?? null;
    }

    logger.log(`Fetched ${allLeads.length} leads from form ${formId} since ${sinceUnix}`);
    return allLeads;
  }
}
