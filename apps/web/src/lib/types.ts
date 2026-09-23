export interface AuthUser {
  id: string;
  publicId: string;
  fullName: string;
  username: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  roleKeys: string[];
  permissionKeys: string[];
  departmentKeys: string[];
}

export interface AuthContext {
  sessionId: string;
  actor: AuthUser;
  user: AuthUser;
  impersonationId: string | null;
}

export interface Department {
  id: string;
  key: string;
  name: string;
}

export interface WorkflowNode {
  id: string;
  key: string;
  label: string;
  type: "START" | "FIELD" | "DECISION" | "END";
  fieldType: string | null;
  isRequired: boolean;
  positionX: number;
  positionY: number;
  sortOrder: number | null;
  configuration: Record<string, unknown>;
  department: Department | null;
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: "FORWARD" | "RETURN" | "BRANCH" | "EXCEPTION";
  label: string | null;
  condition: Record<string, unknown> | null;
}

export interface DocumentListItem {
  id: string;
  publicId: string;
  referenceNumber: string;
  title: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  workflowVersionId: string;
  currentNodeId: string | null;
  currentNode: (WorkflowNode & { department: Department | null }) | null;
  fieldValues: Array<{
    nodeId: string;
    value: unknown;
    version: number;
    updatedAt: string;
    updatedBy: { fullName: string } | null;
  }>;
}
