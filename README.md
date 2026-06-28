# Author JS

TypeScript-first authorization for frontend and backend apps.

Author JS gives you one authorization model across your API, React UI, and database-backed permissions.

## Install

```bash
npm install author-js
```

## Basic usage

```ts
import { allow, createAuthor, defineEntity, defineResource } from "author-js";

type User = { id: string; role: "admin" | "member" };
type Project = { id: string; ownerId: string };

const author = createAuthor({
  entities: {
    User: defineEntity<User>()({ type: "User", id: (user) => user.id }),
  },
  resources: {
    Project: defineResource<Project>()({
      type: "Project",
      id: (project) => project.id,
      actions: ["read", "update", "delete"] as const,
    }),
  },
  policies: [
    allow("admin can do anything", ({ entity }) => entity.role === "admin"),
    allow("owner can update project", ({ entity, resource, action }) =>
      action === "update" && entity.id === resource.data.ownerId,
    ),
  ],
});

const allowed = await author
  .as({ id: "user_1", role: "member" })
  .can("update")
  .on("Project", { id: "project_1", ownerId: "user_1" })
  .allowed();
```

Frontend checks are only UX. Enforce authorization on the backend.

## Packages

- `author-js` / `author-js/core`
- `author-js/postgres`
- `author-js/mongodb`
- `author-js/react`
- `author-js/express`, `author-js/hono`, `author-js/fastify`, `author-js/next`
