import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error';

export const PLATFORM_ROLES_KEY = 'platformRoles';

export function PlatformRoles(...roles: string[]) {
  return (target: any, key?: string, descriptor?: any) => {
    const metadataTarget = descriptor ? descriptor.value : target;
    Reflect.defineMetadata(PLATFORM_ROLES_KEY, roles, metadataTarget);
    return descriptor ?? target;
  };
}

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const platformRole: string | undefined = req.user?.platformRole;

    if (!platformRole || !requiredRoles.includes(platformRole)) {
      throw new AppError('ADMIN_ROLE_REQUIRED', 403, 'Platform admin role required');
    }

    return true;
  }
}
