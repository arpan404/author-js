# Frameworks

Framework adapters put authorization at your backend route boundary.

Every adapter follows the same shape:

1. resolve the entity from the request
2. load the actual resource from your database
3. evaluate Author JS
4. return 403 when denied

Always authorize against the loaded resource, not only route params. The loaded resource contains ownership, tenant, visibility, parent IDs, and other attributes your policies need.

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
    resource: (req) => db.project.findUniqueOrThrow({ where: { id: req.params.id } }),
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
    resource: (c) => loadProject(c.req.param("id")),
  }),
  (c) => c.json({ ok: true }),
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
      resource: (request) => loadProject(request.params.id),
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
      resource: (ctx) => loadProject(ctx.params.id),
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
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

`assertCan` throws `AuthorizationDeniedError` when denied. Convert that error to a 403 response in your app error handler.

## Passing usage and request data

Adapters accept a `context` function. Use it for values policies need but resources do not contain.

```ts
requireCan({
  author,
  entity: (req) => req.user,
  action: "create",
  resourceType: "Project",
  resource: (req) => req.organization,
  context: async (req) => ({
    projectCount: await countProjects(req.user.id),
    ip: req.ip,
  }),
});
```
