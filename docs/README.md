# Documentation

author.js is a TypeScript authorization library. You define entities, resources, and policies once, then check permissions in your API and UI.

```ts
await author.as("User", user).can("update").on("Project", project);
```

## Start here

New to author.js? Read in this order:

1. [Core](./core.md) — model your app, write policies, check permissions
2. [Management](./management.md) — grant, revoke, and list roles, permissions, and relations
3. [Adapters](./adapters.md) — persist roles and cache decisions (when you need them)
4. [React](./react.md) or [Frameworks](./frameworks.md) — wire checks into your UI or API

## Guides

| Guide | What you'll learn |
| --- | --- |
| [Core](./core.md) | Entities, resources, policies, plans, parent checks, project layout |
| [Management](./management.md) | Roles, direct permissions, relations, revoking, settings-page patterns |
| [Adapters](./adapters.md) | Memory, PostgreSQL, MongoDB stores; Redis caching |
| [React](./react.md) | `AuthorProvider`, `Can`, `Cannot`, hooks |
| [Frameworks](./frameworks.md) | Express, Hono, Fastify, Elysia, Next.js |

## Packages

| Import | Use when |
| --- | --- |
| `author-js` | Defining and evaluating authorization |
| `author-js/postgres` | PostgreSQL-backed roles and permissions |
| `author-js/mongodb` | MongoDB-backed roles and permissions |
| `author-js/redis` | Shared decision cache across instances |
| `author-js/react` | React apps (any bundler) |
| `author-js/next/client` | Next.js client components |
| `author-js/next/server` | Next.js route handlers and server actions |
| `author-js/express` | Express routes |
| `author-js/hono` | Hono routes |
| `author-js/fastify` | Fastify routes |
| `author-js/elysia` | Elysia routes |

## Next.js App Router

Typical setup:

```txt
src/authorization/     # shared author instance and policies
app/api/...            # assertCan in route handlers
app/.../page.tsx       # assertCan in server components
components/...         # Can / Cannot in client components via author-js/next/client
```

Server:

```ts
import { assertCan } from "author-js/next/server";
import { author } from "@/authorization/author";

await assertCan({
  author,
  entityType: "User",
  entity: user,
  action: "update",
  resourceType: "Project",
  resource: project,
});
```

Client:

```tsx
import { Can } from "author-js/next/client";

<AuthorProvider authorization={author} entityType="User" entity={user}>
  <Can do="update" on="Project" resource={project}>
    <EditButton />
  </Can>
</AuthorProvider>
```

See [Frameworks](./frameworks.md) and [React](./react.md) for full examples.

## Project

| Doc | Purpose |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Development setup and PR guidelines |
| [Security](../SECURITY.md) | Vulnerability reporting |
| [Publishing](./publishing.md) | npm release process |
| [Changelog](../CHANGELOG.md) | Version history |
