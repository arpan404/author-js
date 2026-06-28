---
name: author-js
description: Self-contained guide for AI agents building app authorization with author.js. Use when adding authorization to an app: entities, resources, policies, backend enforcement, React/Next.js UI gates, PostgreSQL/MongoDB stores, Redis caching, roles, permissions, relations, parent inheritance, subscription entitlements, and tests.
---

# author.js app builder skill

This skill is enough to build on top of author.js without reading the framework source.

author.js is a TypeScript-first authorization library. Apps define:

- **entities**: actors, usually users or API clients
- **resources**: protected objects, such as projects, documents, organizations
- **actions**: things entities can do to resources, such as `read`, `update`, `delete`
- **policies**: named TypeScript rules that return allow/deny/skip behavior
- **stores**: optional persistence for roles, permissions, relations, audit logs
- **cache**: optional decision caching, commonly Redis

Backend checks are security. React checks are only UI convenience.

## Docs fallback

Do not read framework source unless the user asks. If API details are uncertain, use these docs:

- Overview: https://github.com/arpan404/author-js#readme
- Core: https://github.com/arpan404/author-js/blob/main/docs/core.md
- Management: https://github.com/arpan404/author-js/blob/main/docs/management.md
- Adapters: https://github.com/arpan404/author-js/blob/main/docs/adapters.md
- React: https://github.com/arpan404/author-js/blob/main/docs/react.md
- Frameworks: https://github.com/arpan404/author-js/blob/main/docs/frameworks.md
- Testing: https://github.com/arpan404/author-js/blob/main/docs/testing.md
- npm: https://www.npmjs.com/package/author-js

## Install

Use the app's package manager. For Bun:

```bash
bun add author-js
```

Add peer dependencies only for used adapters:

```bash
bun add pg        # PostgreSQL store
bun add mongodb   # MongoDB store
bun add redis     # Redis cache
bun add react     # React adapter, if React is not already installed
```

Do not add databases, Redis, or React unless the app already uses them or the user asked.

## First inspect the app

Before coding, identify:

1. framework: Next.js, React SPA, Express, Hono, Fastify, Elysia, etc.
2. runtime/package manager: Bun, npm, pnpm, yarn
3. current auth/session source: Clerk, NextAuth, JWT, database sessions, custom auth
4. user shape: ID, role, org/workspace/account ID
5. protected resources: project, document, org, file, billing account
6. mutation routes/actions that need backend enforcement
7. UI buttons/pages that should be hidden when unauthorized
8. persistence: PostgreSQL, MongoDB, in-memory, Redis

Build the smallest authorization layer that protects the requested feature.

## Minimal file layout

Use the app's conventions. If none exist:

```txt
src/authorization/author.ts
```

For Next.js apps this is also fine:

```txt
src/lib/author.ts
```

Start with one file. Split later only if it gets painful.

## Core API

Import from `author-js`:

```ts
import { allow, createAuthor, defineContext, defineEntity, defineResource, deny, skip } from "author-js";
```

Usually you only need `allow`, `createAuthor`, `defineEntity`, `defineResource`, and maybe `defineContext`.

### Entity

An entity is the actor.

```ts
type User = {
  id: string;
  role: "admin" | "member";
  organizationId?: string;
};

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});
```

### Resource

A resource is the protected object.

```ts
type Project = {
  id: string;
  ownerId: string;
  organizationId: string;
  status: "draft" | "published";
};

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
});
```

### Context

Context is request/session data that is not part of the entity or resource.

```ts
type AuthContext = {
  organizationId?: string;
  ip?: string;
};

const context = defineContext<AuthContext>();
```

Pass context per check:

```ts
await author.as("User", user).can("read").on("Project", project, { organizationId: "org_1" });
```

### Author instance

```ts
export const author = createAuthor({
  context,
  entities: {
    User: UserEntity,
  },
  resources: {
    Project: ProjectResource,
  },
  policies: [
    allow("admins can do anything", ({ entity }) => entity.role === "admin"),

    allow("project owners can update projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && resource.data.ownerId === entity.id;
    }),

    allow("members can read projects in their organization", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "read" && entity.organizationId === resource.data.organizationId;
    }),
  ],
});
```

## Check permissions

Return boolean:

```ts
const allowed = await author.as("User", user).can("update").on("Project", project);
```

Throw when denied:

```ts
await author.as("User", user).can("update").on("Project", project).throw();
```

Explain a decision:

```ts
const decision = await author.as("User", user).can("update").on("Project", project).explain();
```

Use explicit types every time:

```ts
author.as("User", user).can("read").on("Project", project);
```

Do not rely on inferred string names outside entity/resource definitions.

## Policy rules

Policies receive a context object commonly used as:

```ts
({ entity, resource, action, context, subject, entityType, entityId, parents, subscription, features, limits }) => boolean | Promise<boolean>
```

Common fields:

- `entity`: current actor data
- `resource`: `{ type, id, data }`
- `action`: requested action
- `context`: custom context passed to `.on(...)`
- `subject`: typed subject metadata
- `entityType`: current entity type string
- `entityId`: current entity ID
- `parents`: parent-resource helper API
- `subscription`, `features`, `limits`: entitlement helpers

Policy helpers:

```ts
allow("name", (ctx) => true);
deny("name", (ctx) => true);
skip("name", (ctx) => false);
```

Guidelines:

- Name policies after business rules.
- `deny` overrides `allow`; use deny only intentionally.
- Return `false` when a policy does not apply.
- Check `resource.type` before reading `resource.data`.
- Prefer small policies over one giant policy.
- Do not use `any`.

## Choose the simplest model

Use only what the feature needs:

### Owner check

```ts
allow("owners can update projects", ({ entity, resource, action }) => {
  if (resource.type !== "Project") return false;
  return action === "update" && resource.data.ownerId === entity.id;
});
```

### RBAC

```ts
allow("admins can delete projects", ({ entity, action, resource }) => {
  return resource.type === "Project" && action === "delete" && entity.role === "admin";
});
```

### ABAC

```ts
allow("published projects are readable", ({ action, resource }) => {
  if (resource.type !== "Project") return false;
  return action === "read" && resource.data.status === "published";
});
```

### Tenant/org check

```ts
allow("members can read projects in their organization", ({ entity, resource, action }) => {
  if (resource.type !== "Project") return false;
  return action === "read" && entity.organizationId === resource.data.organizationId;
});
```

### ReBAC / relationships

Use relations when access is resource-specific and stored dynamically:

```ts
allow("project viewers can read projects", async (ctx) => {
  if (ctx.resource.type !== "Project" || ctx.action !== "read") return false;

  return ctx.parents.hasRelation({
    relation: "viewer",
    objectType: "Project",
    objectId: ctx.resource.id,
  });
});
```

## Stores

Without a store, author.js can still run policy checks. Use stores when the app needs persisted roles, direct permissions, or relations.

### Memory store

Good for tests and prototypes:

```ts
import { memoryStore } from "author-js";

const author = createAuthor({
  entities,
  resources,
  policies,
  store: memoryStore(),
});
```

### PostgreSQL

```ts
import { postgresStore } from "author-js/postgres";

const author = createAuthor({
  entities,
  resources,
  policies,
  store: postgresStore({
    connectionString: process.env.POSTGRES_URL!,
  }),
});
```

Use PostgreSQL when the app already uses Postgres or wants relational persistence.

### MongoDB

```ts
import { mongodbStore } from "author-js/mongodb";

const author = createAuthor({
  entities,
  resources,
  policies,
  store: mongodbStore({
    url: process.env.MONGODB_URL!,
    database: "app",
  }),
});
```

Use MongoDB when the app already uses MongoDB.

## Redis decision cache

Redis caches authorization decisions. It does not replace the store.

```ts
import { redisCache } from "author-js/redis";

const author = createAuthor({
  entities,
  resources,
  policies,
  cache: redisCache({
    url: process.env.REDIS_URL!,
    prefix: "author:",
  }),
  cacheTtlMs: 30_000,
});
```

### PostgreSQL + Redis

This is the standard production shape when using Postgres plus shared cache:

```ts
import { createAuthor } from "author-js";
import { postgresStore } from "author-js/postgres";
import { redisCache } from "author-js/redis";

export const author = createAuthor({
  entities,
  resources,
  policies,
  store: postgresStore({ connectionString: process.env.POSTGRES_URL! }),
  cache: redisCache({ url: process.env.REDIS_URL!, prefix: "author:" }),
  cacheTtlMs: 30_000,
});
```

Meaning:

- PostgreSQL persists roles, permissions, relations, and audit logs.
- Redis caches decisions across app instances.
- Management writes should go through `author.roles`, `author.permissions`, and `author.relations` so cache invalidation can happen.

Do not add Redis before there is a hot path, multi-instance cache need, or explicit user request.

## Management API

Use this for app admin pages, settings screens, seed scripts, and tests.

### Roles

Grant:

```ts
await author.roles.grant({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

List:

```ts
const roles = await author.roles.list({
  entityType: "User",
  entityId: "user_1",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

Revoke:

```ts
await author.roles.revoke({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

### Direct permissions

Grant:

```ts
await author.permissions.grant({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
  effect: "allow",
});
```

List:

```ts
const permissions = await author.permissions.list({
  entityType: "User",
  entityId: "user_1",
  resourceType: "Project",
  resourceId: "project_1",
});
```

Revoke:

```ts
await author.permissions.revoke({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
});
```

### Relations

Create:

```ts
await author.relations.create({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
```

List:

```ts
const relations = await author.relations.list({
  subjectType: "User",
  subjectId: "user_1",
  objectType: "Project",
  objectId: "project_1",
});
```

Delete:

```ts
await author.relations.delete({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
```

Prefer management helpers over raw DB writes.

## Parent checks

Use parent checks when child resources inherit access from organization/workspace/folder/account.

```ts
allow("organization admins can update projects", async (ctx) => {
  if (ctx.resource.type !== "Project" || ctx.action !== "update") return false;

  return ctx.parents.hasRole({
    role: "admin",
    objectType: "Organization",
    objectId: ctx.resource.data.organizationId,
  });
});
```

Available helpers:

```ts
ctx.parents.getRequired({ objectType: "Organization", objectId: "org_1" });
ctx.parents.hasRole({ role: "admin", objectType: "Organization", objectId: "org_1" });
ctx.parents.hasPermission({ action: "update", objectType: "Organization", objectId: "org_1" });
ctx.parents.hasRelation({ relation: "member", objectType: "Organization", objectId: "org_1" });
```

## Entitlements and subscriptions

Use this for paid plans, feature flags, and quotas.

```ts
allow("paid plans can export projects", async (ctx) => {
  if (ctx.resource.type !== "Project" || ctx.action !== "export") return false;
  return ctx.features.has("project_export");
});
```

Limit check:

```ts
allow("workspace is within project limit", async (ctx) => {
  return ctx.limits.within("projects", 1);
});
```

Helpers:

```ts
await ctx.subscription.plan();
await ctx.features.has("feature_name");
await ctx.features.list();
await ctx.limits.get("projects");
await ctx.limits.within("projects", 1);
await ctx.limits.remaining("projects");
```

## Backend enforcement

Always enforce on the backend before mutation or sensitive read.

### Generic pattern

```ts
const user = await getCurrentUser(request);
const project = await getProject(params.projectId);

await author.as("User", user).can("update").on("Project", project).throw();

await updateProject(project.id, input);
```

### Express

```ts
import { requireCan } from "author-js/express";
```

Use adapter middleware where it fits. Otherwise use the generic pattern inside the handler.

### Hono

```ts
import { requireCan } from "author-js/hono";
```

### Fastify

```ts
import { requireCan } from "author-js/fastify";
```

### Elysia

```ts
import { requireCan } from "author-js/elysia";
```

### Next.js server

```ts
import { assertCan, requireCan } from "author-js/next/server";
```

Route handler/server action pattern:

```ts
await assertCan({
  author,
  entityType: "User",
  entity: user,
  action: "update",
  resourceType: "Project",
  resource: project,
});
```

Then mutate.

## React UI

Use React checks to hide/show controls only.

```tsx
import { AuthorProvider, Can, Cannot, useCan, useCannot } from "author-js/react";
```

Provider:

```tsx
<AuthorProvider authorization={author} entityType="User" entity={user}>
  {children}
</AuthorProvider>
```

Show if allowed:

```tsx
<Can do="update" on="Project" resource={project} fallback={null}>
  <EditProjectButton />
</Can>
```

Show if denied:

```tsx
<Cannot do="delete" on="Project" resource={project}>
  <UpgradeOrAskAdminMessage />
</Cannot>
```

Hook:

```tsx
const { allowed, loading, decision } = useCan({
  do: "update",
  on: "Project",
  resource: project,
});
```

Next.js client components:

```tsx
import { AuthorProvider, Can, Cannot, useCan } from "author-js/next/client";
```

## Testing

Use the app's existing test runner. With Bun:

```ts
import { expect, test } from "bun:test";
import { author } from "../src/authorization/author";

test("project owners can update their project", async () => {
  const allowed = await author.as("User", { id: "u1", role: "member" }).can("update").on("Project", {
    id: "p1",
    ownerId: "u1",
    organizationId: "org1",
    status: "draft",
  });

  expect(allowed).toBe(true);
});

test("non-owners cannot update projects", async () => {
  const allowed = await author.as("User", { id: "u2", role: "member" }).can("update").on("Project", {
    id: "p1",
    ownerId: "u1",
    organizationId: "org1",
    status: "draft",
  });

  expect(allowed).toBe(false);
});
```

Minimum useful coverage:

- one allowed case
- one denied case for security-sensitive rules
- backend mutation rejects unauthorized user

Run the smallest relevant checks. With Bun:

```bash
bun run fmt:check
bun run lint
bun run typecheck
bun test
```

## Agent workflow

1. Inspect the app's stack and models.
2. Pick the smallest authorization model that fits the requested feature.
3. Create one central author module.
4. Define only needed entities/resources/actions.
5. Add named policies.
6. Enforce backend checks before sensitive reads/mutations.
7. Add React gates only for UI affordances.
8. Add store only if persisted roles/permissions/relations are needed.
9. Add Redis only if decision caching is needed.
10. Add one focused test.
11. Run relevant checks.

## Common mistakes

Avoid:

- React-only authorization
- rewriting the app's auth/session system
- adding Redis before there is a cache need
- adding every possible resource/action upfront
- generic wrappers like `PermissionService` before there is repetition
- raw DB writes instead of management helpers
- forgetting that `deny` overrides `allow`
- making context optional just to silence TypeScript
- checking `resource.data` without checking `resource.type`

## Final response format

Keep it short:

- files changed
- rule enforced
- checks run
- skipped complexity and when to add it
