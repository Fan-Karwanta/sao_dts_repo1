import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "../common/auth-context.js";
import { CurrentAuth, RequirePermissions } from "../common/request.decorators.js";
import { parseBody } from "../common/validation.js";
import {
  assignUserRoleSchema,
  updateFeatureSchema,
  updateRolePermissionsSchema,
  updateUserStatusSchema,
} from "./administration.schemas.js";
import { AdministrationService } from "./administration.service.js";

@Controller()
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}

  @Get("departments")
  listDepartments() {
    return this.administration.listDepartments();
  }

  @Get("roles")
  @RequirePermissions("roles.manage")
  listRoles() {
    return this.administration.listRoles();
  }

  @Get("permissions")
  @RequirePermissions("roles.manage")
  listPermissions() {
    return this.administration.listPermissions();
  }

  @Get("users")
  @RequirePermissions("users.manage")
  listUsers() {
    return this.administration.listUsers();
  }

  @Patch("users/:id/status")
  @RequirePermissions("users.manage")
  updateUserStatus(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateUserStatusSchema, body);
    return this.administration.updateUserStatus(context, id, input.status);
  }

  @Post("users/:id/roles")
  @RequirePermissions("users.manage")
  assignRole(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(assignUserRoleSchema, body);
    return this.administration.assignUserRole(
      context,
      id,
      input.roleId,
      input.departmentId,
    );
  }

  @Delete("users/:userId/roles/:roleId")
  @RequirePermissions("users.manage")
  removeRole(
    @CurrentAuth() context: AuthContext,
    @Param("userId") userId: string,
    @Param("roleId") roleId: string,
  ) {
    return this.administration.removeUserRole(context, userId, roleId);
  }

  @Patch("roles/:id/permissions")
  @RequirePermissions("roles.manage")
  updateRolePermissions(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateRolePermissionsSchema, body);
    return this.administration.updateRolePermissions(
      context,
      id,
      input.permissionIds,
    );
  }

  @Get("features/enabled")
  listEnabledFeatures() {
    return this.administration.listEnabledFeatures();
  }

  @Get("features")
  @RequirePermissions("features.manage")
  listFeatures() {
    return this.administration.listFeatures();
  }

  @Patch("features/:id")
  @RequirePermissions("features.manage")
  updateFeature(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateFeatureSchema, body);
    return this.administration.updateFeature(context, id, input.isEnabled);
  }

  @Get("audit-events")
  @RequirePermissions("audit.view")
  listAuditEvents(@Query("take") take?: string) {
    return this.administration.listAuditEvents(Number(take ?? 100));
  }
}
