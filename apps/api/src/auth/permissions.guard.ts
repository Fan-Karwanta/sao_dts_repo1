import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../common/authenticated-request.js";
import { PERMISSIONS_KEY } from "../common/request.decorators.js";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = new Set(request.auth.user.permissionKeys);
    if (!required.every((permission) => granted.has(permission))) {
      throw new ForbiddenException("You do not have permission for this action");
    }
    return true;
  }
}
