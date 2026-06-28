import { Bench, type BenchOptions, type Task, type TaskResult } from "tinybench";
import { allow, createAuthor, defineEntity, defineResource, memoryStore } from "../index";
import type { AuthorPolicyContext, AuthorStore, Policy } from "../index";

type User = { readonly id: string; readonly role: "member" };
type ApiKey = { readonly id: string };
type Project = { readonly id: string; readonly ownerId: string };
type Report = { readonly id: string };
type BenchContext = AuthorPolicyContext<User | ApiKey, Project | Report, Record<string, unknown>>;

type TaskMetadata = {
  readonly scenario: string;
  readonly policyCount: number;
};

type Scenario = {
  readonly name: string;
  readonly policies: (policyCount: number) => readonly Policy<BenchContext>[];
};

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const ApiKeyEntity = defineEntity<ApiKey>()({
  type: "ApiKey",
  id: (apiKey) => apiKey.id,
});

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read"] as const,
});

const ReportResource = defineResource<Report>()({
  type: "Report",
  id: (report) => report.id,
  actions: ["read"] as const,
});

const user = { id: "user_1", role: "member" } satisfies User;
const project = { id: "project_1", ownerId: "user_1" } satisfies Project;

const defaultPolicyCounts = [1, 10, 100, 1_000, 10_000, 20_000] as const;
const scenarios = [
  { name: "unscoped final allow", policies: createUnscopedFinalAllowPolicies },
  { name: "scoped all relevant final allow", policies: createScopedRelevantFinalAllowPolicies },
  { name: "scoped sparse final allow", policies: createScopedSparseFinalAllowPolicies },
] satisfies readonly Scenario[];

async function main(): Promise<void> {
  const policyCounts = parseCounts(Bun.env.AUTHOR_BENCH_POLICY_COUNTS) ?? defaultPolicyCounts;
  const timeMs = parsePositiveInteger(Bun.env.AUTHOR_BENCH_TIME_MS) ?? 1_000;
  const warmupTimeMs = parsePositiveInteger(Bun.env.AUTHOR_BENCH_WARMUP_TIME_MS) ?? 250;
  const iterations = parsePositiveInteger(Bun.env.AUTHOR_BENCH_ITERATIONS);

  const benchOptions: BenchOptions = {
    name: "author-js policy scaling",
    time: timeMs,
    warmupTime: warmupTimeMs,
    retainSamples: true,
    throws: true,
  };
  if (iterations !== null) benchOptions.iterations = iterations;

  const bench = new Bench(benchOptions);

  const metadataByTaskName = new Map<string, TaskMetadata>();

  for (const scenario of scenarios) {
    for (const policyCount of policyCounts) {
      const taskName = `${scenario.name} / ${policyCount} policies`;
      const author = createAuthor({
        store: noAuditStore(),
        entities: { User: UserEntity, ApiKey: ApiKeyEntity },
        resources: { Project: ProjectResource, Report: ReportResource },
        policies: scenario.policies(policyCount),
      });

      metadataByTaskName.set(taskName, { scenario: scenario.name, policyCount });
      bench.add(taskName, async () => {
        await author.as("User", user).can("read").on("Project", project).allowed();
      });
    }
  }

  console.log("author-js authorization policy scaling benchmark");
  console.log(`counts: ${policyCounts.join(", ")}`);
  console.log(`time per task: ${timeMs}ms`);
  console.log(`warmup per task: ${warmupTimeMs}ms`);
  if (iterations !== null) console.log(`fixed iterations: ${iterations}`);
  console.log("");

  await bench.run();
  printResults(bench.tasks, metadataByTaskName);
}

function createUnscopedFinalAllowPolicies(policyCount: number): readonly Policy<BenchContext>[] {
  if (policyCount <= 1) return [allow("policy 0 allows read", (ctx) => ctx.action === "read")];

  return Array.from({ length: policyCount }, (_, index) => {
    if (index === policyCount - 1) {
      return allow(`policy ${index} allows read`, (ctx) => ctx.action === "read");
    }

    return allow(`policy ${index} skips`, () => false);
  });
}

function createScopedRelevantFinalAllowPolicies(policyCount: number): readonly Policy<BenchContext>[] {
  if (policyCount <= 1) {
    return [
      allow(
        "policy 0 allows read",
        { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
        (ctx) => ctx.action === "read",
      ),
    ];
  }

  return Array.from({ length: policyCount }, (_, index) => {
    if (index === policyCount - 1) {
      return allow(
        `policy ${index} allows read`,
        { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
        (ctx) => ctx.action === "read",
      );
    }

    return allow(
      `policy ${index} skips`,
      { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
      () => false,
    );
  });
}

function createScopedSparseFinalAllowPolicies(policyCount: number): readonly Policy<BenchContext>[] {
  if (policyCount <= 1) {
    return [
      allow(
        "policy 0 allows read",
        { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
        (ctx) => ctx.action === "read",
      ),
    ];
  }

  return Array.from({ length: policyCount }, (_, index) => {
    if (index === policyCount - 1) {
      return allow(
        `policy ${index} allows read`,
        { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
        (ctx) => ctx.action === "read",
      );
    }

    return allow(
      `policy ${index} irrelevant report read`,
      { entityTypes: ["ApiKey"], resourceTypes: ["Report"], actions: ["read"] },
      () => false,
    );
  });
}

function noAuditStore(): AuthorStore {
  const store = memoryStore();
  return {
    getRoles: store.getRoles,
    grantRole: store.grantRole,
    revokeRole: store.revokeRole,
    getPermissions: store.getPermissions,
    grantPermission: store.grantPermission,
    revokePermission: store.revokePermission,
    getRelations: store.getRelations,
    createRelation: store.createRelation,
    deleteRelation: store.deleteRelation,
  };
}

function parseCounts(value: string | undefined): readonly number[] | null {
  if (!value) return null;

  const counts = value
    .split(",")
    .map((count) => parsePositiveInteger(count.trim()))
    .filter((count): count is number => count !== null);

  return counts.length > 0 ? counts : null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function printResults(tasks: readonly Task[], metadataByTaskName: ReadonlyMap<string, TaskMetadata>): void {
  const rows = tasks.map((task) => {
    const metadata = metadataByTaskName.get(task.name);
    const result = task.result;

    if (!isCompletedResult(result) || !metadata) {
      return {
        scenario: metadata?.scenario ?? "unknown",
        policies: metadata?.policyCount ?? task.name,
        samples: 0,
        "avg ms": "n/a",
        "p50 ms": "n/a",
        "p95 ms": "n/a",
        "p99 ms": "n/a",
        "ops/sec": "n/a",
        "rme %": "n/a",
      };
    }

    return {
      scenario: metadata.scenario,
      policies: metadata.policyCount,
      samples: result.latency.samplesCount,
      "avg ms": result.latency.mean.toFixed(4),
      "p50 ms": result.latency.p50.toFixed(4),
      "p95 ms": percentile(result.latency.samples, 95).toFixed(4),
      "p99 ms": result.latency.p99.toFixed(4),
      "ops/sec": result.throughput.mean.toFixed(0),
      "rme %": result.latency.rme.toFixed(2),
    };
  });

  console.table(rows);
}

function isCompletedResult(result: TaskResult): result is TaskResult & { readonly state: "completed" } {
  return result.state === "completed";
}

function percentile(samples: readonly number[] | undefined, percentileValue: number): number {
  if (!samples || samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)] ?? Number.NaN;
}

await main();
