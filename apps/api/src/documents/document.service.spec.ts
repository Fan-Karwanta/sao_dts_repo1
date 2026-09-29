import { ConflictException, NotFoundException } from "@nestjs/common";
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
  documentRecord: { findUnique: vi.fn() },
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
