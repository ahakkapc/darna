import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withOrg } from '../../tenancy/with-org';

@Injectable()
export class LeadRoutingService {
  private readonly logger = new Logger('LeadRoutingService');

  async resolveOwner(
    prisma: PrismaService,
    orgId: string,
    strategy: string,
    defaultOwnerUserId: string | null,
  ): Promise<string | null> {
    switch (strategy) {
      case 'MANAGER_ASSIGN':
        return this.resolveManagerAssign(prisma, orgId, defaultOwnerUserId);
      case 'ROUND_ROBIN':
        return this.resolveRoundRobin(prisma, orgId);
      case 'NONE':
      default:
        return null;
    }
  }

  private async resolveManagerAssign(
    prisma: PrismaService,
    orgId: string,
    defaultOwnerUserId: string | null,
  ): Promise<string | null> {
    if (defaultOwnerUserId) {
      const membership = await prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: defaultOwnerUserId, orgId } },
      });
      if (membership) return defaultOwnerUserId;
    }

    // Fallback: first manager
    const manager = await prisma.orgMembership.findFirst({
      where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return manager?.userId ?? null;
  }

  private async resolveRoundRobin(
    prisma: PrismaService,
    orgId: string,
  ): Promise<string | null> {
    // List active agent/collab members (stable order)
    const members = await prisma.orgMembership.findMany({
      where: { orgId, role: { in: ['OWNER', 'MANAGER', 'AGENT'] } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (members.length === 0) return null;

    // Get current cursor
    const state: any = await withOrg(prisma, orgId, (tx) =>
      (tx as any).orgRoutingState.findUnique({
        where: { organizationId: orgId },
      }),
    );

    const cursorUserId = state?.rrCursorUserId ?? null;
    const userIds = members.map((m) => m.userId);

    // Find the next user after cursor
    let nextIndex = 0;
    if (cursorUserId) {
      const cursorIndex = userIds.indexOf(cursorUserId);
      if (cursorIndex >= 0) {
        nextIndex = (cursorIndex + 1) % userIds.length;
      }
    }

    const selectedUserId = userIds[nextIndex];

    // Update cursor
    await withOrg(prisma, orgId, (tx) =>
      (tx as any).orgRoutingState.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          rrCursorUserId: selectedUserId,
        },
        update: {
          rrCursorUserId: selectedUserId,
        },
      }),
    );

    return selectedUserId;
  }
}
