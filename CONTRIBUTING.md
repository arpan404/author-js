# Contributing

Thanks for helping improve Author JS.

## Development

```bash
bun install
bun run check
```

Use Bun for scripts and dependency management.

## Pull requests

Keep changes focused. Include tests for behavior changes.

Before opening a PR:

- run `bun run check`
- update docs when public APIs change
- avoid new dependencies unless necessary

## Code style

- strict TypeScript
- no `any` or unsafe casts
- small functions and files
- core must not import framework or database adapters
