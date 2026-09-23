import { z } from "zod";

export const fieldTypes = [
  "text",
  "date",
  "datetime",
  "decimal",
  "integer",
  "enum",
  "json",
  "remarks",
] as const;

export const workflowNodeTypes = ["start", "field", "decision", "end"] as const;
export const workflowEdgeTypes = ["forward", "return", "branch", "exception"] as const;

export const workflowNodeSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  type: z.enum(workflowNodeTypes),
  fieldType: z.enum(fieldTypes).nullable(),
  departmentKey: z.string().trim().min(1).max(100).nullable(),
  required: z.boolean(),
  positionX: z.number().finite(),
  positionY: z.number().finite(),
  configuration: z.record(z.string(), z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  sourceKey: z.string().trim().min(1),
  targetKey: z.string().trim().min(1),
  type: z.enum(workflowEdgeTypes),
  label: z.string().trim().max(200).nullable(),
  condition: z.record(z.string(), z.unknown()).nullable(),
});

export type FieldType = (typeof fieldTypes)[number];
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
