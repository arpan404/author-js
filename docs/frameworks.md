# Framework adapters

Framework adapters help put authorization at the edge of your backend routes.

The pattern is the same everywhere:

1. resolve the entity from the request
2. resolve the action
3. load the resource from your database
4. call Author JS
5. stop with 403 if denied

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
    resource: async (req) => {
      return db.project.findUniqueOrThrow({
        where: { id: req.params.id },
      });
    },
    context: (req) => ({ ip: req.ip }),
  }),
  async (req, res) => {
    res.json({ ok: true });
  },
);
```

Denied requests return:

```json
{ "error": "Forbidden", "reason": "..." }
```

## Hono

```ts
import { requireCan } from "author-js/hono";

app.patch(
  "/projects/:id",
  requireCan({
    author,
    entity: (c) => c.get("user"),
    action: "update",
    resourceType: "Project",
    resource: async (c) => loadProject(c.req.param("id")),
  }),
  async (c) => c.json({ ok: true }),
);
```

## Fastify

```ts
import { requireCan } from "author-js/fastify";

fastify.patch(
  "/projects/:id",
  {
    preHandler: requireCan({
      author,
      entity: (request) => request.user,
      action: "update",
      resourceType: "Project",
      resource: async (request) => loadProject(request.params.id),
    }),
  },
  async () => ({ ok: true }),
);
```

## Elysia

```ts
import { Elysia } from "elysia";
import { requireCan } from "author-js/elysia";

new Elysia().patch(
  "/projects/:id",
  () => ({ ok: true }),
  {
    beforeHandle: requireCan({
      author,
      entity: (ctx) => ctx.user,
      action: "update",
      resourceType: "Project",
      resource: async (ctx) => loadProject(ctx.params.id),
    }),
  },
);
```

When denied, the hook sets `ctx.set.status = 403` and returns:

```json
{ "error": "Forbidden", "reason": "..." }
```

## Next.js

Use `assertCan` in route handlers, server actions, and server components.

```ts
import { assertCan } from "author-js/next/server";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const project = await loadProject(params.id);

  await assertCan({
    author,
    entity: user,
    action: "update",
    resourceType: "Project",
    resource: project,
  });

  await updateProject(project.id, await request.json());
  return Response.json({ ok: true });
}
```

`assertCan` throws `AuthorizationDeniedError` when denied. Map that to a 403 in your framework error handler.

## Loading resources

Always authorize against the actual resource from your database, not just route params. Route params tell you what the user asked for; the loaded resource tells you owner, tenant, visibility, parent IDs, and other attributes needed by policies.
