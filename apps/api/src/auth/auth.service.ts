import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@sao/db";
import { argon2id, hash, verify } from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext, AuthUser } from "../common/auth-context.js";
import { DatabaseService } from "../database/database.service.js";
import {
  IMPERSONATION_DURATION_MS,
  SESSION_DURATION_MS,
} from "./auth.constants.js";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from "./auth.schemas.js";

const authUserInclude = {
  credential: true,
  userRoles: {
    include: {
      department: true,
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type LoadedUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashPassword(password: string) {
    return hash(password, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  private toAuthUser(user: LoadedUser): AuthUser {
    return {
      id: user.id,
      publicId: user.publicId,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      status: user.status,
      mustChangePassword: user.credential?.mustChangePassword ?? false,
      roleKeys: [...new Set(user.userRoles.map(({ role }) => role.key))],
      permissionKeys: [
        ...new Set(
          user.userRoles.flatMap(({ role }) =>
            role.rolePermissions.map(({ permission }) => permission.key),
          ),
        ),
      ],
      departmentKeys: [
        ...new Set(
          user.userRoles.flatMap(({ department }) =>
            department ? [department.key] : [],
          ),
        ),
      ],
    };
  }

  private async loadUser(id: string) {
    const user = await this.database.user.findUnique({
      where: { id },
      include: authUserInclude,
    });
    if (!user) throw new UnauthorizedException("Invalid session");
    return user;
  }

  async register(input: RegisterInput) {
    const username = input.username.toLowerCase();
    const email = input.email.toLowerCase();
    const [existingUser, existingRequest, role] = await Promise.all([
      this.database.user.findFirst({ where: { OR: [{ username }, { email }] } }),
      this.database.registrationRequest.findFirst({
        where: { OR: [{ username }, { email }], status: "PENDING" },
      }),
      this.database.role.findUnique({ where: { key: input.requestedRoleKey } }),
    ]);
    if (existingUser || existingRequest) {
      throw new ConflictException("Username or email is already registered");
    }
    if (!role || role.key === "admin") {
      throw new ForbiddenException("The requested role is unavailable");
    }

    const request = await this.database.registrationRequest.create({
      data: {
        fullName: input.fullName,
        username,
        email,
        officeDesignation: input.officeDesignation ?? null,
        passwordHash: await this.hashPassword(input.password),
        requestedRoleId: role.id,
        termsVersion: input.termsVersion,
        termsAcceptedAt: new Date(),
      },
      select: { id: true, status: true, createdAt: true },
    });
    await this.audit.record(null, {
      action: "registration.requested",
      targetType: "RegistrationRequest",
      targetId: request.id,
    });
    return request;
  }

  private async rejectRegistrationLogin(
    identifier: string,
    password: string,
  ): Promise<never> {
    const request = await this.database.registrationRequest.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (request && (await verify(request.passwordHash, password))) {
      if (request.status === "PENDING") {
        throw new UnauthorizedException({
          code: "ACCOUNT_PENDING",
          message:
            "Your account request is still pending approval. Please contact the SAO administrator.",
        });
      }
      if (request.status === "REJECTED") {
        throw new UnauthorizedException({
          code: "ACCOUNT_REJECTED",
          message:
            "Your account request was rejected. Please contact the SAO administrator for details.",
        });
      }
      throw new UnauthorizedException({
        code: "ACCOUNT_PENDING",
        message:
          "Your account request was approved but the account is not available yet. Please contact the SAO administrator.",
      });
    }
    throw new UnauthorizedException("Invalid credentials");
  }

  private inactiveAccountError(status: LoadedUser["status"]) {
    switch (status) {
      case "PENDING":
        return new UnauthorizedException({
          code: "ACCOUNT_PENDING",
          message:
            "Your account is still pending approval. Please contact the SAO administrator.",
        });
      case "REJECTED":
        return new UnauthorizedException({
          code: "ACCOUNT_REJECTED",
          message:
            "Your account registration was rejected. Please contact the SAO administrator for details.",
        });
      case "BLOCKED":
        return new UnauthorizedException({
          code: "ACCOUNT_BLOCKED",
          message:
            "Your account has been blocked. Please contact the SAO administrator.",
        });
      default:
        return new UnauthorizedException("Account is not active");
    }
  }

  async login(input: LoginInput) {
    const identifier = input.identifier.toLowerCase();
    const user = await this.database.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      include: authUserInclude,
    });
    if (!user) {
      await this.rejectRegistrationLogin(identifier, input.password);
    }
    if (!user?.credential) throw new UnauthorizedException("Invalid credentials");
    if (user.credential.lockedUntil && user.credential.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is temporarily locked");
    }

    const valid = await verify(user.credential.passwordHash, input.password);
    if (!valid) {
      const failedLoginCount = user.credential.failedLoginCount + 1;
      await this.database.credential.update({
        where: { userId: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status !== "ACTIVE") {
      throw this.inactiveAccountError(user.status);
    }

    const token = randomBytes(32).toString("base64url");
    const session = await this.database.$transaction(async (transaction) => {
      await transaction.credential.update({
        where: { userId: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      return transaction.session.create({
        data: {
          tokenHash: this.hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        },
      });
    });
    const authUser = this.toAuthUser(user);
    await this.audit.record(
      { sessionId: session.id, actor: authUser, user: authUser, impersonationId: null },
      { action: "auth.login", targetType: "User", targetId: user.id },
    );
    return { token, user: authUser, expiresAt: session.expiresAt };
  }

  async resolveSession(token: string, impersonationId?: string): Promise<AuthContext> {
    const session = await this.database.session.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      include: { user: { include: authUserInclude } },
    });
    if (!session || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const actor = this.toAuthUser(session.user);
    let user = actor;
    let activeImpersonationId: string | null = null;
    if (impersonationId) {
      const impersonation = await this.database.impersonationSession.findFirst({
        where: {
          id: impersonationId,
          adminId: actor.id,
          expiresAt: { gt: new Date() },
          endedAt: null,
        },
      });
      if (impersonation) {
        const target = await this.loadUser(impersonation.userId);
        if (target.status === "ACTIVE") {
          user = this.toAuthUser(target);
          activeImpersonationId = impersonation.id;
        }
      }
    }

    await this.database.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return { sessionId: session.id, actor, user, impersonationId: activeImpersonationId };
  }

  async logout(context: AuthContext) {
    await this.database.session.update({
      where: { id: context.sessionId },
      data: { revokedAt: new Date() },
    });
    if (context.impersonationId) {
      await this.database.impersonationSession.update({
        where: { id: context.impersonationId },
        data: { endedAt: new Date() },
      });
    }
    await this.audit.record(context, {
      action: "auth.logout",
      targetType: "User",
      targetId: context.user.id,
    });
  }

  async changePassword(context: AuthContext, input: ChangePasswordInput) {
    if (context.impersonationId) {
      throw new ForbiddenException("Exit impersonation before changing a password");
    }
    const credential = await this.database.credential.findUnique({
      where: { userId: context.user.id },
    });
    if (!credential || !(await verify(credential.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.database.$transaction([
      this.database.credential.update({
        where: { userId: context.user.id },
        data: {
          passwordHash: await this.hashPassword(input.password),
          passwordChangedAt: new Date(),
          mustChangePassword: false,
        },
      }),
      this.database.session.updateMany({
        where: { userId: context.user.id, id: { not: context.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record(context, {
      action: "auth.password.changed",
      targetType: "User",
      targetId: context.user.id,
    });
    return { success: true };
  }

  listRegistrationRoles() {
    return this.database.role.findMany({
      where: { key: { not: "admin" } },
      select: { key: true, name: true, description: true },
      orderBy: { name: "asc" },
    });
  }

  listRegistrationRequests() {
    return this.database.registrationRequest.findMany({
      where: { status: "PENDING" },
      include: { requestedRole: { select: { key: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async approveRegistration(context: AuthContext, id: string, reason?: string) {
    const registration = await this.database.registrationRequest.findUnique({
      where: { id },
      include: { requestedRole: true },
    });
    if (!registration || registration.status !== "PENDING") {
      throw new NotFoundException("Pending registration request not found");
    }
    const departmentKey = registration.requestedRole?.key.replace(/_staff$/, "");
    const department = departmentKey
      ? await this.database.department.findUnique({ where: { key: departmentKey } })
      : null;
    const user = await this.database.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          fullName: registration.fullName,
          username: registration.username,
          email: registration.email,
          officeDesignation: registration.officeDesignation,
          status: "ACTIVE",
          credential: { create: { passwordHash: registration.passwordHash } },
          ...(registration.requestedRoleId
            ? {
                userRoles: {
                  create: {
                    roleId: registration.requestedRoleId,
                    departmentId: department?.id ?? null,
                  },
                },
              }
            : {}),
        },
      });
      await transaction.registrationRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: context.actor.id,
          reviewedAt: new Date(),
          reviewReason: reason ?? null,
        },
      });
      return created;
    });
    await this.audit.record(context, {
      action: "registration.approved",
      targetType: "User",
      targetId: user.id,
      after: { registrationId: id },
    });
    return { id: user.publicId, status: user.status };
  }

  async rejectRegistration(context: AuthContext, id: string, reason?: string) {
    const result = await this.database.registrationRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: context.actor.id,
        reviewedAt: new Date(),
        reviewReason: reason ?? null,
      },
    });
    if (!result.count) throw new NotFoundException("Pending registration request not found");
    await this.audit.record(context, {
      action: "registration.rejected",
      targetType: "RegistrationRequest",
      targetId: id,
      after: { reason: reason ?? null },
    });
    return { success: true };
  }

  async startImpersonation(context: AuthContext, userId: string, reason: string) {
    if (context.impersonationId) throw new ForbiddenException("Already impersonating a user");
    const target = await this.loadUser(userId);
    if (target.status !== "ACTIVE" || target.userRoles.some(({ role }) => role.key === "admin")) {
      throw new ForbiddenException("This user cannot be impersonated");
    }
    const impersonation = await this.database.impersonationSession.create({
      data: {
        adminId: context.actor.id,
        userId: target.id,
        reason,
        expiresAt: new Date(Date.now() + IMPERSONATION_DURATION_MS),
      },
    });
    await this.audit.record(context, {
      action: "impersonation.started",
      targetType: "User",
      targetId: target.id,
      after: { impersonationId: impersonation.id, reason },
    });
    return { id: impersonation.id, expiresAt: impersonation.expiresAt };
  }

  async stopImpersonation(context: AuthContext) {
    if (context.impersonationId) {
      await this.database.impersonationSession.update({
        where: { id: context.impersonationId },
        data: { endedAt: new Date() },
      });
      await this.audit.record(context, {
        action: "impersonation.ended",
        targetType: "User",
        targetId: context.user.id,
      });
    }
    return { success: true };
  }

  async adminResetPassword(context: AuthContext, userId: string) {
    if (context.impersonationId) {
      throw new ForbiddenException("Exit impersonation before resetting passwords");
    }
    const temporaryPassword = `Aa1!${randomBytes(15).toString("base64url")}`;
    const result = await this.database.$transaction(async (transaction) => {
      const credential = await transaction.credential.update({
        where: { userId },
        data: {
          passwordHash: await this.hashPassword(temporaryPassword),
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
      });
      await transaction.session.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
      return credential;
    });
    await this.audit.record(context, {
      action: "auth.password.admin_reset",
      targetType: "User",
      targetId: result.userId,
    });
    return { temporaryPassword };
  }
}
