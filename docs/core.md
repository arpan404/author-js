# Core concepts

Author JS answers one question:

```txt
Can entity E perform action A on resource R under context C?
```

## Define entities and resources

```ts
const User = defineEntity<User>()({
  type: "User",
  id: (user) => user.id,
});

const Project = defineResource<Project>()({
  type: "Project",
  id: (project) => project.id,
  actions: ["read", "update", "delete"] as const,
  parents: {
    organization: { type: "Organization", id: (project) => project.orgId },
  },
});
```

## Policies

Policies return `true`, `false`, or a structured result.

```ts
allow("owner can update project", ({ entity, resource, action }) =>
  resource.type === "Project" &&
  action === "update" &&
  entity.id === resource.data.ownerId,
);
```

Deny policies override allow policies. No matching allow means deny.

## Checks

```ts
await author.as(user).can("update").on("Project", project).allowed();
await author.as(user).can("update").on("Project", project).explain();
await author.as(user).can("delete").on("Project", project).throw();
```

You can also await the chain directly:

```ts
const allowed = await author.as(user).can("update").on("Project", project);
```

## Context helpers

Inside policies, use:

- `ctx.roles.has()` / `ctx.roles.list()`
- `ctx.permissions.has()` / `ctx.permissions.list()`
- `ctx.relations.has()` / `ctx.relations.list()`
- `ctx.parents.get()` / `ctx.parents.getRequired()` / `ctx.parents.list()`
- `ctx.parents.hasRole(role, parentName)`
- `ctx.parents.hasPermission(action, parentName)`
- `ctx.parents.hasRelation(relation, parentName)`
- `ctx.entityHasRelation()`

## Parent resource helpers

Parent checks are explicit, not automatic. This avoids surprising inherited permissions while keeping policies short.

```ts
allow("org admin can update project", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;

  return ctx.parents.hasRole("admin", "organization");
});

allow("org permission allows project read", async (ctx) => {
  if (ctx.action !== "read") return false;
  return ctx.parents.hasPermission("read", "organization");
});

allow("org member relation allows project read", async (ctx) => {
  return ctx.parents.hasRelation("member", "organization");
});
```

Use `getRequired` when missing parent configuration should fail loudly:

```ts
const org = await ctx.parents.getRequired("organization");
```
