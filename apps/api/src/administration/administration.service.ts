import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../common/auth-context.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AdministrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  listUsers() {
    return this.database.user.findMany({
      select: {
        id: true,
        publicId: true,
        fullName: true,
        username: true,
        email: true,
        officeDesignation: true,
        status: true,
        createdAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, key: true, name: true } },
            department: { select: { id: true, key: true, name: true } },
          },
        },
      },
      orderBy: { fullName: "asc" },
    });
  }

  listDepartments() {
    return this.database.department.findMany({ orderBy: { name: "asc" } });
  }

  listRoles() {
    return this.database.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  listPermissions() {
    return this.database.permission.findMany({ orderBy: { key: "asc" } });
  }

  listFeatures() {
    return this.database.pageFeature.findMany({ orderBy: { name: "asc" } });
  }

  listEnabledFeatures() {
    return this.database.pageFeature.findMany({
      where: { isEnabled: true },
      select: { key: true },
      orderBy: { key: "asc" },
    });
  }

  listAuditEvents(take = 100) {
    return this.database.auditEvent.findMany({
      take: Math.min(Math.max(take, 1), 500),
      include: {
        actor: { select: { publicId: true, fullName: true, username: true } },
        effectiveActor: {
          select: { publicId: true, fullName: true, username: true },
        },
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  async updateUserStatus(
    context: AuthContext,
    userId: string,
    status: "ACTIVE" | "BLOCKED",
  ) {
    if (userId === context.actor.id && status === "BLOCKED") {
      throw new ForbiddenException("You cannot block your own account");
    }
    const previous = await this.database.user.findUnique({ where: { id: userId } });
    if (!previous) throw new NotFoundException("User not found");
    const user = await this.database.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { status },
      });
      if (status === "BLOCKED") {
        await transaction.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    await this.audit.record(context, {
      action: "user.status.updated",
      targetType: "User",
      targetId: userId,
      before: { status: previous.status },
      after: { status: user.status },
    });
    return { id: user.publicId, status: user.status };
  }

  async assignUserRole(
    context: AuthContext,
    userId: string,
    roleId: string,
    departmentId?: string | null,
  ) {
    const [user, role] = await Promise.all([
      this.database.user.findUnique({ where: { id: userId } }),
      this.database.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!user || !role) throw new NotFoundException("User or role not found");
    await this.database.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, departmentId: departmentId ?? null },
      update: { departmentId: departmentId ?? null },
    });
    await this.audit.record(context, {
      action: "user.role.assigned",
      targetType: "User",
      targetId: userId,
      after: { roleId, departmentId: departmentId ?? null },
    });
    return { success: true };
  }

  async removeUserRole(context: AuthContext, userId: string, roleId: string) {
    await this.database.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    await this.audit.record(context, {
      action: "user.role.removed",
      targetType: "User",
      targetId: userId,
      before: { roleId },
    });
    return { success: true };
  }

  async updateRolePermissions(
    context: AuthContext,
    roleId: string,
    permissionIds: string[],
  ) {
    const role = await this.database.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.key === "admin") {
      throw new ForbiddenException("The administrator role is protected");
    }
    await this.database.$transaction(async (transaction) => {
      await transaction.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) {
        await transaction.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });
    await this.audit.record(context, {
      action: "role.permissions.updated",
      targetType: "Role",
      targetId: roleId,
      after: { permissionIds },
    });
    return { success: true };
  }

  async updateFeature(context: AuthContext, featureId: string, isEnabled: boolean) {
    const feature = await this.database.pageFeature.update({
      where: { id: featureId },
      data: { isEnabled },
    });
    await this.audit.record(context, {
      action: "feature.updated",
      targetType: "PageFeature",
      targetId: featureId,
      after: { isEnabled },
    });
    return feature;
  }
}
