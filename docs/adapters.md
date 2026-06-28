# Store and cache adapters

Author JS has two adapter concepts:

- **stores** keep authorization data: roles, permissions, relations, audit logs
- **caches** keep evaluated decisions for a short time

Core only depends on interfaces, so apps can bring their own database clients.

## Memory store

Use the memory store for tests, examples, and local prototypes.

```ts
import { memoryStore } from "author-js";

const store = memoryStore();

await store.grantRole({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

The memory store is process-local. It is not for production persistence.

## PostgreSQL store

Use PostgreSQL when your app already stores authorization grants in Postgres.

```ts
import { postgresStore } from "author-js/postgres";

const store = postgresStore({
  connectionString: process.env.DATABASE_URL,
});
```

Or pass a pg-compatible client:

```ts
const store = postgresStore({ client });
```

The schema is exported in the package:

```txt
author-js/postgres/schema.sql
```

It creates four tables:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

Do not import `author-js/postgres` in edge runtimes. The `pg` package is Node-only.

## MongoDB store

```ts
import { ensureMongoIndexes, mongodbStore } from "author-js/mongodb";

const store = mongodbStore({
  client,
  database: "my_app",
});

await ensureMongoIndexes({ client, database: "my_app" });
```

Mongo collections:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

Run `ensureMongoIndexes` during setup or migration time, not on every request.

## Audit logs

If a store implements `writeAuditLog`, the engine calls it after each decision.

Audit logs are useful for:

- debugging why access was granted
- answering compliance questions
- showing support/admin tooling

Keep in mind that high-volume apps may want to sample logs or write them asynchronously in a custom store.

## Decision caching

Decision caching is optional. It is best for backend checks that are repeated frequently and where a short TTL is acceptable.

```ts
import { createAuthor, memoryCache } from "author-js";

const author = createAuthor({
  cache: memoryCache(),
  cacheTtlMs: 30_000,
  entities,
  resources,
  policies,
});
```

### Redis cache

```ts
import { redisCache } from "author-js/redis";

const author = createAuthor({
  cache: redisCache({
    client: Bun.redis,
    prefix: "my-app-auth",
  }),
  cacheTtlMs: 30_000,
  entities,
  resources,
  policies,
});
```

The Redis adapter expects a small Redis-like client with `get`, `set`, and `del`.

### Cache invalidation

Clear the cache through the author instance:

```ts
await author.invalidate();
```

Or delete a known key directly from the adapter:

```ts
import { decisionCacheKey } from "author-js";

const key = await decisionCacheKey({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
  mode: "backend",
  context: {},
  resource: project,
});

await cache.delete(key);
```

### Collision avoidance

Cache keys are not naive string concatenations. They are built from:

- namespace
- entity type and ID
- action
- resource type and ID
- mode
- stable JSON context
- stable JSON resource snapshot

Those parts are length-delimited and hashed with SHA-256. This avoids accidental collisions such as `("A", "bc")` and `("Ab", "c")` producing the same key.

### When not to cache

Do not cache decisions for long periods when permissions change frequently. Prefer short TTLs and invalidate after writes like:

- role grant/revoke
- permission grant/revoke
- relation create/delete
- user tenant change
