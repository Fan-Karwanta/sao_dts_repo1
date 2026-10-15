import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method)) return true;

    // WEB_ORIGIN may hold several comma-separated origins so users can reach
    // the same deployment by hostname or IP (e.g. http://sao-server, http://10.0.0.5).
    const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim());
    if (!allowedOrigins.includes(request.headers.origin ?? "")) {
      throw new ForbiddenException("Invalid request origin");
    }
    return true;
  }
}
