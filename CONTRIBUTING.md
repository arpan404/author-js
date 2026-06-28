# Contributing

## Setup

```bash
bun install
bun run check
```

## Pull requests

Keep changes focused. Add tests for behavior changes.

Before opening a PR:

- run `bun run check`
- update docs when public APIs change
- avoid new dependencies unless necessary

## Code style

- strict TypeScript
- no `any` or unsafe casts
- small functions and files
- core must not import framework or database adapters
