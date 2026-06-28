# Permission management

Use the management API when you build admin screens, setup scripts, billing webhooks, or organization settings pages.

The management API is a thin layer over the configured store:

```ts
await author.roles.grant(...);
await author.permissions.grant(...);
await author.relations.create(...);
```

It exists so application code does not need to call `author.store.*` directly. Write helpers also clear the decision cache when the configured cache supports `clear()`.

## Roles

Roles are named grants for an entity. They can be global or scoped to a resource.

### Grant a role

```ts
await author.roles.grant({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
});
```

### Grant a scoped role

Scoped roles are useful for organization or workspace membership.

```ts
await author.roles.grant({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

### List roles

```ts
const roles = await author.roles.list({
  entityType: "User",
  entityId: "user_1",
});
```

List roles for a scope:

```ts
const roles = await author.roles.list({
  entityType: "User",
  entityId: "user_1",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

### Revoke a role

The revoke input must match the grant you want to remove.

```ts
await author.roles.revoke({
  entityType: "User",
  entityId: "user_1",
  role: "admin",
  scopeType: "Organization",
  scopeId: "org_1",
});
```

## Permissions

Permissions are direct action grants for an entity and resource.

Use them when a user needs an exception that does not fit a role.

### Grant an allow permission

```ts
await author.permissions.grant({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
  effect: "allow",
});
```

### Grant a deny permission

Deny grants are useful for explicit blocks.

```ts
await author.permissions.grant({
  entityType: "User",
  entityId: "user_1",
  action: "delete",
  resourceType: "Project",
  resourceId: "project_1",
  effect: "deny",
});
```

Your policy decides how direct permissions are used:

```ts
allow("direct permission can read project", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  return ctx.permissions.has("read", { type: "Project", id: ctx.resource.id });
});
```

`ctx.permissions.has` returns `false` when a matching deny exists.

### Resource-wide permissions

Omit `resourceId` when the grant applies to all resources of a type.

```ts
await author.permissions.grant({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  effect: "allow",
});
```

### List permissions

```ts
const permissions = await author.permissions.list({
  entityType: "User",
  entityId: "user_1",
});
```

Filter to a resource:

```ts
const permissions = await author.permissions.list({
  entityType: "User",
  entityId: "user_1",
  resourceType: "Project",
  resourceId: "project_1",
});
```

### Revoke a permission

```ts
await author.permissions.revoke({
  entityType: "User",
  entityId: "user_1",
  action: "read",
  resourceType: "Project",
  resourceId: "project_1",
  effect: "allow",
});
```

## Relations

Relations model object-specific relationships such as owner, member, viewer, editor, or parent membership.

### Create a relation

```ts
await author.relations.create({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
```

Use it in a policy:

```ts
allow("project owners can update", async (ctx) => {
  if (ctx.resource.type !== "Project") return false;
  if (ctx.action !== "update") return false;
  return ctx.entityHasRelation("owner");
});
```

### List relations

```ts
const relations = await author.relations.list({
  subjectType: "User",
  subjectId: "user_1",
});
```

Queries are partial. Omitted fields act like wildcards.

```ts
const projectMembers = await author.relations.list({
  objectType: "Project",
  objectId: "project_1",
});
```

### Delete a relation

```ts
await author.relations.delete({
  subjectType: "User",
  subjectId: "user_1",
  relation: "owner",
  objectType: "Project",
  objectId: "project_1",
});
```

## Cache invalidation

Management writes call `author.invalidate()` for you when possible.

This means these calls invalidate the decision cache:

- `author.roles.grant`
- `author.roles.revoke`
- `author.permissions.grant`
- `author.permissions.revoke`
- `author.relations.create`
- `author.relations.delete`

If your cache adapter cannot clear everything, delete known keys directly with `cache.delete(key)`.

## Building a settings page

A typical organization settings page might do this:

```ts
async function makeOrgAdmin(userId: string, orgId: string) {
  await author.roles.grant({
    entityType: "User",
    entityId: userId,
    role: "admin",
    scopeType: "Organization",
    scopeId: orgId,
  });
}

async function removeOrgAdmin(userId: string, orgId: string) {
  await author.roles.revoke({
    entityType: "User",
    entityId: userId,
    role: "admin",
    scopeType: "Organization",
    scopeId: orgId,
  });
}
```

Before running these mutations, protect the settings route itself:

```ts
await author.as("User", currentUser).can("manage").on("Organization", organization).throw();
```

## Store access

`author.store` is still available for advanced cases, but prefer the management helpers in application code. They are clearer and handle cache invalidation.
