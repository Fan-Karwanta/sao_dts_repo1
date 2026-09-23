import { describe, expect, it } from "vitest";
import {
  buildColumns,
  columnLetter,
  formatCell,
  groupByDepartment,
  mergeCellValue,
  parseCell,
  type SheetColumn,
} from "./sheet";
import type { WorkflowNode } from "./types";

const procurement = { id: "d1", key: "procurement", name: "Procurement" };
const budget = { id: "d2", key: "budget", name: "Budget" };

function node(overrides: Partial<WorkflowNode>): WorkflowNode {
  return {
    id: overrides.key ?? "n",
    key: "n",
    label: "Label",
    type: "FIELD",
    fieldType: "TEXT",
    isRequired: false,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    configuration: {},
    department: procurement,
    ...overrides,
  };
}

const column = (type: SheetColumn["type"], extra: Partial<SheetColumn> = {}): SheetColumn => ({
  key: "k",
  nodeKey: "k",
  subfield: null,
  label: "L",
  step: 1,
  type,
  options: null,
  currency: null,
  department: null,
  ...extra,
});

describe("columnLetter", () => {
  it("produces spreadsheet column letters", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      "A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
    ]);
  });
});

describe("buildColumns", () => {
  it("skips non-field nodes and expands JSON subfields", () => {
    const columns = buildColumns([
      node({ key: "start", type: "START" }),
      node({ key: "step_8", label: "P.O WITH NTP FORWARDED TO BUDGET", sortOrder: 8, fieldType: "DATE" }),
      node({
        key: "step_9",
        label: "ORS. NO. (GAA) & BURS NO. (INCOME)",
        sortOrder: 9,
        fieldType: "JSON",
        department: budget,
        configuration: { subfields: ["orsNumber", "bursNumber"] },
      }),
      node({
        key: "step_30",
        label: "DEDUCTIONS (TAX, LD)",
        sortOrder: 30,
        fieldType: "JSON",
        configuration: { subfields: ["tax", "liquidatedDamages"] },
      }),
    ]);
    expect(columns.map((c) => [c.key, c.label, c.step])).toEqual([
      ["step_8", "P.O WITH NTP FORWARDED TO BUDGET", 8],
      ["step_9.orsNumber", "ORS. NO. (GAA)", 9],
      ["step_9.bursNumber", "BURS NO. (INCOME)", 9],
      ["step_30.tax", "DEDUCTIONS – TAX", 30],
      ["step_30.liquidatedDamages", "DEDUCTIONS – LIQUIDATED DAMAGES", 30],
    ]);
    expect(groupByDepartment(columns)).toEqual([
      { key: "procurement", name: "Procurement", start: 0, span: 1 },
      { key: "budget", name: "Budget", start: 1, span: 2 },
      { key: "procurement", name: "Procurement", start: 3, span: 2 },
    ]);
  });
});

describe("parseCell", () => {
  it("validates by field type and treats blanks as cleared", () => {
    expect(parseCell(column("INTEGER"), " ")).toEqual({ ok: true, value: null });
    expect(parseCell(column("INTEGER"), "1,200")).toEqual({ ok: true, value: 1200 });
    expect(parseCell(column("INTEGER"), "1.5").ok).toBe(false);
    expect(parseCell(column("DECIMAL"), "₱1,234.50")).toEqual({ ok: true, value: 1234.5 });
    expect(parseCell(column("DECIMAL"), "abc").ok).toBe(false);
    expect(parseCell(column("DATE"), "9/3/2026")).toEqual({ ok: true, value: "2026-09-03" });
    expect(parseCell(column("DATE"), "tomorrow").ok).toBe(false);
    expect(parseCell(column("ENUM", { options: ["Check", "LDAP"] }), "ldap")).toEqual({
      ok: true,
      value: "LDAP",
    });
  });
});

describe("mergeCellValue / formatCell", () => {
  const sub = column("TEXT", { subfield: "bursNumber" });
  it("merges subfield edits into the parent object", () => {
    expect(mergeCellValue(sub, { orsNumber: "1" }, "2")).toEqual({ orsNumber: "1", bursNumber: "2" });
    expect(mergeCellValue(sub, { bursNumber: "2" }, null)).toBeNull();
  });
  it("formats amounts and dates", () => {
    expect(formatCell(column("DECIMAL"), 1234.5)).toBe("1,234.50");
    expect(formatCell(column("DATE"), "2026-09-03")).toBe("Sep 3, 2026");
  });
});
