# Changelog

## Unreleased

- add `defineAuthorModule` for domain-level authorization modules
- add scoped policy metadata for entity, resource, and action preselection
- add `author.check(...)` for direct boolean checks
- add request-local memoization for repeated store and entitlement helper reads
- add custom decision cache key support
- add Tinybench policy-scaling benchmarks

## 0.1.0

Initial release:

- core authorization engine
- memory, PostgreSQL, and MongoDB stores
- React adapter
- Express, Hono, Fastify, Elysia, and Next.js helpers
- Redis decision cache
- permission management helpers for roles, permissions, and relations
- Docker-backed PostgreSQL, MongoDB, and Redis integration tests
- Husky quality gates with Biome formatting/linting
