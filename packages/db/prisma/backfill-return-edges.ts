import { PrismaClient } from "@prisma/client";

const database = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const published = await database.workflowVersion.findMany({
    where: { status: "PUBLISHED", workflow: { isActive: true } },
    include: {
      workflow: { select: { key: true, name: true } },
      nodes: { orderBy: { sortOrder: "asc" } },
      edges: { select: { sourceNodeId: true, targetNodeId: true, type: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
  if (!published.length) throw new Error("No published workflow version found");

  for (const version of published) {
    const existing = new Set(
      version.edges
        .filter((edge) => edge.type === "RETURN")
        .map((edge) => `${edge.sourceNodeId}:${edge.targetNodeId}`),
    );
    const pending = version.nodes.flatMap((node, index) => {
      if (index === 0 || node.type === "START" || node.type === "END") return [];
      const target = version.nodes[index - 1];
      if (!target || existing.has(`${node.id}:${target.id}`)) return [];
      return [{ sourceNodeId: node.id, targetNodeId: target.id }];
    });

    console.log(
      `${version.workflow.name} v${version.version}: ${pending.length} return edge(s) ${dryRun ? "would be added" : "to add"}`,
    );
    if (dryRun || !pending.length) continue;
    const { count } = await database.workflowEdge.createMany({
      data: pending.map((edge) => ({
        workflowVersionId: version.id,
        ...edge,
        type: "RETURN" as const,
        label: "Return to previous step",
      })),
      skipDuplicates: true,
    });
    console.log(`  inserted ${count}`);
  }

  const drafts = await database.workflowVersion.count({ where: { status: "DRAFT" } });
  if (drafts) {
    console.warn(
      `WARNING: ${drafts} draft workflow version(s) do not include the backfilled return edges. Recreate or update the draft before publishing, or they will be lost.`,
    );
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
