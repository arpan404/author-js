# Author JS

[![CI](https://github.com/arpan404/author-js/actions/workflows/ci.yml/badge.svg)](https://github.com/arpan404/author-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/author-js.svg)](https://www.npmjs.com/package/author-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Author JS is a TypeScript-first authorization toolkit for apps that need one clear permission model across API routes, server actions, React UI, and database-backed grants.

```ts
const allowed = await author
  .as(user)
  .can("update")
  .on("Project", project);
```

Frontend checks are for UX. Backend checks are the security boundary.

## What it supports

- RBAC: admins, owners, members, viewers
- ABAC: ownership, visibility, tenant, request context
- ReBAC: user is owner/member/viewer of a specific object
- parent checks: project → organization, document → folder
- subscription features and numeric limits
- React UI checks
- Express, Hono, Fastify, Elysia, and Next.js helpers
- Memory, PostgreSQL, MongoDB, Redis cache adapters

## Install

```bash
bun add author-js
```

Optional peer dependencies:

```bash
bun add pg react
```

## Quick start

```ts
import { allow, createAuthor, defineEntity, defineResource } from "author-js";

type User = {
  id: string;
  role: "admin" | "member";
  plan: "free" | "pro";
};

type Project = {
  id: string;
  ownerId: string;
  orgId: string;
};

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "create", "update", "delete"] as const,
  parents: {
    organization: { type: "Organization", id: (project) => project.orgId },
  },
});

export const author = createAuthor({
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  entitlements: {
    plan: ({ entity }) => entity.plan,
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
    allow("admins can do anything", ({ entity }) => entity.role === "admin"),

    allow("owners can update their projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && entity.id === resource.data.ownerId;
    }),

    allow("plan can create projects", async (ctx) => {
      if (ctx.action !== "create") return false;
      return ctx.features.has("projects.create");
    }),
  ],
});
```

Use it on the backend:

```ts
await author.as(user).can("update").on("Project", project).throw();
```

Use it in React:

```tsx
import { AuthorProvider, Can } from "author-js/react";

<AuthorProvider authorization={author} entity={user}>
  <Can do="update" on="Project" resource={project}>
    <EditButton />
  </Can>
</AuthorProvider>;
```

## Keep policies modular

Author JS does not require one giant authorization file. Split rules by feature and merge arrays.

```ts
// policies/project.ts
export const projectPolicies = [
  allow("project owners can update", ({ entity, resource, action }) => {
    if (resource.type !== "Project") return false;
    return action === "update" && entity.id === resource.data.ownerId;
  }),
] as const;
```

```ts
// authorization/author.ts
export const author = createAuthor({
  entities,
  resources,
  entitlements,
  policies: [
    ...organizationPolicies,
    ...projectPolicies,
    ...billingPolicies,
  ],
});
```

See [Core guide](./docs/core.md) for a complete structure.

## Centralize plans

Keep plans in one file so billing behavior is easy to review.

```ts
export const plans = {
  free: { features: ["projects.read"], limits: { projects: 3 } },
  pro: { features: ["projects.read", "projects.create"], limits: { projects: 100 } },
} as const;

export const entitlements = {
  plan: ({ entity }) => entity.plan,
  features: Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, plan.features])),
  limits: Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, plan.limits])),
};
```

Policies can then use:

```ts
await ctx.features.has("projects.create");
await ctx.limits.within("projects", { used: projectCount });
```

## Entry points

```ts
import { createAuthor } from "author-js";
import { postgresStore } from "author-js/postgres";
import { mongodbStore } from "author-js/mongodb";
import { redisCache } from "author-js/redis";
import { AuthorProvider, Can } from "author-js/react";
import { requireCan } from "author-js/express";
```

Available adapters:

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

- [Core guide](./docs/core.md)
- [Store and cache adapters](./docs/adapters.md)
- [React guide](./docs/react.md)
- [Framework guide](./docs/frameworks.md)
- [Publishing](./docs/publishing.md)
- [Security policy](./SECURITY.md)

## Development

```bash
bun install
bun run check
```

## License

MIT © Arpan Bhandari
