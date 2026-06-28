---
name: author-js
description: Build, review, or refactor authorization using author.js. Use when adding policies, entities, resources, roles, permissions, relations, parent-resource checks, subscription entitlements, framework middleware, React authorization UI, stores, caching, tests, or migrations for the author.js TypeScript authorization framework.
---

# author.js

Use this skill for any app using author.js, the TypeScript-first authorization framework.

## Canonical docs

Prefer local docs when available in the repo. If missing or stale, look up the GitHub docs.

Local paths:

- `README.md`
- `docs/README.md`
- `docs/core.md`
- `docs/management.md`
- `docs/adapters.md`
- `docs/react.md`
- `docs/frameworks.md`
- `docs/testing.md`
- `docs/publishing.md`

GitHub docs:

- Overview: https://github.com/arpan404/author-js#readme
- Docs index: https://github.com/arpan404/author-js/blob/main/docs/README.md
- Core: https://github.com/arpan404/author-js/blob/main/docs/core.md
- Management API: https://github.com/arpan404/author-js/blob/main/docs/management.md
- Adapters: https://github.com/arpan404/author-js/blob/main/docs/adapters.md
- React: https://github.com/arpan404/author-js/blob/main/docs/react.md
- Frameworks: https://github.com/arpan404/author-js/blob/main/docs/frameworks.md
- Testing: https://github.com/arpan404/author-js/blob/main/docs/testing.md
- Publishing: https://github.com/arpan404/author-js/blob/main/docs/publishing.md
- Source: https://github.com/arpan404/author-js
- npm: https://www.npmjs.com/package/author-js

## Install

```bash
bun add author-js
```

Add adapter peer dependencies only when used:

```bash
bun add pg mongodb redis react
```

Use Bun commands. Do not use npm, pnpm, yarn, or Vite unless the project already requires them.

## Core pattern

```ts
import { allow, createAuthor, defineContext, defineEntity, defineResource } from "author-js";

type User = { id: string; role: "admin" | "member" };
type Project = { id: string; ownerId: string; organizationId: string };
type AuthContext = { organizationId: string };

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
});

const context = defineContext<AuthContext>();

export const author = createAuthor({
  context,
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  policies: [
    allow("admins can do anything", ({ entity }) => entity.role === "admin"),
    allow("owners can update projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && resource.data.ownerId === entity.id;
    }),
  ],
});

await author.as("User", user).can("update").on("Project", project).throw();
```

## Design rules

- Model real product concepts: `User`, `Organization`, `Project`, `Document`; not generic `Thing`.
- Require explicit entity/resource types: `author.as("User", user).can("read").on("Project", project)`.
- Keep authorization centralized. Do not scatter ad-hoc `if (user.role...)` checks through routes/components.
- Use named policies. Policy names should explain the business rule.
- Put broad denies before broad allows only when deny semantics are intentional. `deny` overrides `allow`.
- Prefer small policies over one giant policy function.
- Use TypeScript discriminated checks: inspect `resource.type` before reading `resource.data` fields.
- Do not use `any`. Define entity, resource, and context types.
- Treat backend checks as authoritative. UI checks are for rendering only.
- Add the smallest test that proves the policy behavior.

## When to use each model

- RBAC: stable roles like `admin`, `member`, `billing_admin`.
- ABAC: object attributes like owner, status, visibility, region, or plan.
- ReBAC: relationships like owner/member/viewer across resources.
- Parent checks: inheritance from an organization, workspace, folder, or account.
- Entitlements: plan features, limits, quota, and subscription gates.

Combine them when needed, but do not add a model before the product needs it.

## Management API

Use management helpers for admin screens, setup scripts, and tests:

```ts
await author.roles.grant({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});

await author.permissions.grant({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
  effect: "allow",
});

await author.relations.create({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
```

Use these instead of writing directly to adapter tables/collections unless doing a migration.

## Parent checks

Use parent helpers inside policies when permissions inherit from a parent resource:

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

- `ctx.parents.getRequired`
- `ctx.parents.hasRole`
- `ctx.parents.hasPermission`
- `ctx.parents.hasRelation`

## Entitlements

Use subscription helpers for plan-aware authorization:

```ts
allow("paid plans can export", async (ctx) => {
  if (ctx.resource.type !== "Project" || ctx.action !== "export") return false;
  return ctx.features.has("project_export");
});

allow("within project limit", async (ctx) => {
  return ctx.limits.within("projects", 1);
});
```

Available helpers:

- `ctx.subscription.plan`
- `ctx.features.has(name)`
- `ctx.features.list()`
- `ctx.limits.get(name)`
- `ctx.limits.within(name, amount)`
- `ctx.limits.remaining(name)`

## Adapters

Use the memory store for tests and simple apps:

```ts
import { memoryStore } from "author-js";
```

Use real stores when grants must persist:

```ts
import { postgresStore } from "author-js/postgres";
import { mongodbStore } from "author-js/mongodb";
```

Use Redis cache only when decision checks are hot or app instances are distributed:

```ts
import { redisCache } from "author-js/redis";
```

Do not add Redis just because it exists.

## Frameworks

Backend enforcement belongs in route handlers/middleware.

Imports:

```ts
import { requireCan } from "author-js/express";
import { requireCan } from "author-js/hono";
import { requireCan } from "author-js/fastify";
import { requireCan } from "author-js/elysia";
import { assertCan, requireCan } from "author-js/next/server";
```

For mutations, call `.throw()` or `assertCan` before changing data.

## React

UI checks are not security boundaries.

```tsx
import { AuthorProvider, Can, Cannot, useCan } from "author-js/react";

<AuthorProvider authorization={author} entityType="User" entity={user}>
  <Can do="update" on="Project" resource={project} fallback={null}>
    <EditProjectButton />
  </Can>
</AuthorProvider>;
```

Next.js client components:

```tsx
import { AuthorProvider, Can } from "author-js/next/client";
```

## Testing

Use the smallest test proving the rule:

```ts
import { expect, test } from "bun:test";

test("owners can update their project", async () => {
  const allowed = await author.as("User", { id: "u1", role: "member" }).can("update").on("Project", {
    id: "p1",
    ownerId: "u1",
    organizationId: "org1",
  });

  expect(allowed).toBe(true);
});
```

Local checks:

```bash
bun run fmt:check
bun run lint
bun run typecheck
bun test
```

Real adapter tests when changing PostgreSQL, MongoDB, Redis, Docker, or workflow code:

```bash
docker compose up -d --wait
bun run test:integration
docker compose down
```

## Review checklist

Before finishing author.js work:

- Is every backend mutation protected by an authorization check?
- Are entity/resource/action names explicit and typed?
- Are policies named after business rules?
- Are UI checks mirrored by backend checks where needed?
- Did cache invalidation happen after role, permission, or relation writes?
- Did the change avoid `any` and unsafe casts?
- Is there one focused test for each new rule?
- Did you run `bun run fmt:check && bun run lint && bun run typecheck`?

## Common mistakes

- Checking only in React and forgetting the API.
- Writing raw role queries instead of using `author.roles.*`.
- Creating a generic `PermissionService` wrapper before the app needs it.
- Adding Redis caching before measuring hot authorization paths.
- Using stringly typed resource names outside `defineResource`/checks.
- Forgetting that `deny` overrides `allow`.
- Hiding missing context by making fields optional.
