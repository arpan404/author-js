# Core guide

Author JS is built around one request:

```txt
Can this entity do this action on this resource with this context?
```

Everything else exists to make that question easy to answer in real apps: roles, attributes, relationships, parent resources, subscription plans, limits, and framework middleware.

## 1. Define your domain

Start by teaching Author JS how to identify your actors and resources.

```ts
import { defineEntity, defineResource } from "author-js";

type User = {
  id: string;
  orgId: string;
  role: "admin" | "member";
  plan: "free" | "pro";
};

type Project = {
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

The `type` and `id` values are used everywhere: decisions, audit logs, roles, permissions, relationships, and parent checks.

## 2. Write policies as normal TypeScript

Policies are named rules. They return `true` when they match and `false` when they do not.

```ts
import { allow, deny } from "author-js";

export const projectPolicies = [
  allow("admins can do anything", ({ entity }) => entity.role === "admin"),

  allow("owners can update their projects", ({ entity, resource, action }) => {
    if (resource.type !== "Project") return false;
    return action === "update" && entity.id === resource.data.ownerId;
  }),

  deny("members cannot delete projects", ({ entity, action }) => {
    return entity.role === "member" && action === "delete";
  }),
] as const;
```

Evaluation is predictable:

1. all policies run
2. any matching deny wins
3. otherwise any matching allow wins
4. otherwise deny by default

## 3. Create the author instance

```ts
import { createAuthor } from "author-js";
import { UserEntity, ProjectResource } from "./authorization.definitions";
import { projectPolicies } from "./project.policies";

export const author = createAuthor({
  entities: { User: UserEntity },
  resources: { Project: ProjectResource },
  policies: [...projectPolicies],
});
```

Then check permissions:

```ts
const allowed = await author.as(user).can("update").on("Project", project);

await author.as(user).can("delete").on("Project", project).throw();

const decision = await author.as(user).can("read").on("Project", project).explain();
```

## 4. Keep authorization files small

Do not put every policy in one giant file. Split by feature and merge arrays at the composition point.

```txt
src/authorization/
  definitions.ts
  plans.ts
  author.ts
  policies/
    organization.ts
    project.ts
    billing.ts
```

Example policy modules:

```ts
// policies/project.ts
import { allow } from "author-js";

export const projectPolicies = [
  allow("project owners can update", ({ entity, resource, action }) => {
    if (resource.type !== "Project") return false;
    return action === "update" && entity.id === resource.data.ownerId;
  }),
] as const;
```

```ts
// policies/billing.ts
import { allow } from "author-js";

export const billingPolicies = [
  allow("plan can create projects", async (ctx) => {
    if (ctx.action !== "create") return false;
    if (!(await ctx.features.has("projects.create"))) return false;

    const used = Number(ctx.context["projectCount"] ?? 0);
    return ctx.limits.within("projects", { used });
  }),
] as const;
```

Merge them without adding a framework or registry:

```ts
// author.ts
export const author = createAuthor({
  entities,
  resources,
  entitlements,
  policies: [
    ...organizationPolicies,
    ...projectPolicies,
    ...billingPolicies,
  ],
});
```

That is usually enough. Add fancier plugin systems only when plain arrays stop working.

## 5. Centralize plans and limits

Keep subscription features in one boring config file. This makes billing behavior reviewable.

```ts
// plans.ts
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
  plan: async ({ entity }: { entity: { plan: PlanName } }) => entity.plan,
  features: Object.fromEntries(
    Object.entries(plans).map(([name, plan]) => [name, plan.features]),
  ),
  limits: Object.fromEntries(
    Object.entries(plans).map(([name, plan]) => [name, plan.limits]),
  ),
};
```

Use the helpers in policies:

```ts
allow("plan can invite members", async (ctx) => {
  if (ctx.action !== "invite") return false;
  if (!(await ctx.features.has("members.invite"))) return false;

  const usedSeats = Number(ctx.context["usedSeats"] ?? 0);
  return ctx.limits.within("seats", { used: usedSeats });
});
```

Author JS does not count usage for you. Your app knows where usage lives. Pass counts in `context` or query them inside the policy.

## 6. Use parent helpers explicitly

Parent permissions are not inherited automatically. Automatic inheritance is easy to over-grant. Author JS gives helpers so the rule remains visible.

```ts
allow("organization admins can update projects", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;

  return ctx.parents.hasRole("admin", "organization");
});
```

Available helpers:

```ts
await ctx.parents.get("organization");
await ctx.parents.getRequired("organization");
await ctx.parents.list();

await ctx.parents.hasRole("admin", "organization");
await ctx.parents.hasPermission("read", "organization");
await ctx.parents.hasRelation("member", "organization");
```

Use `getRequired` when missing parent configuration is a bug. Use `get` when the parent is optional.

## 7. Pass request context when needed

Context is for request-specific data, not global config.

```ts
await author.as(user).can("create").on("Project", project, {
  ip: request.ip,
  projectCount: await countProjects(user.id),
  usedSeats: await countOrgMembers(user.orgId),
});
```

Then policies can read it:

```ts
allow("trusted IP can read reports", ({ action, context }) => {
  return action === "read" && context.ip === "127.0.0.1";
});
```

## 8. Decision shape

`.explain()` returns a rich decision:

```ts
const decision = await author.as(user).can("update").on("Project", project).explain();

console.log(decision.allowed);
console.log(decision.reason);
console.log(decision.matchedPolicies);
console.log(decision.skippedPolicies);
```

Use this for tests, logs, admin tooling, and debugging.
