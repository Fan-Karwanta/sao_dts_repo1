import { Injectable } from "@nestjs/common";
import { Prisma } from "@sao/db";
import { DatabaseService } from "../database/database.service.js";
import type { AuthContext } from "../common/auth-context.js";

interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string;
  before?: object;
  after?: object;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  record(context: AuthContext | null, input: AuditInput) {
    return this.database.auditEvent.create({
      data: {
        actorId: context?.actor.id ?? null,
        effectiveActorId: context?.user.id ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        before: input.before
          ? (input.before as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        after: input.after ? (input.after as Prisma.InputJsonValue) : Prisma.JsonNull,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
