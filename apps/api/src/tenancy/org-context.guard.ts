import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const orgId = req.headers['x-org-id'];

    if (!orgId || typeof orgId !== 'string') {
      throw new BadRequestException({
        error: {
          code: 'ORG_CONTEXT_REQUIRED',
          message: 'Header x-org-id is required',
        },
      });
    }

    if (!UUID_REGEX.test(orgId)) {
      throw new BadRequestException({
        error: {
          code: 'ORG_CONTEXT_INVALID',
          message: 'Header x-org-id must be a valid UUID',
        },
      });
    }

    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException({
        error: {
          code: 'ORG_NOT_FOUND',
          message: `Org ${orgId} not found`,
        },
      });
    }

    // Auth-aware: if user is authenticated, verify membership
    const userId: string | undefined = (req as any).user?.userId;
    if (userId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });
      if (!membership) {
        throw new ForbiddenException({
          error: {
            code: 'ORG_FORBIDDEN',
            message: 'You are not a member of this organization',
          },
        });
      }
    }

    (req as any).orgId = orgId;
    return true;
  }
}
