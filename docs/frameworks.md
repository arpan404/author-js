# Framework adapters

Backend adapters are the real security boundary.

## Express

```ts
import { requireCan } from "author-js/express";

app.patch(
  "/projects/:id",
  requireCan({
    author,
    entity: (req) => req.user,
    action: "update",
    resourceType: "Project",
    resource: async (req) => db.project.findUniqueOrThrow({ where: { id: req.params.id } }),
  }),
  handler,
);
```

## Hono

```ts
import { requireCan } from "author-js/hono";

app.patch("/projects/:id", requireCan({ author, entity, action: "update", resourceType: "Project", resource }), handler);
```

## Fastify

```ts
import { requireCan } from "author-js/fastify";

fastify.patch("/projects/:id", { preHandler: requireCan({ author, entity, action: "update", resourceType: "Project", resource }) }, handler);
```

## Elysia

```ts
import { requireCan } from "author-js/elysia";

new Elysia().patch(
  "/projects/:id",
  handler,
  { beforeHandle: requireCan({ author, entity, action: "update", resourceType: "Project", resource }) },
);
```

## Next.js

```ts
import { assertCan } from "author-js/next/server";

await assertCan({ author, entity: user, action: "update", resourceType: "Project", resource: project });
```
