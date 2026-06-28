# Store and cache adapters

Core only depends on adapter interfaces. Use stores for authorization data and caches for decision caching.

## Memory

```ts
import { memoryStore } from "author-js";

const store = memoryStore();
await store.grantRole({ entityType: "User", entityId: "u1", role: "admin" });
```

## PostgreSQL

```ts
import { postgresStore } from "author-js/postgres";

const store = postgresStore({ connectionString: process.env.DATABASE_URL });
```

Schema is exported as:

```ts
import "author-js/postgres/schema.sql";
```

Or read it from `node_modules/author-js/dist/packages/postgres/src/schema.sql`.

## MongoDB

```ts
import { ensureMongoIndexes, mongodbStore } from "author-js/mongodb";

const store = mongodbStore({ client, database: "my_app" });
await ensureMongoIndexes({ client, database: "my_app" });
```

## Audit logs

Every adapter can implement `writeAuditLog`. The core engine calls it after each decision when available.

## Decision caching

Use `memoryCache` for tests or `redisCache` for backend caching.

```ts
import { createAuthor, decisionCacheKey, memoryCache } from "author-js";
import { redisCache } from "author-js/redis";

const cache = redisCache({ client: Bun.redis, prefix: "my-app-auth" });
const author = createAuthor({ cache, cacheTtlMs: 30_000, entities, resources, policies });

await author.invalidate();

const key = await decisionCacheKey({
  entityType: "User",
  entityId: "u1",
  action: "read",
  resourceType: "Project",
  resourceId: "p1",
  mode: "backend",
  context: {},
  resource: { id: "p1" },
});
await cache.delete(key);
```

Cache keys are namespaced and SHA-256 hashed from length-delimited stable input parts to avoid collisions.
