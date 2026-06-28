# Author JS

[![CI](https://github.com/arpan404/author-js/actions/workflows/ci.yml/badge.svg)](https://github.com/arpan404/author-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/author-js.svg)](https://www.npmjs.com/package/author-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Author JS is a TypeScript-first authorization toolkit for apps that need one clear permission model across API routes, server actions, React UI, and database-backed grants.

It is built around a boring question:

> Can this entity do this action on this resource, right now?

```ts
const allowed = await author
  .as(user)
  .can("update")
  .on("Project", project);
```

Frontend checks are useful for hiding buttons. Backend checks are the security boundary.

## Why Author JS?

Most SaaS apps outgrow simple `user.role === "admin"` checks. You eventually need:

- RBAC: admins, owners, members, viewers
- ABAC: ownership, visibility, tenant, IP, time, feature flags
- ReBAC: user is owner/member/viewer of a specific object
- parent checks: project belongs to organization, document belongs to folder
- UI checks in React without duplicating backend logic
- adapter-backed grants in PostgreSQL, MongoDB, Redis, or memory for tests

Author JS keeps those as regular TypeScript policies instead of a separate policy language.

## Install

```bash
bun add author-js
```

Optional adapters:

```bash
bun add pg react
```

## Quick start

```ts
import { allow, createAuthor, defineEntity, defineResource } from "author-js";

type User = {
  id: string;
  role: "admin" | "member";
};

type Project = {
  id: string;
  ownerId: string;
  orgId: string;
  visibility: "public" | "private";
};

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
  parents: {
    organization: {
      type: "Organization",
      id: (project) => project.orgId,
    },
  },
});

export const author = createAuthor({
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  policies: [
    allow("admins can do anything", ({ entity }) => entity.role === "admin"),

    allow("owners can update their projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && entity.id === resource.data.ownerId;
    }),

    allow("organization admins can update projects", async (ctx) => {
      if (ctx.resource.type !== "Project") return false;
      if (ctx.action !== "update") return false;
      return ctx.parents.hasRole("admin", "organization");
    }),
  ],
});
```

Use it in backend code:

```ts
await author.as(user).can("update").on("Project", project).throw();
// continue only when allowed
```

Use it in UI code:

```tsx
import { AuthorProvider, Can } from "author-js/react";

<AuthorProvider authorization={author} entity={user}>
  <Can do="update" on="Project" resource={project}>
    <EditButton />
  </Can>
</AuthorProvider>;
```

## Subscription features and limits

Add plan-based entitlements without changing the check API:

```ts
const author = createAuthor({
  entities,
  resources,
  entitlements: {
    plan: async ({ entity }) => entity.plan,
    features: {
      free: ["projects.read"],
      pro: ["projects.read", "projects.create"],
    },
    limits: {
      free: { projects: 3 },
      pro: { projects: 100 },
    },
  },
  policies: [
    allow("plan can create projects", async (ctx) => {
      if (ctx.action !== "create") return false;
      if (!(await ctx.features.has("projects.create"))) return false;

      const used = await countProjects(ctx.entity.id);
      return ctx.limits.within("projects", { used });
    }),
  ],
});
```

## Decisions, not just booleans

```ts
const decision = await author
  .as(user)
  .can("update")
  .on("Project", project)
  .explain();

console.log(decision.allowed);
console.log(decision.reason);
console.log(decision.matchedPolicies);
```

Rules are evaluated with deny-overrides-allow semantics:

1. run all policies
2. any matching deny wins
3. otherwise any matching allow wins
4. otherwise deny by default

## Imports

```ts
import { createAuthor } from "author-js";
import { postgresStore } from "author-js/postgres";
import { mongodbStore } from "author-js/mongodb";
import { redisCache } from "author-js/redis";
import { AuthorProvider, Can } from "author-js/react";
import { requireCan } from "author-js/express";
```

Available entrypoints:

- `author-js` / `author-js/core`
- `author-js/postgres`
- `author-js/mongodb`
- `author-js/redis`
- `author-js/react`
- `author-js/express`
- `author-js/hono`
- `author-js/fastify`
- `author-js/elysia`
- `author-js/next`

## Documentation

- [Core concepts](./docs/core.md)
- [Store and cache adapters](./docs/adapters.md)
- [React usage](./docs/react.md)
- [Framework middleware](./docs/frameworks.md)
- [Publishing](./docs/publishing.md)
- [Security policy](./SECURITY.md)

## Development

```bash
bun install
bun run check
```

## License

MIT © Arpan Bhandari
