export const permissions = [
  "documents.view",
  "documents.create",
  "documents.fields.edit",
  "documents.advance",
  "documents.return",
  "documents.reroute",
  "users.manage",
  "registrations.manage",
  "roles.manage",
  "features.manage",
  "workflows.design",
  "workflows.publish",
  "audit.view",
  "audit.export",
  "users.impersonate",
  "users.password.reset",
  "settings.manage",
] as const;

export type Permission = (typeof permissions)[number];

export const systemRoleKeys = [
  "admin",
  "sao",
  "procurement_staff",
  "budget_staff",
  "supply_staff",
  "pre_audit_staff",
  "accounting_staff",
  "cashier_staff",
] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];
