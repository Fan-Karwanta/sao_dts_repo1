import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@sao/db";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../common/auth-context.js";
import { DatabaseService } from "../database/database.service.js";
import { RealtimeGateway } from "../realtime.gateway.js";

@Injectable()
export class DocumentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  list() {
    return this.database.documentRecord.findMany({
      include: {
        currentNode: { include: { department: true } },
        workflowVersion: { select: { version: true, workflow: { select: { name: true } } } },
        fieldValues: {
          select: {
            nodeId: true,
            value: true,
            version: true,
            updatedAt: true,
            updatedBy: { select: { fullName: true } },
          },
        },
        _count: { select: { concerns: true, movements: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(id: string) {
    const document = await this.database.documentRecord.findUnique({
      where: { id },
      include: {
        currentNode: { include: { department: true } },
        workflowVersion: {
          include: {
            workflow: true,
            nodes: { include: { department: true }, orderBy: { sortOrder: "asc" } },
            edges: true,
          },
        },
        fieldValues: { include: { node: true, updatedBy: { select: { fullName: true } } } },
        movements: {
          include: {
            fromNode: true,
            toNode: true,
            actor: { select: { fullName: true, username: true } },
          },
          orderBy: { occurredAt: "desc" },
        },
        concerns: {
          include: {
            node: true,
            openedBy: { select: { fullName: true } },
            resolvedBy: { select: { fullName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  async create(context: AuthContext, referenceNumber: string, title: string) {
    const workflow = await this.database.workflowVersion.findFirst({
      where: { status: "PUBLISHED", workflow: { isActive: true } },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
      orderBy: { publishedAt: "desc" },
    });
    if (!workflow) throw new ConflictException("No published workflow is available");
    const start = workflow.nodes.find((node) => node.type === "START") ?? workflow.nodes[0];
    if (!start) throw new ConflictException("Published workflow has no nodes");

    const document = await this.database.$transaction(async (transaction) => {
      const created = await transaction.documentRecord.create({
        data: {
          referenceNumber,
          title,
          workflowVersionId: workflow.id,
          currentNodeId: start.id,
          createdById: context.user.id,
        },
      });
      await transaction.documentMovement.create({
        data: {
          documentId: created.id,
          type: "CREATE",
          toNodeId: start.id,
          actorId: context.user.id,
        },
      });
      return created;
    });
    await this.audit.record(context, {
      action: "document.created",
      targetType: "DocumentRecord",
      targetId: document.id,
      after: { referenceNumber, title },
    });
    this.realtime.emitToAll("document.created", {
      id: randomUUID(),
      entityId: document.id,
      version: document.version,
    });
    return this.get(document.id);
  }

  private canEditDepartment(context: AuthContext, departmentKey: string | null) {
    return (
      context.user.roleKeys.includes("admin") ||
      (departmentKey !== null && context.user.departmentKeys.includes(departmentKey))
    );
  }

  async updateField(
    context: AuthContext,
    documentId: string,
    nodeId: string,
    value: unknown,
    expectedVersion: number,
  ) {
    const [document, node, previous] = await Promise.all([
      this.database.documentRecord.findUnique({ where: { id: documentId } }),
      this.database.workflowNode.findUnique({
        where: { id: nodeId },
        include: { department: true },
      }),
      this.database.documentFieldValue.findUnique({
        where: { documentId_nodeId: { documentId, nodeId } },
      }),
    ]);
    if (!document || !node || node.workflowVersionId !== document.workflowVersionId) {
      throw new NotFoundException("Document field not found");
    }
    if (!this.canEditDepartment(context, node.department?.key ?? null)) {
      throw new ForbiddenException("This field belongs to another department");
    }
    if ((previous?.version ?? 0) !== expectedVersion) {
      throw new ConflictException("This field was changed by another user");
    }

    const jsonValue =
      value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
    const fieldValue = await this.database.$transaction(async (transaction) => {
      const updated = await transaction.documentFieldValue.upsert({
        where: { documentId_nodeId: { documentId, nodeId } },
        create: {
          documentId,
          nodeId,
          value: jsonValue,
          version: 1,
          updatedById: context.user.id,
        },
        update: {
          value: jsonValue,
          version: { increment: 1 },
          updatedById: context.user.id,
        },
      });
      await transaction.documentRecord.update({
        where: { id: documentId },
        data: { version: { increment: 1 } },
      });
      return updated;
    });
    await this.audit.record(context, {
      action: "document.field.updated",
      targetType: "DocumentFieldValue",
      targetId: fieldValue.id,
      before: { value: previous?.value ?? null, version: previous?.version ?? 0 },
      after: { value: fieldValue.value, version: fieldValue.version },
    });
    this.realtime.emitToDocument(documentId, "document.field.updated", {
      id: randomUUID(),
      entityId: documentId,
      nodeId,
      version: fieldValue.version,
    });
    return fieldValue;
  }

  private async conditionAllows(
    documentId: string,
    workflowVersionId: string,
    condition: unknown,
  ) {
    if (!condition) return true;
    if (typeof condition !== "object" || Array.isArray(condition)) return false;
    const rule = condition as Record<string, unknown>;
    if (typeof rule.fieldKey !== "string" || typeof rule.operator !== "string") {
      return false;
    }
    const node = await this.database.workflowNode.findUnique({
      where: {
        workflowVersionId_key: {
          workflowVersionId,
          key: rule.fieldKey,
        },
      },
    });
    if (!node) return false;
    const field = await this.database.documentFieldValue.findUnique({
      where: { documentId_nodeId: { documentId, nodeId: node.id } },
    });
    if (rule.operator === "exists") return field !== null;
    const actual = JSON.stringify(field?.value ?? null);
    const expected = JSON.stringify(rule.value ?? null);
    if (rule.operator === "equals") return actual === expected;
    if (rule.operator === "notEquals") return actual !== expected;
    return false;
  }

  private async notifyTargetDepartment(
    documentId: string,
    targetNodeId: string,
    title: string,
    body: string,
  ) {
    const node = await this.database.workflowNode.findUnique({ where: { id: targetNodeId } });
    if (!node?.departmentId) return;
    const assignments = await this.database.userRole.findMany({
      where: { departmentId: node.departmentId, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    if (!assignments.length) return;
    await this.database.notification.createMany({
      data: assignments.map(({ userId }) => ({
        userId,
        type: "document.assignment",
        title,
        body,
        data: { documentId },
      })),
    });
    for (const { userId } of assignments) {
      this.realtime.emitToUser(userId, "notification.created", { documentId, title });
    }
  }

  async move(
    context: AuthContext,
    documentId: string,
    targetNodeId: string,
    reason: string | undefined,
    isReturn: boolean,
  ) {
    const document = await this.database.documentRecord.findUnique({
      where: { id: documentId },
      include: { currentNode: true },
    });
    if (!document?.currentNodeId) throw new NotFoundException("Active document not found");
    const currentDepartment = document.currentNode?.departmentId
      ? await this.database.department.findUnique({
          where: { id: document.currentNode.departmentId },
        })
      : null;
    const canStart =
      document.currentNode?.type === "START" &&
      context.user.permissionKeys.includes("documents.create");
    if (!canStart && !this.canEditDepartment(context, currentDepartment?.key ?? null)) {
      throw new ForbiddenException("Only the current department can move this document");
    }
    const edge = await this.database.workflowEdge.findFirst({
      where: {
        workflowVersionId: document.workflowVersionId,
        sourceNodeId: document.currentNodeId,
        targetNodeId,
        type: isReturn ? { in: ["RETURN", "EXCEPTION"] } : { in: ["FORWARD", "BRANCH"] },
      },
      include: { targetNode: true },
    });
    if (!edge) throw new ConflictException("The requested workflow transition is not allowed");
    if (
      !(await this.conditionAllows(
        documentId,
        document.workflowVersionId,
        edge.condition,
      ))
    ) {
      throw new ConflictException("The transition condition is not satisfied");
    }

    const updated = await this.database.$transaction(async (transaction) => {
      const next = await transaction.documentRecord.update({
        where: { id: documentId },
        data: {
          currentNodeId: targetNodeId,
          status: isReturn ? "RETURNED" : edge.targetNode.type === "END" ? "COMPLETED" : "ACTIVE",
          completedAt: edge.targetNode.type === "END" ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await transaction.documentMovement.create({
        data: {
          documentId,
          type: isReturn ? "RETURN" : edge.targetNode.type === "END" ? "COMPLETE" : "ADVANCE",
          fromNodeId: document.currentNodeId,
          toNodeId: targetNodeId,
          actorId: context.user.id,
          reason: reason ?? null,
        },
      });
      if (isReturn && reason) {
        await transaction.commentOrConcern.create({
          data: {
            documentId,
            nodeId: targetNodeId,
            message: reason,
            openedById: context.user.id,
          },
        });
      }
      return next;
    });
    await this.audit.record(context, {
      action: isReturn ? "document.returned" : "document.moved",
      targetType: "DocumentRecord",
      targetId: documentId,
      before: { nodeId: document.currentNodeId, status: document.status },
      after: { nodeId: targetNodeId, status: updated.status, reason },
    });
    await this.notifyTargetDepartment(
      documentId,
      targetNodeId,
      isReturn ? "Document returned" : "Document received",
      `${document.referenceNumber}: ${document.title}`,
    );
    this.realtime.emitToDocument(
      documentId,
      isReturn ? "document.returned" : "document.moved",
      { id: randomUUID(), entityId: documentId, version: updated.version, targetNodeId },
    );
    return this.get(documentId);
  }

  async resolveConcern(context: AuthContext, concernId: string, resolution: string) {
    const concern = await this.database.commentOrConcern.findUnique({ where: { id: concernId } });
    if (!concern || concern.status !== "OPEN") {
      throw new NotFoundException("Open concern not found");
    }
    const updated = await this.database.commentOrConcern.update({
      where: { id: concernId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: context.user.id },
    });
    await this.audit.record(context, {
      action: "document.concern.resolved",
      targetType: "CommentOrConcern",
      targetId: concernId,
      after: { resolution },
    });
    return updated;
  }
}
