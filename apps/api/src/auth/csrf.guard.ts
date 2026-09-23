import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method)) return true;

    const expectedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    if (request.headers.origin !== expectedOrigin) {
      throw new ForbiddenException("Invalid request origin");
    }
    return true;
  }
}
