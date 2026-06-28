# Core guide

This guide shows how to model authorization in Author JS without building one giant policy file.

Author JS answers one question:

```txt
Can this entity perform this action on this resource in this context?
```

In code:

```ts
await author.as(user).can("update").on("Project", project);
```

## 1. Define entities and resources

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

## 2. Write policies

Policies are named rules. They return `true` to match and `false` to skip.

```ts
import { allow, deny } from "author-js";

export const projectPolicies = [
  allow("admins can do anything", ({ entity }) => entity.role === "admin"),

  allow("owners can update projects", ({ entity, resource, action }) => {
    if (resource.type !== "Project") return false;
    return action === "update" && entity.id === resource.data.ownerId;
  }),

  deny("members cannot delete projects", ({ entity, action }) => {
    return entity.role === "member" && action === "delete";
  }),
] as const;
```

Evaluation rules are simple:

1. all policies run
2. any matching deny wins
3. otherwise any matching allow wins
4. otherwise the result is denied

## 3. Compose the author instance

Keep definitions, plans, and policies separate. Compose them once.

```ts
import { createAuthor } from "author-js";
import { UserEntity, ProjectResource } from "./definitions";
import { entitlements } from "./plans";
import { organizationPolicies } from "./policies/organization";
import { projectPolicies } from "./policies/project";
import { billingPolicies } from "./policies/billing";

export const author = createAuthor({
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  entitlements,
  policies: [
    ...organizationPolicies,
    ...projectPolicies,
    ...billingPolicies,
  ],
});
```

Suggested structure:

```txt
src/authorization/
  author.ts
  definitions.ts
  plans.ts
  policies/
    organization.ts
    project.ts
    billing.ts
```

Plain arrays are enough for most apps. Avoid plugin registries until you actually need them.

## 4. Use the check API

Boolean result:

```ts
const allowed = await author.as(user).can("update").on("Project", project);
```

Detailed decision:

```ts
const decision = await author
  .as(user)
  .can("update")
  .on("Project", project)
  .explain();
```

Backend enforcement:

```ts
await author.as(user).can("delete").on("Project", project).throw();
```

`.throw()` raises `AuthorizationDeniedError` when denied.

## 5. Use request context for request-specific data

Context is for data that belongs to one check: IP address, tenant ID, usage count, feature rollout bucket, and similar values.

```ts
await author.as(user).can("create").on("Project", project, {
  ip: request.ip,
  projectCount: await countProjects(user.id),
});
```

Policies can read it:

```ts
allow("trusted IP can read reports", ({ action, context }) => {
  return action === "read" && context.ip === "127.0.0.1";
});
```

## 6. Centralize plans, features, and limits

Keep billing capabilities in one file so product and engineering can review them easily.

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

Then use entitlement helpers in policies:

```ts
allow("plan can create projects", async (ctx) => {
  if (ctx.action !== "create") return false;
  if (!(await ctx.features.has("projects.create"))) return false;

  const used = Number(ctx.context["projectCount"] ?? 0);
  return ctx.limits.within("projects", { used });
});
```

Author JS does not count usage for you. Usage usually lives in your domain database, so pass it through context or query it in the policy.

Available helpers:

```ts
await ctx.subscription.plan();
await ctx.features.has("projects.create");
await ctx.features.list();
await ctx.limits.get("projects");
await ctx.limits.within("projects", { used: 2 });
await ctx.limits.remaining("projects", { used: 2 });
```

## 7. Use parent helpers explicitly

Parent permissions are not inherited automatically. Explicit rules are safer and easier to audit.

```ts
allow("organization admins can update projects", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;

  return ctx.parents.hasRole("admin", "organization");
});
```

Helpers:

```ts
await ctx.parents.get("organization");
await ctx.parents.getRequired("organization");
await ctx.parents.list();
await ctx.parents.hasRole("admin", "organization");
await ctx.parents.hasPermission("read", "organization");
await ctx.parents.hasRelation("member", "organization");
```

Use `getRequired` when a missing parent is a programming error. Use `get` when the parent is optional.

## 8. Inspect decisions

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
