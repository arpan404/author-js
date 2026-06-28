# Author JS

[![CI](https://github.com/arpan404/author-js/actions/workflows/ci.yml/badge.svg)](https://github.com/arpan404/author-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/author-js.svg)](https://www.npmjs.com/package/author-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

TypeScript-first authorization for SaaS apps, APIs, and React UIs.

Author JS lets you write authorization as normal TypeScript policies:

```ts
const allowed = await author.as(user).can("update").on("Project", project);
```

Use it for RBAC, ABAC, ReBAC, parent-resource checks, subscription features, limits, UI rendering, and backend enforcement.

> Frontend checks improve UX. Backend checks protect data.

## Install

```bash
bun add author-js
```

Install peer dependencies only for the adapters you use:

```bash
bun add pg react
```

## Quick example

```ts
import { allow, createAuthor, defineEntity, defineResource } from "author-js";

type User = { id: string; role: "admin" | "member" };
type Project = { id: string; ownerId: string };

const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
});

export const author = createAuthor({
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  policies: [
    allow("admins can do anything", ({ entity }) => entity.role === "admin"),
    allow("owners can update projects", ({ entity, resource, action }) => {
      if (resource.type !== "Project") return false;
      return action === "update" && entity.id === resource.data.ownerId;
    }),
  ],
});

await author.as(user).can("update").on("Project", project).throw();
```

## Packages

| Entry point | Purpose |
| --- | --- |
| `author-js` | Core API |
| `author-js/postgres` | PostgreSQL store |
| `author-js/mongodb` | MongoDB store |
| `author-js/redis` | Redis decision cache |
| `author-js/react` | React provider, components, hooks |
| `author-js/express` | Express middleware |
| `author-js/hono` | Hono middleware |
| `author-js/fastify` | Fastify pre-handler |
| `author-js/elysia` | Elysia beforeHandle helper |
| `author-js/next` | Next.js server/client helpers |

## Documentation

Start here:

1. [Core guide](./docs/core.md) — entities, resources, policies, plans, parent checks, project structure
2. [Adapters](./docs/adapters.md) — memory, PostgreSQL, MongoDB, Redis caching
3. [React](./docs/react.md) — `AuthorProvider`, `Can`, `Cannot`, `useCan`
4. [Frameworks](./docs/frameworks.md) — Express, Hono, Fastify, Elysia, Next.js

Project docs:

- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Publishing](./docs/publishing.md)

## Development

```bash
bun install
bun run check
```

## License

MIT © Arpan Bhandari
