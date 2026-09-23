import { z } from "zod";

export const realtimeEventTypes = [
  "document.created",
  "document.field.updated",
  "document.moved",
  "document.returned",
  "workflow.published",
  "notification.created",
  "user.status.updated",
] as const;

export const realtimeEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(realtimeEventTypes),
  occurredAt: z.string().datetime(),
  entityId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export const gridPresenceSchema = z.object({
  documentId: z.string().uuid().nullable(),
  columnKey: z.string().trim().min(1).max(120).nullable(),
});

export type GridPresence = z.infer<typeof gridPresenceSchema>;
