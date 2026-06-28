---
name: typescript-best-practices
description: TypeScript rules for agents working in TS codebases
version: 1.0.0
---

## Prime directive

Type-safe, modular, readable, refactorable TS. Small files/functions, explicit boundaries, compiler-checked APIs.

## Type safety

- No `any`, `as any`, unsafe double casts (`as unknown as T`), `as T`, or `!`; prefer guards, schemas, runtime checks.
- `unknown` only at untrusted boundaries (JSON, APIs, storage, env, user input, `catch`); always narrow/parse/validate first.
- Prefer inference when source is typed; lowercase primitives; no boxed types (`String`, `Number`, `Boolean`, `Object`, `Symbol`).
- No `@ts-ignore`; `@ts-expect-error` only in tests/unavoidable edges with a short reason.
- `void` for ignored callbacks; `never` exhaustiveness for unions.

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
function assertNever(v: never): never { throw new Error(`Unhandled: ${String(v)}`); }
```

## Boundaries & validation

- Never trust `response.json()`, `localStorage`, env, URL params, cookies, SDK payloads.
- Parse once at boundary; pass typed values inward. Prefer Zod, Valibot, ArkType, or guards.

```ts
const data: unknown = await response.json();
const user = UserSchema.parse(data);
```

## Advanced types

- Discriminated unions for state/variants/workflows; literals over broad `string`; `as const`; `satisfies` over casts.
- Branded types for IDs/units/money; `Readonly<T>` / `readonly T[]` when mutation not needed.
- Mapped/conditional/indexed/template-literal types only when they reduce duplication; no clever types; explicit domain types over huge anonymous objects.

```ts
type UserId = string & { readonly __brand: "UserId" };
type LoadState<T> =
  | { status: "idle" } | { status: "loading" }
  | { status: "success"; data: T } | { status: "error"; error: Error };
```

## Generics

- Preserve types across I/O; every type param used; no return-only generics; prefer inference.
- Constrain with `extends`; use `keyof` for property selection; simple generics over complex overloads.

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
```

## API design

- Unions over overloads when one arg varies; optional params over overloads for trailing args (same return); overloads: most→least specific.
- No boolean traps (`createUser(u, true)`); options objects for 3+ params.
- Typed results for expected failures; throw for exceptional; minimal public exports.

```ts
createUser(user, { sendWelcomeEmail: true });
```

## Structure & size

- One responsibility per file; split before mixing concerns or file becomes hard to scan. Feature folders; small, truly reusable shared utils; co-locate types/schemas/tests/helpers; no global `types.ts` dump.
- Small single-purpose functions; refactor large ones before adding logic; extract validation/mapping/formatting/IO/rules; guard clauses over deep nesting.
- No large unrelated classes; composition over inheritance; classes only for invariants/state; modules/named exports, not static namespace classes.

```txt
src/features/auth/  auth.types.ts  auth.schema.ts  auth.service.ts  auth.repository.ts  auth.test.ts  index.ts
```

## Modules, types, immutability, null

- Named exports; avoid default unless framework requires; `import type` / `export type`; ES modules only (no `namespace`, `require`, triple-slash); no mutable exports; explicit `index.ts` entrypoints (no blind barrels); readable paths/aliases over long `../../../`.
- `interface` for extendable object shapes; `type` for unions/intersections/primitives/tuples/mapped/conditional/branded; no `I` prefix; domain names.
- `const` default; `let` only when reassignment needed; never `var`; immutable updates in shared state; readonly arrays/fields when callers must not mutate.
- `strictNullChecks`; no `!` without clear invariant; explicit `T | null`; optional only when absent; with `exactOptionalPropertyTypes`, missing ≠ `undefined`.

## Async, errors, TSConfig

- Type async boundaries; handle rejections; no ignored promises (`void` + comment for intentional fire-and-forget).
- Normalize external errors at boundaries; one error style per layer.

```json
{ "compilerOptions": { "strict": true, "noImplicitOverride": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true, "noFallthroughCasesInSwitch": true, "useUnknownInCatchVariables": true } }
```

## Agent refactor order

Inspect nearby patterns first. When too large: (1) preserve behavior (2) extract types (3) pure helpers (4) IO/adapters (5) domain logic (6) tests (7) stable APIs unless breaking change requested. Focused refactors only — do not rewrite the whole codebase.
