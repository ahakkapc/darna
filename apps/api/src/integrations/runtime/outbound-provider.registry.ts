import { Injectable, Logger } from '@nestjs/common';

export interface OutboundProviderResult {
  success: boolean;
  providerMessageId?: string;
  resultMeta?: Record<string, unknown>;
  errorCode?: string;
  errorMsg?: string;
  retriable?: boolean;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

export interface OutboundProvider {
  send(ctx: { orgId: string; integrationId?: string }, job: any): Promise<OutboundProviderResult>;
}

@Injectable()
export class OutboundProviderRegistry {
  private readonly logger = new Logger('OutboundProviderRegistry');
  private readonly providers = new Map<string, OutboundProvider>();

  register(jobType: string, provider: OutboundProvider): void {
    this.providers.set(jobType, provider);
    this.logger.log(`Registered outbound provider for ${jobType}`);
  }

  get(jobType: string): OutboundProvider | undefined {
    return this.providers.get(jobType);
  }

  has(jobType: string): boolean {
    return this.providers.has(jobType);
  }
}
