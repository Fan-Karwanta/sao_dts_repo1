import { describe, expect, it } from "vitest";
import { workflowNodeSchema } from "./workflow.js";

describe("workflowNodeSchema", () => {
  it("accepts a typed department-owned field", () => {
    const result = workflowNodeSchema.safeParse({
      key: "project_title",
      label: "Project title",
      type: "field",
      fieldType: "text",
      departmentKey: "procurement",
      required: true,
      positionX: 100,
      positionY: 50,
      configuration: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-finite canvas coordinates", () => {
    const result = workflowNodeSchema.safeParse({
      key: "project_title",
      label: "Project title",
      type: "field",
      fieldType: "text",
      departmentKey: "procurement",
      required: true,
      positionX: Number.POSITIVE_INFINITY,
      positionY: 50,
      configuration: {},
    });
    expect(result.success).toBe(false);
  });
});
