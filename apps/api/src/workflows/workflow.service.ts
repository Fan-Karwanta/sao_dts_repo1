import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@sao/db";
import { createHash, randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../common/auth-context.js";
import { DatabaseService } from "../database/database.service.js";
import { RealtimeGateway } from "../realtime.gateway.js";
import type { SaveWorkflowDraftInput } from "./workflow.schemas.js";

@Injectable()
export class WorkflowService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  list() {
    return this.database.workflow.findMany({
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            status: true,
            createdAt: true,
            publishedAt: true,
          },
          orderBy: { version: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  getVersion(id: string) {
    return this.database.workflowVersion.findUnique({
      where: { id },
      include: {
        workflow: true,
        nodes: { include: { department: true }, orderBy: { sortOrder: "asc" } },
        edges: true,
      },
    });
  }

  async getPublished() {
    const version = await this.database.workflowVersion.findFirst({
      where: { status: "PUBLISHED", workflow: { isActive: true } },
      include: {
        workflow: true,
        nodes: { include: { department: true }, orderBy: { sortOrder: "asc" } },
        edges: true,
      },
      orderBy: { publishedAt: "desc" },
    });
    if (!version) throw new NotFoundException("No published workflow is available");
    return version;
  }

  async create(
    context: AuthContext,
    input: { key: string; name: string; description: string | undefined },
  ) {
    const existing = await this.database.workflow.findUnique({ where: { key: input.key } });
    if (existing) throw new ConflictException("Workflow key already exists");
    const workflow = await this.database.workflow.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        versions: {
          create: {
            version: 1,
            status: "DRAFT",
            createdById: context.actor.id,
          },
        },
      },
      include: { versions: true },
    });
    await this.audit.record(context, {
      action: "workflow.created",
      targetType: "Workflow",
      targetId: workflow.id,
    });
    return workflow;
  }

  async createDraft(context: AuthContext, workflowId: string) {
    const workflow = await this.database.workflow.findUnique({
      where: { id: workflowId },
      include: {
        versions: {
          include: { nodes: true, edges: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    if (!workflow) throw new NotFoundException("Workflow not found");
    const existingDraft = await this.database.workflowVersion.findFirst({
      where: { workflowId, status: "DRAFT" },
    });
    if (existingDraft) return this.getVersion(existingDraft.id);

    const source = workflow.versions[0];
    const draft = await this.database.$transaction(
      async (transaction) => {
        const created = await transaction.workflowVersion.create({
          data: {
            workflowId,
            version: (source?.version ?? 0) + 1,
            status: "DRAFT",
            createdById: context.actor.id,
          },
        });
        if (source) {
          const nodeMap = new Map<string, string>();
          await transaction.workflowNode.createMany({
            data: source.nodes.map((node) => {
              const id = randomUUID();
              nodeMap.set(node.id, id);
              return {
                id,
                workflowVersionId: created.id,
                key: node.key,
                label: node.label,
                type: node.type,
                fieldType: node.fieldType,
                departmentId: node.departmentId,
                isRequired: node.isRequired,
                positionX: node.positionX,
                positionY: node.positionY,
                configuration: (node.configuration ?? {}) as Prisma.InputJsonValue,
                sortOrder: node.sortOrder,
              };
            }),
          });
          if (source.edges.length) {
            await transaction.workflowEdge.createMany({
              data: source.edges.map((edge) => ({
                workflowVersionId: created.id,
                sourceNodeId: nodeMap.get(edge.sourceNodeId)!,
                targetNodeId: nodeMap.get(edge.targetNodeId)!,
                type: edge.type,
                label: edge.label,
                condition: edge.condition ?? Prisma.JsonNull,
              })),
            });
          }
        }
        return created;
      },
      { timeout: 30000 },
    );
    await this.audit.record(context, {
      action: "workflow.draft.created",
      targetType: "WorkflowVersion",
      targetId: draft.id,
    });
    return this.getVersion(draft.id);
  }

  validateDefinition(input: SaveWorkflowDraftInput) {
    const errors: string[] = [];
    const nodeKeys = new Set(input.nodes.map((node) => node.key));
    if (nodeKeys.size !== input.nodes.length) errors.push("Node keys must be unique");
    const starts = input.nodes.filter((node) => node.type === "start");
    const ends = input.nodes.filter((node) => node.type === "end");
    if (starts.length !== 1) errors.push("Workflow must contain exactly one start node");
    if (!ends.length) errors.push("Workflow must contain at least one end node");
    for (const edge of input.edges) {
      if (!nodeKeys.has(edge.sourceKey) || !nodeKeys.has(edge.targetKey)) {
        errors.push(`Edge ${edge.sourceKey} -> ${edge.targetKey} references a missing node`);
      }
      if (edge.sourceKey === edge.targetKey) errors.push("Self-referencing edges are not allowed");
      if (edge.condition) {
        const fieldKey = edge.condition.fieldKey;
        const operator = edge.condition.operator;
        if (
          typeof fieldKey !== "string" ||
          !nodeKeys.has(fieldKey) ||
          !["equals", "notEquals", "exists"].includes(String(operator))
        ) {
          errors.push(
            `Edge ${edge.sourceKey} -> ${edge.targetKey} has an invalid condition`,
          );
        }
      }
    }
    if (starts.length === 1) {
      const reachable = new Set<string>([starts[0]!.key]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const edge of input.edges) {
          if (reachable.has(edge.sourceKey) && !reachable.has(edge.targetKey)) {
            reachable.add(edge.targetKey);
            changed = true;
          }
        }
      }
      const unreachable = input.nodes.filter((node) => !reachable.has(node.key));
      if (unreachable.length) {
        errors.push(`Unreachable nodes: ${unreachable.map((node) => node.label).join(", ")}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async saveDraft(
    context: AuthContext,
    versionId: string,
    input: SaveWorkflowDraftInput,
  ) {
    const version = await this.database.workflowVersion.findUnique({ where: { id: versionId } });
    if (!version || version.status !== "DRAFT") {
      throw new NotFoundException("Editable workflow draft not found");
    }
    const validation = this.validateDefinition(input);
    const departments = await this.database.department.findMany();
    const departmentByKey = new Map(departments.map((item) => [item.key, item.id]));
    for (const node of input.nodes) {
      if (node.departmentKey && !departmentByKey.has(node.departmentKey)) {
        validation.errors.push(`Unknown department: ${node.departmentKey}`);
      }
    }
    validation.valid = validation.errors.length === 0;

    await this.database.$transaction(
      async (transaction) => {
        await transaction.workflowEdge.deleteMany({ where: { workflowVersionId: versionId } });
        await transaction.workflowNode.deleteMany({ where: { workflowVersionId: versionId } });
        const nodeIds = new Map<string, string>();
        await transaction.workflowNode.createMany({
          data: input.nodes.map((node, sortOrder) => {
            const id = randomUUID();
            nodeIds.set(node.key, id);
            return {
              id,
              workflowVersionId: versionId,
              key: node.key,
              label: node.label,
              type: node.type.toUpperCase() as "START" | "FIELD" | "DECISION" | "END",
              fieldType: (node.fieldType?.toUpperCase() ?? null) as
                | "TEXT"
                | "DATE"
                | "DATETIME"
                | "DECIMAL"
                | "INTEGER"
                | "ENUM"
                | "JSON"
                | "REMARKS"
                | null,
              departmentId: node.departmentKey
                ? (departmentByKey.get(node.departmentKey) ?? null)
                : null,
              isRequired: node.required,
              positionX: node.positionX,
              positionY: node.positionY,
              configuration: node.configuration as Prisma.InputJsonValue,
              sortOrder,
            };
          }),
        });
        if (input.edges.length) {
          await transaction.workflowEdge.createMany({
            data: input.edges.map((edge) => ({
              workflowVersionId: versionId,
              sourceNodeId: nodeIds.get(edge.sourceKey)!,
              targetNodeId: nodeIds.get(edge.targetKey)!,
              type: edge.type.toUpperCase() as "FORWARD" | "RETURN" | "BRANCH" | "EXCEPTION",
              label: edge.label,
              condition: edge.condition
                ? (edge.condition as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            })),
          });
        }
      },
      { timeout: 30000 },
    );
    await this.audit.record(context, {
      action: "workflow.draft.saved",
      targetType: "WorkflowVersion",
      targetId: versionId,
      after: { valid: validation.valid, errorCount: validation.errors.length },
    });
    return { ...validation, version: await this.getVersion(versionId) };
  }

  async publish(context: AuthContext, versionId: string) {
    const version = await this.getVersion(versionId);
    if (!version || version.status !== "DRAFT") {
      throw new NotFoundException("Workflow draft not found");
    }
    const input: SaveWorkflowDraftInput = {
      nodes: version.nodes.map((node) => ({
        key: node.key,
        label: node.label,
        type: node.type.toLowerCase() as "start" | "field" | "decision" | "end",
        fieldType: node.fieldType?.toLowerCase() as
          | "text"
          | "date"
          | "datetime"
          | "decimal"
          | "integer"
          | "enum"
          | "json"
          | "remarks"
          | null,
        departmentKey: node.department?.key ?? null,
        required: node.isRequired,
        positionX: node.positionX,
        positionY: node.positionY,
        configuration: node.configuration as Record<string, unknown>,
      })),
      edges: version.edges.map((edge) => ({
        sourceKey: version.nodes.find((node) => node.id === edge.sourceNodeId)!.key,
        targetKey: version.nodes.find((node) => node.id === edge.targetNodeId)!.key,
        type: edge.type.toLowerCase() as "forward" | "return" | "branch" | "exception",
        label: edge.label,
        condition: edge.condition as Record<string, unknown> | null,
      })),
    };
    const validation = this.validateDefinition(input);
    if (!validation.valid) throw new BadRequestException(validation);
    const definitionHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    await this.database.$transaction([
      this.database.workflowVersion.updateMany({
        where: { workflowId: version.workflowId, status: "PUBLISHED" },
        data: { status: "ARCHIVED" },
      }),
      this.database.workflowVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED", publishedAt: new Date(), definitionHash },
      }),
    ]);
    await this.audit.record(context, {
      action: "workflow.published",
      targetType: "WorkflowVersion",
      targetId: versionId,
      after: { definitionHash },
    });
    this.realtime.emitToAll("workflow.published", {
      id: randomUUID(),
      entityId: versionId,
      version: version.version,
    });
    return this.getVersion(versionId);
  }
}
