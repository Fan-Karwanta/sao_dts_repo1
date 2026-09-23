import { workflowEdgeSchema, workflowNodeSchema } from "@sao/contracts";
import { z } from "zod";

export const createWorkflowSchema = z.object({
  key: z.string().trim().min(2).max(100).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).optional(),
});

export const saveWorkflowDraftSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(2).max(250),
  edges: z.array(workflowEdgeSchema).max(500),
});

export type SaveWorkflowDraftInput = z.infer<typeof saveWorkflowDraftSchema>;
