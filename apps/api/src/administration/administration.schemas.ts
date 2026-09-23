import { z } from "zod";

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED"]),
});

export const assignUserRoleSchema = z.object({
  roleId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).max(100),
});

export const updateFeatureSchema = z.object({
  isEnabled: z.boolean(),
});
