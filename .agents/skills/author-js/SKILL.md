---
name: author-js
description: Use author.js inside an application. Load when an AI agent is adding authorization to a product, defining app entities/resources/policies, wiring backend route protection, rendering React/Next.js permission-aware UI, using PostgreSQL/MongoDB stores, Redis decision caching, roles, permissions, relations, parent checks, subscription entitlements, or tests.
---

# author.js app integration skill

You are helping build an application that uses author.js. Do not act like you are maintaining author.js itself unless the user explicitly says they are editing the framework repo.

Your job: add the smallest correct authorization layer to the app, using author.js APIs and the app's existing stack.

## Look up docs when needed

If this project has author.js docs checked in, read them first. Most app repos will not, so use the GitHub docs below when details are needed.

Primary docs:

- Overview: https://github.com/arpan404/author-js#readme
- Docs index: https://github.com/arpan404/author-js/blob/main/docs/README.md
- Core: https://github.com/arpan404/author-js/blob/main/docs/core.md
- Management API: https://github.com/arpan404/author-js/blob/main/docs/management.md
- Adapters: https://github.com/arpan404/author-js/blob/main/docs/adapters.md
- React: https://github.com/arpan404/author-js/blob/main/docs/react.md
- Frameworks: https://github.com/arpan404/author-js/blob/main/docs/frameworks.md
- Testing: https://github.com/arpan404/author-js/blob/main/docs/testing.md
- npm: https://www.npmjs.com/package/author-js
- Source: https://github.com/arpan404/author-js

Use internet/GitHub lookup when:

- an API shape is uncertain
- the installed author.js version differs from docs
- framework adapter syntax is needed
- migrations/schema details are needed
- peer dependency requirements are unclear

## First inspect the app

Before writing code, identify:

1. package manager and runtime (`bun`, npm, pnpm, yarn)
2. framework: Next.js, React SPA, Express, Hono, Fastify, Elysia, etc.
3. auth provider/session shape: Clerk, NextAuth, custom JWT, database session, etc.
4. data model: user/account/org/project/document/resource IDs
5. persistence: PostgreSQL, MongoDB, SQLite, in-memory, etc.
6. where backend mutations happen
7. where UI should hide/show actions

Do not create a huge architecture. Add one central author module and wire it where needed.

## Install

Use the app's package manager. If the app uses Bun:

```bash
bun add author-js
```

Add adapter peer dependencies only when actually used:

```bash
bun add pg mongodb redis react
```

Do not add Redis, PostgreSQL, MongoDB, React, or framework adapters unless the app already uses them or the user asked for them.

## Recommended app file layout

Use existing conventions. If none exist, keep it boring:

```txt
src/authorization/author.ts      # entities, resources, policies, createAuthor
src/authorization/current-user.ts # optional session -> app user mapping
```

For Next.js, this is also fine:

```txt
src/lib/author.ts
```

One file is enough until it becomes painful.

## Core app pattern

```ts
import { allow, createAuthor, defineContext, defineEntity, defineResource } from "author-js";

type User = { id: string; role: "admin" | "member" };
type Project = { id: string; ownerId: string; organizationId: string };
type AuthContext = { organizationId?: string };

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
    allow("project owners can update projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && resource.data.ownerId === entity.id;
    }),
  ],
});
```

Use it at the backend boundary:

```ts
await author.as("User", user).can("update").on("Project", project).throw();
```

## Design rules for app agents

- Protect backend mutations first. UI checks are convenience, not security.
- Model product words: `User`, `Organization`, `Project`, `Document`; not `Thing` or `Object`.
- Use explicit entity/resource types: `author.as("User", user).can("read").on("Project", project)`.
- Keep policies centralized. Do not scatter `if (user.role === ...)` through routes.
- Name policies as business rules.
- Prefer a few small policies over one giant policy.
- Check `resource.type` before reading `resource.data` fields.
- Use typed context with `defineContext<T>()` for request/session data.
- Avoid `any`. Match the app's existing model types where possible.
- Do not invent admin panels, migrations, wrappers, or service classes unless needed.
- Add one focused test for each new rule.

## Choose the simplest authorization model

Use the first model that fits:

- Owner check: `resource.ownerId === user.id`
- RBAC: roles like `admin`, `member`, `billing_admin`
- ABAC: attributes like status, visibility, tenant, plan, region
- ReBAC: user-resource relations like owner/member/viewer
- Parent checks: permissions inherited from organization/workspace/folder/account
- Entitlements: features, plan limits, subscription gates

Do not implement all models “for later”.

## Stores and caching

Default for tests/simple apps:

```ts
import { memoryStore } from "author-js";
```

PostgreSQL persistence:

```ts
import { postgresStore } from "author-js/postgres";

const store = postgresStore({ connectionString: process.env.POSTGRES_URL! });
```

MongoDB persistence:

```ts
import { mongodbStore } from "author-js/mongodb";
```

Redis decision cache:

```ts
import { redisCache } from "author-js/redis";
```

PostgreSQL + Redis is a normal production setup:

```ts
export const author = createAuthor({
  entities,
  resources,
  policies,
  store: postgresStore({ connectionString: process.env.POSTGRES_URL! }),
  cache: redisCache({ url: process.env.REDIS_URL!, prefix: "author:" }),
  cacheTtlMs: 30_000,
});
```

Use:

- PostgreSQL/MongoDB for persisted roles, permissions, relations, audit logs
- Redis for hot decision caching across app instances

Do not add Redis until there is a real cache need or the user requests it.

## Management API for app admin features

Use management helpers for settings pages, admin tools, seed scripts, and tests:

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

Prefer these helpers over raw adapter writes.

## Parent checks

Use parent helpers when child resources inherit access from an organization, workspace, folder, or account:

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

Helpers:

- `ctx.parents.getRequired`
- `ctx.parents.hasRole`
- `ctx.parents.hasPermission`
- `ctx.parents.hasRelation`

## Entitlements and subscriptions

Use subscription helpers for paid features and quotas:

```ts
allow("paid plans can export", async (ctx) => {
  if (ctx.resource.type !== "Project" || ctx.action !== "export") return false;
  return ctx.features.has("project_export");
});

allow("workspace is within project limit", async (ctx) => {
  return ctx.limits.within("projects", 1);
});
```

Helpers:

- `ctx.subscription.plan`
- `ctx.features.has(name)`
- `ctx.features.list()`
- `ctx.limits.get(name)`
- `ctx.limits.within(name, amount)`
- `ctx.limits.remaining(name)`

## Backend framework wiring

Enforce checks before data changes.

Imports:

```ts
import { requireCan } from "author-js/express";
import { requireCan } from "author-js/hono";
import { requireCan } from "author-js/fastify";
import { requireCan } from "author-js/elysia";
import { assertCan, requireCan } from "author-js/next/server";
```

For Next.js route handlers/server actions, load the current user and target resource, then:

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

Then perform the mutation.

## React and Next.js UI

Use UI checks only to hide/show controls. Keep backend checks too.

```tsx
import { AuthorProvider, Can } from "author-js/react";

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

## Testing in app repos

Use the app's existing test runner. With Bun:

```ts
import { expect, test } from "bun:test";

test("project owners can update their project", async () => {
  const allowed = await author.as("User", { id: "u1", role: "member" }).can("update").on("Project", {
    id: "p1",
    ownerId: "u1",
    organizationId: "org1",
  });

  expect(allowed).toBe(true);
});
```

Minimum useful tests:

- allowed case
- denied case for the same rule when security-sensitive
- backend mutation rejects unauthorized user

Run the app's normal checks. If Bun scripts exist:

```bash
bun run fmt:check
bun run lint
bun run typecheck
bun test
```

## Agent workflow

1. Read the app's package/config/routes/models.
2. Identify the protected action the user asked for.
3. Define only the needed entities/resources/actions.
4. Add named policy/policies.
5. Wire backend enforcement.
6. Add React `Can` only if the UI needs it.
7. Add persistence/cache only if the app needs persisted grants or hot cache.
8. Add one focused test.
9. Run the smallest relevant checks.

## Common app mistakes

- Only hiding a button in React and forgetting the API check.
- Rewriting the app's auth/session system instead of adapting its current user object.
- Adding Redis before there is a cache need.
- Creating a custom `PermissionService` wrapper around author.js on day one.
- Using raw SQL/collection writes instead of `author.roles`, `author.permissions`, or `author.relations`.
- Forgetting cache invalidation after grant/revoke/relation writes.
- Making context fields optional to silence TypeScript instead of passing the real request context.
- Adding every possible action/resource instead of the one the feature needs.

## Final answer style

Tell the user:

- what file(s) changed
- which rule is enforced
- which checks ran
- anything intentionally skipped and when to add it
