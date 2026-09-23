import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../common/request.decorators.js";
import { AuthService } from "./auth.service.js";
import { IMPERSONATION_COOKIE, SESSION_COOKIE } from "./auth.constants.js";
import type { AuthenticatedRequest } from "../common/authenticated-request.js";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    const impersonationId = request.cookies?.[IMPERSONATION_COOKIE] as
      | string
      | undefined;
    if (!token) throw new UnauthorizedException("Authentication required");

    const auth = await this.authService.resolveSession(token, impersonationId);
    (request as AuthenticatedRequest).auth = auth;
    return true;
  }
}
