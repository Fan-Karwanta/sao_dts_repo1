import { PrismaClient, type WorkflowNode } from "@prisma/client";
import { argon2id, hash } from "argon2";

const database = new PrismaClient();

const departments = [
  ["procurement", "Procurement"],
  ["budget", "Budget"],
  ["accounting", "Accounting"],
  ["supply", "Supply"],
  ["pre_audit", "Pre-Audit"],
  ["cashier", "Cashier"],
] as const;

const permissionKeys = [
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

const roles = [
  ["admin", "Administrator", null],
  ["sao", "SAO", null],
  ["procurement_staff", "Procurement Staff", "procurement"],
  ["budget_staff", "Budget Staff", "budget"],
  ["supply_staff", "Supply Staff", "supply"],
  ["pre_audit_staff", "Pre-Audit Staff", "pre_audit"],
  ["accounting_staff", "Accounting Staff", "accounting"],
  ["cashier_staff", "Cashier Staff", "cashier"],
] as const;

const staffPermissions = [
  "documents.view",
  "documents.fields.edit",
  "documents.advance",
  "documents.return",
] as const;

const workflowSteps = [
  [1, "PROJECT TITLE", "procurement", "TEXT", {}],
  [2, "PR NO.", "procurement", "TEXT", {}],
  [3, "ABC", "procurement", "DECIMAL", { currency: "PHP" }],
  [4, "SUPPLIER", "procurement", "TEXT", {}],
  [5, "CONTRACT AMOUNT", "procurement", "DECIMAL", { currency: "PHP" }],
  [6, "NOA DATE RECEIVED BY SUPPLIER", "procurement", "DATE", {}],
  [7, "P.O NO.", "procurement", "TEXT", {}],
  [8, "P.O WITH NTP FORWARDED TO BUDGET", "procurement", "DATE", {}],
  [9, "ORS. NO. (GAA) & BURS NO. (INCOME)", "budget", "JSON", { subfields: ["orsNumber", "bursNumber"] }],
  [10, "DATE OBLIGATED", "budget", "DATE", {}],
  [11, "DATE FORWARDED TO ACCOUNTING", "budget", "DATE", {}],
  [12, "P.O WITH NTP RECEIVED FROM BUDGET", "accounting", "DATE", {}],
  [13, "P.O WITH NTP FORWARDED TO MCC OFFICE", "accounting", "DATE", {}],
  [14, "P.O WITH NTP RECEIVED FROM MCC OFFICE", "procurement", "DATE", {}],
  [15, "P.O DATE", "procurement", "DATE", {}],
  [16, "NTP RECEIVED BY SUPPLIER", "procurement", "DATE", {}],
  [17, "CONTRACT DURATION", "procurement", "INTEGER", { unit: "days" }],
  [18, "PROCUREMENT DOCUMENTS FORWARDED TO MMS", "procurement", "DATE", {}],
  [19, "DELIVERY DATE", "supply", "DATE", {}],
  [20, "DATE OF INSPECTION", "supply", "DATE", {}],
  [21, "NO. OF DAYS EXTENDED", "supply", "INTEGER", {}],
  [22, "NO. OF DAYS DELAYED", "supply", "INTEGER", {}],
  [23, "SI NO.", "supply", "TEXT", {}],
  [24, "LD AMOUNT", "supply", "DECIMAL", { currency: "PHP" }],
  [25, "DATE FORWARDED TO PRE-AUDIT", "supply", "DATE", {}],
  [26, "DATE RECEIVED PROCUREMENT DOCUMENTS", "pre_audit", "DATE", {}],
  [27, "DATE FORWARDED PROCUREMENT DOCUMENTS & REMARKS", "pre_audit", "JSON", { subfields: ["dateForwarded", "remarks"] }],
  [28, "PROCUREMENT DOCS FOR PAYMENT RECEIVED FROM PRE-AUDIT", "accounting", "DATE", {}],
  [29, "GROSS AMOUNT", "accounting", "DECIMAL", { currency: "PHP" }],
  [30, "DEDUCTIONS (TAX, LD, RECOUPMENT, RETENTION)", "accounting", "JSON", { subfields: ["tax", "liquidatedDamages", "recoupment", "retention", "total"] }],
  [31, "NET AMOUNT", "accounting", "DECIMAL", { currency: "PHP" }],
  [32, "MODE OF PAYMENT", "accounting", "ENUM", { options: ["Letter", "LDAP", "eMDS", "Check"] }],
  [33, "DATE PAID", "accounting", "DATE", {}],
  [34, "CHECK NO.", "cashier", "TEXT", {}],
  [35, "CHECK DATE", "cashier", "DATE", {}],
  [36, "DATE RELEASE TO SUPPLIER", "cashier", "DATE", {}],
] as const;

async function main() {
  const departmentIds = new Map<string, string>();
  for (const [key, name] of departments) {
    const department = await database.department.upsert({
      where: { key },
      update: { name, isActive: true },
      create: { key, name },
    });
    departmentIds.set(key, department.id);
  }

  const permissionIds = new Map<string, string>();
  for (const key of permissionKeys) {
    const permission = await database.permission.upsert({
      where: { key },
      update: { name: key },
      create: { key, name: key },
    });
    permissionIds.set(key, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const [key, name] of roles) {
    const role = await database.role.upsert({
      where: { key },
      update: { name, isSystem: true },
      create: { key, name, isSystem: true },
    });
    roleIds.set(key, role.id);
  }

  const permissionsByRole = new Map<string, readonly string[]>([
    ["admin", permissionKeys],
    ["sao", ["documents.view", "audit.view"]],
    ["procurement_staff", [...staffPermissions, "documents.create"]],
    ["budget_staff", staffPermissions],
    ["supply_staff", staffPermissions],
    ["pre_audit_staff", staffPermissions],
    ["accounting_staff", staffPermissions],
    ["cashier_staff", staffPermissions],
  ]);
  for (const [roleKey, keys] of permissionsByRole) {
    const roleId = roleIds.get(roleKey)!;
    await database.rolePermission.deleteMany({ where: { roleId } });
    await database.rolePermission.createMany({
      data: keys.map((key) => ({ roleId, permissionId: permissionIds.get(key)! })),
    });
  }

  for (const [key, name] of [
    ["dashboard", "Dashboard"],
    ["document_flow", "Document Flow"],
    ["notifications", "Notifications"],
    ["users", "User Management"],
    ["roles", "Role Management"],
    ["workflow_builder", "Workflow Builder"],
    ["audit", "Audit Trail"],
    ["settings", "Settings"],
  ] as const) {
    await database.pageFeature.upsert({
      where: { key },
      update: { name },
      create: { key, name },
    });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be set to at least 12 characters");
  }
  const admin = await database.user.upsert({
    where: { username: process.env.ADMIN_USERNAME?.toLowerCase() ?? "admin" },
    update: { status: "ACTIVE" },
    create: {
      fullName: process.env.ADMIN_FULL_NAME ?? "System Administrator",
      username: process.env.ADMIN_USERNAME?.toLowerCase() ?? "admin",
      email: process.env.ADMIN_EMAIL?.toLowerCase() ?? "admin@example.local",
      status: "ACTIVE",
    },
  });
  await database.credential.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      passwordHash: await hash(adminPassword, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    },
  });
  await database.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleIds.get("admin")! } },
    update: {},
    create: { userId: admin.id, roleId: roleIds.get("admin")! },
  });

  const workflow = await database.workflow.upsert({
    where: { key: "default_procurement" },
    update: { name: "Default Procurement Document Flow", isActive: true },
    create: {
      key: "default_procurement",
      name: "Default Procurement Document Flow",
      description: "Initial process based on process2.md; field rules remain subject to stakeholder confirmation.",
    },
  });
  const existingVersion = await database.workflowVersion.findFirst({
    where: { workflowId: workflow.id },
  });
  if (!existingVersion) {
    const version = await database.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        status: "PUBLISHED",
        createdById: admin.id,
        publishedAt: new Date(),
      },
    });
    const nodes: WorkflowNode[] = [];
    nodes.push(
      await database.workflowNode.create({
        data: {
          workflowVersionId: version.id,
          key: "start",
          label: "Start",
          type: "START",
          positionX: 0,
          positionY: 0,
          sortOrder: 0,
        },
      }),
    );
    for (const [step, label, departmentKey, fieldType, configuration] of workflowSteps) {
      nodes.push(
        await database.workflowNode.create({
          data: {
            workflowVersionId: version.id,
            key: `step_${step}`,
            label,
            type: "FIELD",
            fieldType,
            departmentId: departmentIds.get(departmentKey),
            positionX: 0,
            positionY: step * 140,
            sortOrder: step,
            configuration: { ...configuration, provisional: true },
          },
        }),
      );
    }
    nodes.push(
      await database.workflowNode.create({
        data: {
          workflowVersionId: version.id,
          key: "end",
          label: "Completed",
          type: "END",
          positionX: 0,
          positionY: 37 * 140,
          sortOrder: 37,
        },
      }),
    );
    await database.workflowEdge.createMany({
      data: nodes.slice(0, -1).map((node, index) => ({
        workflowVersionId: version.id,
        sourceNodeId: node.id,
        targetNodeId: nodes[index + 1]!.id,
        type: "FORWARD",
      })),
    });
    const returnTargets = [1, 9, 12, 19].map((step) => nodes[step]!);
    await database.workflowEdge.createMany({
      data: [26, 27].flatMap((step) =>
        returnTargets.map((target) => ({
          workflowVersionId: version.id,
          sourceNodeId: nodes[step]!.id,
          targetNodeId: target.id,
          type: "RETURN" as const,
          label: "Return with concern",
        })),
      ),
      skipDuplicates: true,
    });
  }
}

void main()
  .then(async () => {
    await database.$disconnect();
  })
  .catch(async (error: unknown) => {
    await database.$disconnect();
    throw error;
  });
