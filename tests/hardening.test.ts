import { describe, expect, test } from "bun:test";
import {
  allow,
  createAuthor,
  defineContext,
  defineEntity,
  defineResource,
  memoryCache,
  UnknownActionError,
  UnknownEntityTypeError,
  UnknownResourceTypeError,
} from "../index";

type User = { id: string; role: "admin" | "member" };
type ApiKey = { id: string; scopes: readonly string[] };
type Project = { id: string; ownerId: string };
type Organization = { id: string; ownerId: string };
type AuthContext = { tenantId: string; count?: number };

const context = defineContext<AuthContext>();
const UserEntity = defineEntity<User>()({ type: "User", id: (user) => user.id });
const ApiKeyEntity = defineEntity<ApiKey>()({ type: "ApiKey", id: (key) => key.id });
const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update"] as const,
});
const OrganizationResource = defineResource<Organization>()({
  type: "Organization",
  id: (organization) => organization.id,
  actions: ["read"] as const,
});

describe("hardening", () => {
  test("throws clear errors for unknown entity resource and action", async () => {
    const author = createAuthor({
      entities: { User: UserEntity },
      resources: { Project: ProjectResource },
      policies: [],
    });

    await expect(
      author.evaluate({
        entityType: "ApiKey",
        entity: { id: "k1" },
        action: "read",
        resourceType: "Project",
        resource: { id: "p1", ownerId: "u1" },
        context: {},
        mode: "backend",
      }),
    ).rejects.toBeInstanceOf(UnknownEntityTypeError);
    await expect(
      author.evaluate({
        entityType: "User",
        entity: { id: "u1", role: "member" },
        action: "read",
        resourceType: "Missing",
        resource: { id: "x" },
        context: {},
        mode: "backend",
      }),
    ).rejects.toBeInstanceOf(UnknownResourceTypeError);
    await expect(
      author.evaluate({
        entityType: "User",
        entity: { id: "u1", role: "member" },
        action: "delete",
        resourceType: "Project",
        resource: { id: "p1", ownerId: "u1" },
        context: {},
        mode: "backend",
      }),
    ).rejects.toBeInstanceOf(UnknownActionError);
  });

  test("supports multiple entity types through subject metadata", async () => {
    const author = createAuthor({
      entities: { User: UserEntity, ApiKey: ApiKeyEntity },
      resources: { Project: ProjectResource },
      policies: [
        allow("api key read scope", ({ subject, action }) => {
          if (subject.type !== "ApiKey") return false;
          return action === "read" && subject.data.scopes.includes("projects:read");
        }),
        allow("admin user", ({ subject }) => {
          if (subject.type !== "User") return false;
          return subject.data.role === "admin";
        }),
      ],
    });

    await expect(
      author
        .as("ApiKey", { id: "key_1", scopes: ["projects:read"] })
        .can("read")
        .on("Project", { id: "p1", ownerId: "u1" })
        .allowed(),
    ).resolves.toBe(true);
    await expect(
      author.as("ApiKey", { id: "key_2", scopes: [] }).can("read").on("Project", { id: "p1", ownerId: "u1" }).allowed(),
    ).resolves.toBe(false);
    await expect(
      author.as("User", { id: "u1", role: "admin" }).can("update").on("Project", { id: "p1", ownerId: "u2" }).allowed(),
    ).resolves.toBe(true);
  });

  test("supports multiple resource types and typed context", async () => {
    const author = createAuthor({
      context,
      entities: { User: UserEntity },
      resources: { Project: ProjectResource, Organization: OrganizationResource },
      policies: [
        allow("tenant project read", ({ resource, context: ctx, action }) => {
          if (resource.type !== "Project") return false;
          return action === "read" && ctx.tenantId === "org_1" && resource.data.ownerId === "u1";
        }),
        allow("organization owner read", ({ resource, context: ctx }) => {
          if (resource.type !== "Organization") return false;
          return ctx.tenantId === resource.data.id;
        }),
      ],
    });

    await expect(
      author
        .as("User", { id: "u1", role: "member" })
        .can("read")
        .on("Project", { id: "p1", ownerId: "u1" }, { tenantId: "org_1" })
        .allowed(),
    ).resolves.toBe(true);
    await expect(
      author
        .as("User", { id: "u1", role: "member" })
        .can("read")
        .on("Organization", { id: "org_1", ownerId: "u1" }, { tenantId: "org_1" })
        .allowed(),
    ).resolves.toBe(true);
  });

  test("memory cache expires decisions", async () => {
    const cache = memoryCache();
    let calls = 0;
    const author = createAuthor({
      cache,
      cacheTtlMs: 1,
      entities: { User: UserEntity },
      resources: { Project: ProjectResource },
      policies: [
        allow("counted", () => {
          calls += 1;
          return true;
        }),
      ],
    });

    expect(
      await author.as("User", { id: "u1", role: "member" }).can("read").on("Project", { id: "p1", ownerId: "u1" }),
    ).toBe(true);
    expect(
      await author.as("User", { id: "u1", role: "member" }).can("read").on("Project", { id: "p1", ownerId: "u1" }),
    ).toBe(true);
    expect(calls).toBe(1);
    await Bun.sleep(5);
    expect(
      await author.as("User", { id: "u1", role: "member" }).can("read").on("Project", { id: "p1", ownerId: "u1" }),
    ).toBe(true);
    expect(calls).toBe(2);
  });
});
