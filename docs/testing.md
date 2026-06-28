# Testing and quality gates

author.js uses Bun for local development and CI.

## Local checks

Run the standard quality gate before opening a PR:

```bash
bun run check
```

That runs:

1. TypeScript typecheck
2. unit and adapter tests
3. package build

## Benchmarks

Run the policy-scaling benchmark:

```bash
bun run bench:policy
```

Use `AUTHOR_BENCH_POLICY_COUNTS` for larger stress runs:

```bash
AUTHOR_BENCH_POLICY_COUNTS=10000,100000 bun run bench:policy
```

The benchmark compares unscoped policies, scoped policies where all policies are relevant, and scoped sparse policy sets where most policies target other entity/resource/action combinations.

## Formatting and linting

```bash
bun run fmt
bun run fmt:check
bun run lint
bun run typecheck
```

Biome handles formatting and linting.

## Real service integration tests

The normal test suite uses fakes for fast feedback. Real PostgreSQL, MongoDB, and Redis integration tests are available through Docker.

```bash
docker compose up -d --wait
bun run test:integration
docker compose down
```

Default URLs:

```txt
POSTGRES_URL=postgres://author:author@localhost:54329/author_js
MONGODB_URL=mongodb://localhost:27029
REDIS_URL=redis://localhost:63799
```

The integration suite verifies real adapter behavior for:

- PostgreSQL grant/list/revoke, relations, audit logs
- MongoDB permissions and index creation
- Redis cache set/get/delete/TTL

## Git hooks

Husky is installed on `bun install` through the `prepare` script.

### pre-commit

```bash
bun run fmt:check && bun run lint && bun run typecheck
```

### pre-push

```bash
bun run check
docker compose up -d --wait
bun run test:integration
docker compose down
```

The pre-push hook is intentionally heavier because it protects `main` from broken adapters.
