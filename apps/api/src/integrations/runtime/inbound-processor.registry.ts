import { Injectable, Logger } from '@nestjs/common';

export interface InboundProcessResult {
  success: boolean;
  resultMeta?: Record<string, unknown>;
  errorCode?: string;
  errorMsg?: string;
  retriable?: boolean;
}

export interface InboundProcessor {
  process(ctx: { orgId: string; integrationId?: string }, event: any): Promise<InboundProcessResult>;
}

@Injectable()
export class InboundProcessorRegistry {
  private readonly logger = new Logger('InboundProcessorRegistry');
  private readonly processors = new Map<string, InboundProcessor>();

  register(sourceType: string, processor: InboundProcessor): void {
    this.processors.set(sourceType, processor);
    this.logger.log(`Registered inbound processor for ${sourceType}`);
  }

  get(sourceType: string): InboundProcessor | undefined {
    return this.processors.get(sourceType);
  }

  has(sourceType: string): boolean {
    return this.processors.has(sourceType);
  }
}
