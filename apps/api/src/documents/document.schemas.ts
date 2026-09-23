import { z } from "zod";

export const createDocumentSchema = z.object({
  referenceNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(250),
});

export const updateFieldSchema = z.object({
  value: z.unknown(),
  expectedVersion: z.number().int().nonnegative(),
});

export const moveDocumentSchema = z.object({
  targetNodeId: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
});

export const returnDocumentSchema = z.object({
  targetNodeId: z.string().uuid(),
  reason: z.string().trim().min(5).max(1000),
});

export const resolveConcernSchema = z.object({
  resolution: z.string().trim().min(2).max(1000),
});
