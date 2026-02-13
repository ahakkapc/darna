import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ORG_ROLES_KEY } from './org-roles.decorator';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(
      ORG_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    const orgId: string | undefined = req.orgId;

    if (!userId || !orgId) {
      throw new ForbiddenException({
        error: { code: 'ORG_FORBIDDEN', message: 'Access denied' },
      });
    }

    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException({
        error: { code: 'ORG_FORBIDDEN', message: 'Insufficient role' },
      });
    }

    (req as any).orgRole = membership.role;
    return true;
  }
}
