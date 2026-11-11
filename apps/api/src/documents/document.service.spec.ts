import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@sao/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service.js";
import type { AuthContext, AuthUser } from "../common/auth-context.js";
import type { DatabaseService } from "../database/database.service.js";
import type { RealtimeGateway } from "../realtime.gateway.js";
import { DocumentService } from "./document.service.js";

const transaction = {
  documentRecord: { update: vi.fn() },
  documentMovement: { create: vi.fn() },
};

const database = {
  documentRecord: { findUnique: vi.fn(), update: vi.fn() },
  workflowNode: { findUnique: vi.fn() },
  userRole: { findMany: vi.fn() },
  $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(transaction)),
};

const audit = { record: vi.fn() };
const realtime = { emitToDocument: vi.fn(), emitToUser: vi.fn() };

const service = new DocumentService(
  database as unknown as DatabaseService,
  audit as unknown as AuditService,
  realtime as unknown as RealtimeGateway,
);

const user: AuthUser = {
  id: "admin-1",
  publicId: "pub-1",
  fullName: "Admin",
  username: "admin",
  email: "admin@example.local",
  status: "ACTIVE",
  mustChangePassword: false,
  roleKeys: ["admin"],
  permissionKeys: ["documents.reroute"],
  departmentKeys: [],
};

const context: AuthContext = {
  sessionId: "session-1",
  actor: user,
  user,
  impersonationId: null,
};

const document = {
  id: "doc-1",
  referenceNumber: "PR-001",
  title: "Office supplies",
  status: "RETURNED",
  workflowVersionId: "version-1",
  currentNodeId: "node-b",
  version: 3,
};

const targetNode = {
  id: "node-a",
  workflowVersionId: "version-1",
  type: "FIELD",
  departmentId: null,
};

describe("DocumentService.reroute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(transaction),
    );
    database.userRole.findMany.mockResolvedValue([]);
  });

  it("rejects a missing document", async () => {
    database.documentRecord.findUnique.mockResolvedValue(null);
    await expect(service.reroute(context, "doc-1", "node-a", "Needs fixing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects a target node outside the document's workflow version", async () => {
    database.documentRecord.findUnique.mockResolvedValue(document);
    database.workflowNode.findUnique.mockResolvedValue({
      ...targetNode,
      workflowVersionId: "other-version",
    });
    await expect(service.reroute(context, "doc-1", "node-a", "Needs fixing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects rerouting to the current node", async () => {
    database.documentRecord.findUnique.mockResolvedValue(document);
    database.workflowNode.findUnique.mockResolvedValue({
      ...targetNode,
      id: "node-b",
    });
    await expect(service.reroute(context, "doc-1", "node-b", "Needs fixing")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("moves the document and records a REROUTE movement", async () => {
    database.documentRecord.findUnique.mockResolvedValue(document);
    database.workflowNode.findUnique.mockResolvedValue(targetNode);
    transaction.documentRecord.update.mockResolvedValue({
      ...document,
      currentNodeId: "node-a",
      status: "ACTIVE",
    });
    await service.reroute(context, "doc-1", "node-a", "Returned to correct routing");

    const updateInput = transaction.documentRecord.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateInput.data).toMatchObject({
      currentNodeId: "node-a",
      status: "ACTIVE",
      completedAt: null,
    });
    const movementInput = transaction.documentMovement.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(movementInput.data).toMatchObject({
      documentId: "doc-1",
      type: "REROUTE",
      fromNodeId: "node-b",
      toNodeId: "node-a",
      actorId: "admin-1",
      reason: "Returned to correct routing",
    });
    expect(audit.record).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ action: "document.rerouted" }),
    );
    expect(realtime.emitToDocument).toHaveBeenCalledWith(
      "doc-1",
      "document.rerouted",
      expect.objectContaining({ targetNodeId: "node-a" }),
    );
  });
});

describe("DocumentService.correctReference", () => {
  const staffUser: AuthUser = {
    ...user,
    id: "staff-1",
    roleKeys: ["procurement_staff"],
    permissionKeys: ["documents.reference.correct"],
  };
  const staffContext: AuthContext = { ...context, user: staffUser };

  const atStartDocument = {
    ...document,
    createdById: "staff-1",
    currentNode: { id: "node-start", type: "START" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing document", async () => {
    database.documentRecord.findUnique.mockResolvedValue(null);
    await expect(
      service.correctReference(context, "doc-1", "PR-002", "Typo in reference", 3),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a non-admin who is not the creator", async () => {
    database.documentRecord.findUnique.mockResolvedValue({
      ...atStartDocument,
      createdById: "someone-else",
    });
    await expect(
      service.correctReference(staffContext, "doc-1", "PR-002", "Typo in reference", 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects the creator once the document has left the start step", async () => {
    database.documentRecord.findUnique.mockResolvedValue({
      ...atStartDocument,
      currentNode: { id: "node-b", type: "FIELD" },
    });
    await expect(
      service.correctReference(staffContext, "doc-1", "PR-002", "Typo in reference", 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a stale expectedVersion", async () => {
    database.documentRecord.findUnique.mockResolvedValue(atStartDocument);
    await expect(
      service.correctReference(staffContext, "doc-1", "PR-002", "Typo in reference", 2),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an unchanged reference number", async () => {
    database.documentRecord.findUnique.mockResolvedValue(atStartDocument);
    await expect(
      service.correctReference(staffContext, "doc-1", "PR-001", "Typo in reference", 3),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets the creator correct the reference at the start step", async () => {
    database.documentRecord.findUnique.mockResolvedValue(atStartDocument);
    database.documentRecord.update.mockResolvedValue({
      ...atStartDocument,
      referenceNumber: "PR-002",
      version: 4,
    });
    await service.correctReference(staffContext, "doc-1", "PR-002", "Typo in reference", 3);

    expect(database.documentRecord.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { referenceNumber: "PR-002", version: { increment: 1 } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      staffContext,
      expect.objectContaining({ action: "document.reference.corrected" }),
    );
    expect(realtime.emitToDocument).toHaveBeenCalledWith(
      "doc-1",
      "document.reference.corrected",
      expect.objectContaining({ entityId: "doc-1", version: 4 }),
    );
  });

  it("lets an admin correct the reference at any step", async () => {
    database.documentRecord.findUnique.mockResolvedValue({
      ...document,
      createdById: "someone-else",
      currentNode: { id: "node-b", type: "FIELD" },
    });
    database.documentRecord.update.mockResolvedValue({
      ...document,
      referenceNumber: "PR-002",
      version: 4,
    });
    await service.correctReference(context, "doc-1", "PR-002", "Wrong reference entered", 3);

    expect(database.documentRecord.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { referenceNumber: "PR-002", version: { increment: 1 } },
    });
  });

  it("maps a duplicate reference number to a conflict", async () => {
    database.documentRecord.findUnique.mockResolvedValue(atStartDocument);
    database.documentRecord.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(
      service.correctReference(staffContext, "doc-1", "PR-002", "Typo in reference", 3),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
