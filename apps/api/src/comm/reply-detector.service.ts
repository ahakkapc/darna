import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';

@Injectable()
export class ReplyDetectorService {
  constructor(private readonly prisma: PrismaService) {}

  async hasInboundReplySince(
    organizationId: string,
    leadId: string,
    since: Date,
    channels: string[],
  ): Promise<boolean> {
    const event: any = await withOrg(this.prisma, organizationId, (tx) =>
      (tx as any).commEvent.findFirst({
        where: {
          leadId,
          direction: 'INBOUND',
          occurredAt: { gt: since },
          channel: { in: channels },
        },
        select: { id: true },
      }),
    );
    return !!event;
  }
}
