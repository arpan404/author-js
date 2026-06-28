# Adapters

This page covers persistence and caching adapters. For application-level grant/revoke APIs, see [Permission management](./management.md).

author.js separates authorization logic from persistence and caching.

| Adapter | Role |
| --- | --- |
| **Store** | Roles, permissions, relations, audit logs |
| **Cache** | Short-lived evaluated decisions |

Install only what your app needs.

## Stores

### Memory

For tests and local development.

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

Data is process-local and does not survive restarts.

### PostgreSQL

```ts
import { postgresStore } from "author-js/postgres";

const store = postgresStore({
  connectionString: process.env.DATABASE_URL,
});
```

Pass an existing pg-compatible client:

```ts
const store = postgresStore({ client });
```

Schema file: `author-js/postgres/schema.sql`

Tables:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

Requires `pg`. Not suitable for edge runtimes.

### MongoDB

```ts
import { ensureMongoIndexes, mongodbStore } from "author-js/mongodb";

const store = mongodbStore({
  client,
  database: "my_app",
});

await ensureMongoIndexes({ client, database: "my_app" });
```

Run `ensureMongoIndexes` during setup or migrations.

Collections:

- `author_roles`
- `author_permissions`
- `author_relations`
- `author_audit_logs`

## Audit logs

Stores that implement `writeAuditLog` receive a log entry after each decision. Each entry records the outcome, matched policies, and actor.

For high-volume apps, use a custom store that queues or samples writes.

## Decision cache

Optional. Useful when the same check runs repeatedly in a short window.

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

Accepts any client with `get`, `set`, and `del`.

### Invalidation

Clear the entire cache:

```ts
await author.invalidate();
```

Delete a specific key:

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

Invalidate after role, permission, relation, plan, tenant, or ownership changes.
