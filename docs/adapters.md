# Store adapters

Core only depends on the `AuthorStore` interface. Use the in-memory store for tests, PostgreSQL or MongoDB for real apps.

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
