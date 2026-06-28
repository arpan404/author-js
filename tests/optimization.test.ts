import { describe, expect, test } from "bun:test";
import {
  DuplicateResourceTypeError,
  allow,
  createAuthor,
  defineAuthorModule,
  defineEntity,
  defineResource,
  deny,
  memoryStore,
} from "../index";
import type { AuthorPolicyContext, AuthorStore } from "../index";

type User = { id: string };
type ApiKey = { id: string };
type Project = { id: string };
type Report = { id: string };
type Entity = User | ApiKey;
type Resource = Project | Report;
type Ctx = AuthorPolicyContext<Entity, Resource, Record<string, unknown>>;

const UserEntity = defineEntity<User>()({ type: "User", id: (user) => user.id });
const ApiKeyEntity = defineEntity<ApiKey>()({ type: "ApiKey", id: (apiKey) => apiKey.id });

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "delete"] as const,
});

const ReportResource = defineResource<Report>()({
  type: "Report",
  id: (report) => report.id,
  actions: ["read"] as const,
});

describe("engine optimization", () => {
  test("author modules compose resources and policies into one runtime", async () => {
    const projectModule = defineAuthorModule({
      name: "projects",
      resources: { Project: ProjectResource },
      policies: [
        allow<Ctx>(
          "project read",
          { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
          () => true,
        ),
      ],
    });
    const reportModule = defineAuthorModule({
      name: "reports",
      resources: { Report: ReportResource },
      policies: [
        allow<Ctx>("report read", { entityTypes: ["User"], resourceTypes: ["Report"], actions: ["read"] }, () => true),
      ],
    });

    const author = createAuthor({
      entities: { User: UserEntity },
      modules: [projectModule, reportModule],
      policies: [
        deny<Ctx>(
          "global report deny",
          { entityTypes: ["User"], resourceTypes: ["Report"], actions: ["read"] },
          () => true,
        ),
      ],
    });

    await expect(author.as("User", { id: "u1" }).can("read").on("Project", { id: "p1" }).allowed()).resolves.toBe(true);

    const reportDecision = await author.as("User", { id: "u1" }).can("read").on("Report", { id: "r1" }).explain();

    expect(reportDecision.allowed).toBe(false);
    expect(reportDecision.matchedPolicies.map((policy) => policy.name)).toEqual(["global report deny", "report read"]);
  });

  test("author modules reject duplicate resource registrations", () => {
    const firstProjectModule = defineAuthorModule({
      name: "projects-a",
      resources: { Project: ProjectResource },
      policies: [],
    });
    const secondProjectModule = defineAuthorModule({
      name: "projects-b",
      resources: { Project: ProjectResource },
      policies: [],
    });

    expect(() =>
      createAuthor({
        entities: { User: UserEntity },
        modules: [firstProjectModule, secondProjectModule],
        policies: [],
      }),
    ).toThrow(DuplicateResourceTypeError);
  });

  test("scoped policies only run for matching entity resource and action", async () => {
    let globalCalls = 0;
    let apiKeyCalls = 0;
    let userProjectCalls = 0;
    let userReportCalls = 0;
    let userDeleteCalls = 0;

    const author = createAuthor({
      entities: { User: UserEntity, ApiKey: ApiKeyEntity },
      resources: { Project: ProjectResource, Report: ReportResource },
      policies: [
        allow<Ctx>("global fallback", () => {
          globalCalls += 1;
          return false;
        }),
        allow<Ctx>(
          "api key project read",
          { entityTypes: ["ApiKey"], resourceTypes: ["Project"], actions: ["read"] },
          () => {
            apiKeyCalls += 1;
            return true;
          },
        ),
        allow<Ctx>(
          "user project read",
          { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] },
          () => {
            userProjectCalls += 1;
            return true;
          },
        ),
        allow<Ctx>("user report read", { entityTypes: ["User"], resourceTypes: ["Report"], actions: ["read"] }, () => {
          userReportCalls += 1;
          return true;
        }),
        deny<Ctx>(
          "user project delete",
          { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["delete"] },
          () => {
            userDeleteCalls += 1;
            return true;
          },
        ),
      ],
    });

    await expect(author.as("User", { id: "u1" }).can("read").on("Project", { id: "p1" }).allowed()).resolves.toBe(true);

    expect(globalCalls).toBe(1);
    expect(userProjectCalls).toBe(1);
    expect(apiKeyCalls).toBe(0);
    expect(userReportCalls).toBe(0);
    expect(userDeleteCalls).toBe(0);

    const decision = await author.evaluate({
      entityType: "User",
      entity: { id: "u1" },
      action: "read",
      resourceType: "Project",
      resource: { id: "p1" },
      context: {},
      mode: "backend",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.matchedPolicies.map((policy) => policy.name)).toEqual(["user project read"]);
    expect(decision.skippedPolicies.map((policy) => policy.name)).toEqual(["global fallback"]);
    expect(globalCalls).toBe(2);
    expect(userProjectCalls).toBe(2);
    expect(apiKeyCalls).toBe(0);
    expect(userReportCalls).toBe(0);
    expect(userDeleteCalls).toBe(0);
  });

  test("boolean checks can stop at a matching deny while explain remains exhaustive", async () => {
    let laterAllowCalls = 0;

    const author = createAuthor({
      entities: { User: UserEntity },
      resources: { Project: ProjectResource },
      policies: [
        deny<Ctx>(
          "deny delete",
          { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["delete"] },
          () => true,
        ),
        allow<Ctx>("later allow", { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["delete"] }, () => {
          laterAllowCalls += 1;
          return true;
        }),
      ],
    });

    await expect(author.as("User", { id: "u1" }).can("delete").on("Project", { id: "p1" }).allowed()).resolves.toBe(
      false,
    );
    expect(laterAllowCalls).toBe(0);

    const decision = await author.as("User", { id: "u1" }).can("delete").on("Project", { id: "p1" }).explain();

    expect(decision.allowed).toBe(false);
    expect(decision.matchedPolicies.map((policy) => policy.name)).toEqual(["deny delete", "later allow"]);
    expect(laterAllowCalls).toBe(1);
  });

  test("store helper reads are memoized within one evaluation", async () => {
    const baseStore = memoryStore();
    let roleReads = 0;
    const store: AuthorStore = {
      ...baseStore,
      getRoles: (input) => {
        roleReads += 1;
        return baseStore.getRoles(input);
      },
    };
    await store.grantRole({ entityType: "User", entityId: "u1", role: "reader" });

    const author = createAuthor({
      store,
      entities: { User: UserEntity },
      resources: { Project: ProjectResource },
      policies: [
        allow<Ctx>("reader one", { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] }, (ctx) =>
          ctx.roles.has("reader"),
        ),
        allow<Ctx>("reader two", { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read"] }, (ctx) =>
          ctx.roles.has("reader"),
        ),
      ],
    });

    const decision = await author.as("User", { id: "u1" }).can("read").on("Project", { id: "p1" }).explain();

    expect(decision.allowed).toBe(true);
    expect(decision.matchedPolicies.map((policy) => policy.name)).toEqual(["reader one", "reader two"]);
    expect(roleReads).toBe(1);
  });
});
