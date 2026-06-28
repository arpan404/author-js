# Core concepts

Author JS is intentionally small. You define the things in your app, write policies as TypeScript functions, and ask the engine for a decision.

```txt
entity + action + resource + context => decision
```

A good policy should read like a product rule:

```ts
allow("owners can update their projects", ({ entity, resource, action }) => {
  if (resource.type !== "Project") return false;
  return action === "update" && entity.id === resource.data.ownerId;
});
```

## Entities

An entity is the actor. Usually this is a user, but it can also be an API key, service account, organization, or bot.

```ts
const User = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});
```

The `type` and `id` are what Author JS stores in decisions, roles, permissions, relations, and audit logs.

## Resources

A resource is the thing being protected.

```ts
const Project = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
});
```

Actions are checked at runtime. Asking for an action that is not listed on the resource throws an `UnknownActionError`.

## Parent resources

Many permissions live on a parent object. A project belongs to an organization. A document belongs to a folder. A folder belongs to a workspace.

Define parent references on the child resource:

```ts
const Project = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
  parents: {
    organization: {
      type: "Organization",
      id: (project) => project.orgId,
    },
  },
});
```

Parent permissions are **not inherited automatically**. That is deliberate. Automatic inheritance is hard to reason about and easy to over-grant. Instead, use explicit parent helpers inside policies.

```ts
allow("organization admins can update projects", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;

  return ctx.parents.hasRole("admin", "organization");
});
```

Available parent helpers:

```ts
await ctx.parents.get("organization");          // ParentRef | null
await ctx.parents.getRequired("organization");  // ParentRef or throws
await ctx.parents.list();                        // all parent refs

await ctx.parents.hasRole("admin", "organization");
await ctx.parents.hasPermission("read", "organization");
await ctx.parents.hasRelation("member", "organization");
```

Use `getRequired` when missing parent configuration is a programmer error. Use `get` when a parent is optional.

## Policies

Policies are named allow or deny rules.

```ts
allow("public projects can be read", ({ resource, action }) => {
  if (resource.type !== "Project") return false;
  return action === "read" && resource.data.visibility === "public";
});

deny("members cannot delete projects", ({ entity, action }) => {
  return entity.role === "member" && action === "delete";
});
```

A policy can return:

- `true` — policy matched
- `false` — policy skipped
- `allow/deny/skip(...)` style structured result

Deny policies override allow policies. If no allow policy matches, the final decision is deny.

## Policy context

Inside a policy you get:

```ts
ctx.entity       // current actor
ctx.action       // action string
ctx.resource     // { type, id, data }
ctx.context      // caller-provided context
ctx.mode         // "backend" | "frontend"
ctx.store        // underlying store adapter
```

And helper groups:

```ts
ctx.roles.has("admin");
ctx.roles.has("admin", { type: "Organization", id: "org_1" });
ctx.roles.list();

ctx.permissions.has("read", { type: "Project", id: "project_1" });
ctx.permissions.list();

ctx.relations.has({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
ctx.entityHasRelation("owner");
```

## Decisions

Use `.allowed()` when you only need a boolean:

```ts
const allowed = await author.as(user).can("update").on("Project", project).allowed();
```

The chain is also thenable:

```ts
const allowed = await author.as(user).can("update").on("Project", project);
```

Use `.explain()` when debugging or auditing:

```ts
const decision = await author.as(user).can("update").on("Project", project).explain();

console.log(decision.allowed);
console.log(decision.reason);
console.log(decision.matchedPolicies);
console.log(decision.skippedPolicies);
```

Use `.throw()` at backend enforcement points:

```ts
await author.as(user).can("delete").on("Project", project).throw();
```

When denied, `.throw()` raises `AuthorizationDeniedError` with the decision attached in `error.details.decision`.

## Custom request context

Pass request-specific data to policies:

```ts
await author
  .as(user)
  .can("read")
  .on("Report", report, { ip: request.ip, tenantId: request.tenantId });
```

Then read it in policy code:

```ts
allow("trusted IP can read report", ({ context, action }) => {
  return action === "read" && context.ip === "127.0.0.1";
});
```
