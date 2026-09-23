import type { Department, WorkflowNode } from "./types";

export type CellType = "TEXT" | "DATE" | "DECIMAL" | "INTEGER" | "ENUM" | "JSON";

export interface SheetColumn {
  key: string;
  nodeKey: string;
  subfield: string | null;
  label: string;
  step: number | null;
  type: CellType;
  options: string[] | null;
  currency: string | null;
  department: Department | null;
}

export interface DepartmentGroup {
  key: string;
  name: string;
  start: number;
  span: number;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

const palette: Record<string, { band: string; header: string; text: string }> = {
  procurement: { band: "#4a86e8", header: "#c9daf8", text: "#ffffff" },
  budget: { band: "#6aa84f", header: "#d9ead3", text: "#ffffff" },
  supply: { band: "#e69138", header: "#fce5cd", text: "#ffffff" },
  accounting: { band: "#8e7cc3", header: "#d9d2e9", text: "#ffffff" },
  pre_audit: { band: "#cc4125", header: "#f4cccc", text: "#ffffff" },
  cashier: { band: "#f1c232", header: "#fff2cc", text: "#3d3000" },
};
const fallbackPalette = { band: "#7f8c8d", header: "#e7eaec", text: "#ffffff" };

export function departmentColors(key: string | null | undefined) {
  return (key && palette[key]) || fallbackPalette;
}

export function columnLetter(index: number) {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

function humanize(name: string) {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

function subfieldLabels(label: string, subfields: string[], configured: string[] | null) {
  if (configured?.length === subfields.length) return configured;
  const parts = label.split(/\s+&\s+/);
  if (parts.length === subfields.length) return parts;
  const base = label.replace(/\s*\(.*\)\s*$/, "");
  return subfields.map((subfield) => `${base} – ${humanize(subfield)}`);
}

export function buildColumns(nodes: WorkflowNode[]): SheetColumn[] {
  return nodes
    .filter((node) => node.type === "FIELD")
    .flatMap((node): SheetColumn[] => {
      const config = node.configuration ?? {};
      const base = {
        nodeKey: node.key,
        step: node.sortOrder,
        options: stringArray(config.options),
        currency: typeof config.currency === "string" ? config.currency : null,
        department: node.department,
      };
      const subfields = node.fieldType === "JSON" ? stringArray(config.subfields) : null;
      if (!subfields?.length) {
        return [
          {
            ...base,
            key: node.key,
            subfield: null,
            label: node.label,
            type: (node.fieldType ?? "TEXT") as CellType,
          },
        ];
      }
      const labels = subfieldLabels(node.label, subfields, stringArray(config.subfieldLabels));
      return subfields.map((subfield, index) => ({
        ...base,
        key: `${node.key}.${subfield}`,
        subfield,
        label: labels[index]!,
        type: (subfield.toLowerCase().startsWith("date") ? "DATE" : "TEXT") as CellType,
        options: null,
        currency: null,
      }));
    });
}

export function groupByDepartment(columns: SheetColumn[]): DepartmentGroup[] {
  const groups: DepartmentGroup[] = [];
  columns.forEach((column, index) => {
    const key = column.department?.key ?? "system";
    const last = groups.at(-1);
    if (last?.key === key) last.span += 1;
    else groups.push({ key, name: column.department?.name ?? "System", start: index, span: 1 });
  });
  return groups;
}

export function cellValue(column: SheetColumn, value: unknown) {
  if (!column.subfield) return value;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[column.subfield]
    : undefined;
}

export function mergeCellValue(column: SheetColumn, current: unknown, next: unknown) {
  if (!column.subfield) return next;
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if (next === null) delete base[column.subfield];
  else base[column.subfield] = next;
  return Object.keys(base).length ? base : null;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatCell(column: SheetColumn, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (column.type === "DECIMAL" && typeof value === "number") {
    return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (column.type === "INTEGER" && typeof value === "number") return value.toLocaleString("en-PH");
  if (column.type === "DATE" && typeof value === "string") return formatDate(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function editableText(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function parseCell(column: SheetColumn, raw: string): ParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  switch (column.type) {
    case "INTEGER": {
      const cleaned = text.replace(/,/g, "");
      return /^-?\d+$/.test(cleaned)
        ? { ok: true, value: Number.parseInt(cleaned, 10) }
        : { ok: false, error: "Enter a whole number." };
    }
    case "DECIMAL": {
      const cleaned = text.replace(/[,₱\s]/g, "");
      const value = Number(cleaned);
      return cleaned && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, error: "Enter a valid amount." };
    }
    case "DATE": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: true, value: text };
      const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
      if (us) {
        return {
          ok: true,
          value: `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`,
        };
      }
      return { ok: false, error: "Enter a date as YYYY-MM-DD or MM/DD/YYYY." };
    }
    case "ENUM": {
      const match = column.options?.find((option) => option.toLowerCase() === text.toLowerCase());
      return match
        ? { ok: true, value: match }
        : { ok: false, error: `Choose one of: ${column.options?.join(", ")}.` };
    }
    case "JSON":
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false, error: "Enter valid JSON." };
      }
    default:
      return { ok: true, value: text };
  }
}

export function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function presenceColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 42%)`;
}
