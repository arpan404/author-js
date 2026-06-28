# Core

author.js answers one question:

```txt
Can this entity perform this action on this resource in this context?
```

```ts
await author.as("User", user).can("update").on("Project", project);
```

## Entities and resources

Entities are actors. Resources are the objects being protected.

```ts
import { defineEntity, defineResource } from "author-js";

export type User = {
  id: string;
  orgId: string;
  role: "admin" | "member";
  plan: "free" | "pro" | "enterprise";
};

export type Project = {
  id: string;
  orgId: string;
  ownerId: string;
  visibility: "public" | "private";
};

export const UserEntity = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

export const ProjectResource = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "create", "update", "delete"] as const,
  parents: {
    organization: {
      type: "Organization",
      id: (project) => project.orgId,
    },
  },
});
```

`type` and `id` are the stable references used in decisions, audit logs, roles, permissions, relationships, and cache keys.

## Policies

Policies are named rules. Return `true` to match, `false` to skip.

```ts
import { allow, deny } from "author-js";

export const projectPolicies = [
  allow(
    "admins can do anything",
    { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["read", "create", "update", "delete"] },
    ({ entity }) => entity.role === "admin",
  ),

  allow(
    "owners can update projects",
    { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["update"] },
    ({ entity, resource }) => entity.id === resource.data.ownerId,
  ),

  deny(
    "members cannot delete projects",
    { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["delete"] },
    ({ entity }) => entity.role === "member",
  ),
] as const;
```

Evaluation order:

1. Policies relevant to the entity type, resource type, and action run.
2. Any matching deny wins.
3. Otherwise any matching allow wins.
4. Otherwise the result is denied.

Unscoped policies are relevant to every check. In larger apps, scope policies so the engine can skip unrelated rules before running user code:

```ts
allow(
  "owners can update projects",
  { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["update"] },
  ({ entity, resource }) => entity.id === resource.data.ownerId,
);

deny(
  "members cannot delete projects",
  { entityTypes: ["User"], resourceTypes: ["Project"], actions: ["delete"] },
  ({ entity }) => entity.role === "member",
);
```

Scopes are static applicability metadata. Keep dynamic checks such as ownership, tenant membership, roles, and subscription state inside the policy function.

## Typed request context

Use `defineContext` when policies need typed request context.

```ts
import { defineContext } from "author-js";

type AuthContext = {
  tenantId: string;
  projectCount?: number;
};

export const AuthContext = defineContext<AuthContext>();
```

Pass it to `createAuthor`:

```ts
createAuthor({
  context: AuthContext,
  entities,
  modules,
  policies: globalPolicies,
});
```

Now `ctx.context.tenantId` is typed as `string` in policies.

## Author instance

Keep definitions, plans, modules, and policies in separate files. Compose them once.

```ts
import { createAuthor, defineAuthorModule } from "author-js";
import { UserEntity, ProjectResource, InvoiceResource } from "./definitions";
import { entitlements } from "./plans";
import { organizationPolicies } from "./policies/organization";
import { projectPolicies } from "./policies/project";
import { billingPolicies } from "./policies/billing";

export const projectModule = defineAuthorModule({
  name: "projects",
  resources: { Project: ProjectResource },
  policies: projectPolicies,
});

export const billingModule = defineAuthorModule({
  name: "billing",
  resources: { Invoice: InvoiceResource },
  policies: billingPolicies,
});

export const author = createAuthor({
  entities: { User: UserEntity },
  modules: [projectModule, billingModule],
  entitlements,
  policies: organizationPolicies,
});
```

Suggested layout:

```txt
src/authorization/
  author.ts
  definitions.ts
  plans.ts
  modules/
    projects.ts
    billing.ts
  policies/
    organization.ts
```

## Author modules

Use modules to group resource definitions and policies by domain while still building one authorization engine. This keeps global denies and audit behavior centralized.

```ts
import { defineAuthorModule } from "author-js";

export const projectModule = defineAuthorModule({
  name: "projects",
  resources: { Project: ProjectResource },
  policies: projectPolicies,
});

export const billingModule = defineAuthorModule({
  name: "billing",
  resources: { Invoice: InvoiceResource },
  policies: billingPolicies,
});
```

Compose modules once:

```ts
export const author = createAuthor({
  entities: { User: UserEntity, ApiKey: ApiKeyEntity },
  modules: [projectModule, billingModule],
  policies: globalPolicies,
});
```

Module resources and policies are merged into one runtime index. If two modules register the same resource type, `createAuthor` throws `DuplicateResourceTypeError`.

For small apps, `createAuthor({ resources, policies })` is still valid. Modules are the preferred API when resources and policies are owned by different domains.

## Check API

Boolean result:

```ts
const allowed = await author.as("User", user).can("update").on("Project", project);
```

Direct boolean check:

```ts
const allowed = await author.check({
  entityType: "User",
  entity: user,
  action: "update",
  resourceType: "Project",
  resource: project,
  context: {},
  mode: "backend",
});
```

Detailed decision:

```ts
const decision = await author
  .as("User", user)
  .can("update")
  .on("Project", project)
  .explain();
```

Enforcement:

```ts
await author.as("User", user).can("delete").on("Project", project).throw();
```

`.throw()` raises `AuthorizationDeniedError` when denied.

## Context

Pass request-specific data that policies need but resources do not contain: IP address, tenant ID, usage counts, feature flags.

```ts
await author.as("User", user).can("create").on("Project", project, {
  ip: request.ip,
  projectCount: await countProjects(user.id),
});
```

```ts
allow("trusted IP can read reports", ({ action, context }) => {
  return action === "read" && context.ip === "127.0.0.1";
});
```

## Plans, features, and limits

Centralize billing capabilities in one file.

```ts
export const plans = {
  free: {
    features: ["projects.read"],
    limits: { projects: 3, seats: 1 },
  },
  pro: {
    features: ["projects.read", "projects.create", "members.invite"],
    limits: { projects: 100, seats: 10 },
  },
  enterprise: {
    features: ["projects.read", "projects.create", "members.invite", "audit.read"],
    limits: { projects: 10_000, seats: 500 },
  },
} as const;

export type PlanName = keyof typeof plans;

export const entitlements = {
  plan: ({ entity }: { entity: { plan: PlanName } }) => entity.plan,
  features: Object.fromEntries(
    Object.entries(plans).map(([name, plan]) => [name, plan.features]),
  ),
  limits: Object.fromEntries(
    Object.entries(plans).map(([name, plan]) => [name, plan.limits]),
  ),
};
```

Use entitlement helpers in policies:

```ts
allow("plan can create projects", async (ctx) => {
  if (ctx.action !== "create") return false;
  if (!(await ctx.features.has("projects.create"))) return false;

  const used = Number(ctx.context["projectCount"] ?? 0);
  return ctx.limits.within("projects", { used });
});
```

Pass usage through context or query it inside the policy.

```ts
await ctx.subscription.plan();
await ctx.features.has("projects.create");
await ctx.features.list();
await ctx.limits.get("projects");
await ctx.limits.within("projects", { used: 2 });
await ctx.limits.remaining("projects", { used: 2 });
```

## Parent resources

Parent permissions are not inherited automatically. Write explicit rules.

```ts
allow("organization admins can update projects", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;

  return ctx.parents.hasRole("admin", "organization");
});
```

```ts
await ctx.parents.get("organization");
await ctx.parents.getRequired("organization");
await ctx.parents.list();
await ctx.parents.hasRole("admin", "organization");
await ctx.parents.hasPermission("read", "organization");
await ctx.parents.hasRelation("member", "organization");
```

Use `getRequired` when a missing parent is a programming error. Use `get` when the parent is optional.

## Permission management

For settings pages and setup scripts, use the management helpers:

```ts
await author.roles.grant({ entityType: "User", entityId: "u1", role: "admin" });
await author.permissions.revoke({ entityType: "User", entityId: "u1", action: "read", resourceType: "Project", resourceId: "p1", effect: "allow" });
await author.relations.delete({ subjectType: "User", subjectId: "u1", relation: "owner", objectType: "Project", objectId: "p1" });
```

See [Permission management](./management.md) for the full grant/revoke/list API and settings-page examples.

## Decisions

`.explain()` returns the full decision:

```ts
type Decision = {
  allowed: boolean;
  effect: "allow" | "deny";
  reason: string;
  matchedPolicies: Array<{ name: string; effect: "allow" | "deny"; reason: string }>;
  skippedPolicies: Array<{ name: string; reason?: string }>;
};
```

Use decisions in tests, audit screens, support tooling, and logs.
