import { PrismaClient } from "@prisma/client";

const database = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const STEP_21_CONFIGURATION = {
  subfields: ["status", "daysExtended"],
  subfieldLabels: ["STATUS", "NO. OF DAYS EXTENDED"],
  subfieldTypes: { status: "text", daysExtended: "integer" },
} as const;

async function main() {
  const nodes = await database.workflowNode.findMany({
    where: {
      key: "step_21",
      fieldType: { in: ["INTEGER", "JSON"] },
      workflowVersion: { workflow: { isActive: true } },
    },
    include: {
      workflowVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          workflow: { select: { key: true, name: true } },
        },
      },
      fieldValues: { select: { id: true, value: true } },
    },
  });
  if (!nodes.length) {
    console.log("No step_21 nodes found in active workflows — nothing to do.");
    return;
  }

  for (const node of nodes) {
    const { workflowVersion } = node;
    const scope = `${workflowVersion.workflow.name} v${workflowVersion.version} (${workflowVersion.status})`;
    const configuration = (node.configuration ?? {}) as Record<string, unknown>;
    const subfields = Array.isArray(configuration.subfields) ? configuration.subfields : null;

    if (
      node.fieldType === "JSON" &&
      subfields &&
      JSON.stringify(subfields) !== JSON.stringify(STEP_21_CONFIGURATION.subfields)
    ) {
      console.warn(`SKIPPED ${scope}: step_21 already has custom subfields [${subfields.join(", ")}]`);
      continue;
    }

    const pendingValues = node.fieldValues.filter(
      (field) => field.value !== null && typeof field.value !== "object",
    );
    console.log(
      `${scope}: step_21 ${node.fieldType} -> JSON [STATUS, NO. OF DAYS EXTENDED], ${pendingValues.length} value(s) to migrate`,
    );
    if (dryRun) continue;

    await database.$transaction(async (transaction) => {
      await transaction.workflowNode.update({
        where: { id: node.id },
        data: {
          label: "STATUS & NO. OF DAYS EXTENDED",
          fieldType: "JSON",
          configuration: { ...configuration, ...STEP_21_CONFIGURATION },
        },
      });
      for (const field of pendingValues) {
        await transaction.documentFieldValue.update({
          where: { id: field.id },
          data: { value: { daysExtended: field.value } },
        });
      }
    });
    console.log(`  updated node ${node.id}, migrated ${pendingValues.length} value(s)`);
  }
}

void main()
  .then(async () => {
    await database.$disconnect();
  })
  .catch(async (error: unknown) => {
    await database.$disconnect();
    throw error;
  });
