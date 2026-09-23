import { describe, expect, it } from "vitest";
import { WorkflowService } from "./workflow.service.js";

const service = Object.create(WorkflowService.prototype) as WorkflowService;

const baseNodes = [
  {
    key: "start",
    label: "Start",
    type: "start" as const,
    fieldType: null,
    departmentKey: null,
    required: false,
    positionX: 0,
    positionY: 0,
    configuration: {},
  },
  {
    key: "field",
    label: "Project title",
    type: "field" as const,
    fieldType: "text" as const,
    departmentKey: "procurement",
    required: true,
    positionX: 200,
    positionY: 0,
    configuration: {},
  },
  {
    key: "end",
    label: "Completed",
    type: "end" as const,
    fieldType: null,
    departmentKey: null,
    required: false,
    positionX: 400,
    positionY: 0,
    configuration: {},
  },
];

describe("WorkflowService.validateDefinition", () => {
  it("accepts a connected workflow with one start and an end", () => {
    expect(
      service.validateDefinition({
        nodes: baseNodes,
        edges: [
          { sourceKey: "start", targetKey: "field", type: "forward", label: null, condition: null },
          { sourceKey: "field", targetKey: "end", type: "forward", label: null, condition: null },
        ],
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it("reports missing starts and unreachable nodes", () => {
    const result = service.validateDefinition({ nodes: baseNodes.slice(1), edges: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow must contain exactly one start node");
  });

  it("rejects edges that reference missing nodes", () => {
    const result = service.validateDefinition({
      nodes: baseNodes,
      edges: [
        { sourceKey: "start", targetKey: "missing", type: "forward", label: null, condition: null },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("missing node"))).toBe(true);
  });

  it("validates supported field conditions", () => {
    const result = service.validateDefinition({
      nodes: baseNodes,
      edges: [
        {
          sourceKey: "start",
          targetKey: "field",
          type: "branch",
          label: null,
          condition: { fieldKey: "field", operator: "equals", value: "Approved" },
        },
        { sourceKey: "field", targetKey: "end", type: "forward", label: null, condition: null },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
