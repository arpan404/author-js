# Adapters

Author JS keeps persistence and caching behind small interfaces.

- **Stores** persist authorization data: roles, permissions, relations, and audit logs.
- **Caches** store evaluated decisions for a short time.

Use only the adapters your app needs.

## Stores

### Memory

Use memory for tests and local examples.

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

Memory data is process-local and disappears when the process exits.

### PostgreSQL

```ts
import { postgresStore } from "author-js/postgres";

const store = postgresStore({
  connectionString: process.env.DATABASE_URL,
});
```

You can also pass an existing pg-compatible client:

```ts
const store = postgresStore({ client });
```

The SQL schema is published with the package:

```txt
author-js/postgres/schema.sql
```

It creates:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

`author-js/postgres` uses `pg`, so keep it out of edge runtimes.

### MongoDB

```ts
import { ensureMongoIndexes, mongodbStore } from "author-js/mongodb";

const store = mongodbStore({
  client,
  database: "my_app",
});

await ensureMongoIndexes({ client, database: "my_app" });
```

Run `ensureMongoIndexes` during setup or migrations, not during every request.

Mongo collections:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

## Audit logs

If the store implements `writeAuditLog`, Author JS calls it after each decision.

Audit logs help answer:

- why was this action allowed?
- which policy matched?
- who accessed this resource?

For high-volume apps, consider a custom store that queues or samples audit writes.

## Decision caching

Decision caching is optional. It is useful when the same backend check runs many times in a short period.

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

### Redis

```ts
import { redisCache } from "author-js/redis";

const cache = redisCache({
  client: Bun.redis,
  prefix: "my-app-auth",
});

const author = createAuthor({
  cache,
  cacheTtlMs: 30_000,
  entities,
  resources,
  policies,
});
```

The Redis adapter accepts a minimal client with `get`, `set`, and `del`, so it works with Redis-like clients without coupling Author JS to one Redis package.

### Invalidation

Clear through the author instance when the cache supports it:

```ts
await author.invalidate();
```

Delete a specific key when you have one:

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

Invalidate after changes that affect authorization:

- role grant or revoke
- permission grant or revoke
- relation create or delete
- plan change
- tenant or ownership change

### Cache key safety

Cache keys are namespaced and SHA-256 hashed. The input parts are length-delimited before hashing, so similar strings cannot accidentally collapse into the same key.

The key includes:

- entity type and ID
- action
- resource type and ID
- mode
- context
- resource snapshot

Use short TTLs for permission-sensitive applications.
