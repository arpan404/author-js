import { decisionCacheKey, type AuthorCache } from "./cache.js";
import type { ContextDefinition, EntityDefinition, ResourceDefinition } from "./definitions.js";
import type { EntitlementContext, EntitlementsConfig } from "./entitlements.js";
import {
  AuthorizationDeniedError,
  MissingParentResourceError,
  UnknownActionError,
  UnknownEntityTypeError,
  UnknownResourceTypeError,
} from "./errors.js";
import { normalizePolicyResult, type AuthorPolicyContext, type Policy } from "./policy.js";
import { memoryStore } from "./memory-store.js";
import type {
  AuthorStore,
  Decision,
  DeleteRelationInput,
  GetPermissionsInput,
  GetRelationsInput,
  GetRolesInput,
  Mode,
  ParentRef,
  ParentResolver,
  PermissionGrant,
  PermissionGrantInput,
  PolicyEffect,
  RelationTuple,
  RelationTupleInput,
  ResourceInput,
  RevokePermissionInput,
  RevokeRoleInput,
  RoleGrant,
  RoleGrantInput,
  ScopeInput,
} from "./types.js";

type EntityMap = Record<string, EntityDefinition<unknown, string>>;
type ResourceMap = Record<string, ResourceDefinition<unknown, string, readonly string[]>>;
type EntityValue<Entities> = Entities[keyof Entities] extends EntityDefinition<infer Entity, string> ? Entity : never;
type ResourceValue<Resources, Type extends keyof Resources> =
  Resources[Type] extends ResourceDefinition<infer Resource, string, readonly string[]> ? Resource : never;
type ResourceAction<Resources> =
  Resources[keyof Resources] extends ResourceDefinition<unknown, string, infer Actions> ? Actions[number] : string;
type SubjectValue<Entities, Type extends keyof Entities> =
  Entities[Type] extends EntityDefinition<infer Entity, string> ? Entity : never;
type SubjectUnion<Entities> = {
  [Type in keyof Entities & string]: { type: Type; id: string; data: SubjectValue<Entities, Type> };
}[keyof Entities & string];
type TypedResource<Resources, Type extends keyof Resources & string> = ResourceValue<Resources, Type> & {
  readonly authorType: Type;
};
type ResourceOn<Resources, CustomContext extends Record<string, unknown>> = {
  <Type extends keyof Resources & string>(
    resourceType: Type,
    resource: ResourceValue<Resources, Type>,
    context?: CustomContext,
  ): ResourceDecisionBuilder;
  <Type extends keyof Resources & string>(
    resource: TypedResource<Resources, Type>,
    context?: CustomContext,
  ): ResourceDecisionBuilder;
};
type PolicyContext<Entities, Resources, CustomContext extends Record<string, unknown>> = AuthorPolicyContext<
  EntityValue<Entities>,
  ResourceValue<Resources, keyof Resources>,
  CustomContext,
  SubjectUnion<Entities>
>;

/** Configuration for `createAuthor`. */
export type CreateAuthorInput<Entities, Resources, CustomContext extends Record<string, unknown>> = {
  entities: Entities;
  resources: Resources;
  context?: ContextDefinition<CustomContext>;
  policies: readonly Policy<PolicyContext<Entities, Resources, CustomContext>>[];
  store?: AuthorStore;
  mode?: Mode;
  /** Optional decision cache. Include resource/context data in cache keys to avoid cross-request collisions. */
  cache?: AuthorCache;
  /** TTL for cached decisions. Defaults to 30 seconds when `cache` is provided. */
  cacheTtlMs?: number;
  /** Optional plan, feature, and limit configuration exposed in policy context. */
  entitlements?: EntitlementsConfig<EntityValue<Entities>, ResourceValue<Resources, keyof Resources>, CustomContext>;
};

type EvaluateInput<CustomContext extends Record<string, unknown>> = {
  entityType: string;
  entity: unknown;
  action: string;
  resourceType: string;
  resource: unknown;
  context: CustomContext;
  mode: Mode;
};

/** Fluent result returned by `.on(...)`. Await it for a boolean or call explicit methods. */
export type ResourceDecisionBuilder = PromiseLike<boolean> & {
  allowed(): Promise<boolean>;
  denied(): Promise<boolean>;
  explain(): Promise<Decision>;
  throw(): Promise<void>;
};

/** Authorization engine instance created by `createAuthor`. */
export type AuthorInstance<Entities, Resources, CustomContext extends Record<string, unknown>> = {
  as<Type extends keyof Entities & string>(
    entityType: Type,
    entity: SubjectValue<Entities, Type>,
  ): {
    can<Action extends ResourceAction<Resources>>(action: Action): { on: ResourceOn<Resources, CustomContext> };
    cannot<Action extends ResourceAction<Resources>>(action: Action): { on: ResourceOn<Resources, CustomContext> };
  };
  evaluate(input: EvaluateInput<CustomContext>): Promise<Decision>;
  readonly store: AuthorStore;
  readonly cache: AuthorCache | undefined;
  readonly roles: {
    list(input: GetRolesInput): Promise<RoleGrant[]>;
    grant(input: RoleGrantInput): Promise<void>;
    revoke(input: RevokeRoleInput): Promise<void>;
  };
  readonly permissions: {
    list(input: GetPermissionsInput): Promise<PermissionGrant[]>;
    grant(input: PermissionGrantInput): Promise<void>;
    revoke(input: RevokePermissionInput): Promise<void>;
  };
  readonly relations: {
    list(input: GetRelationsInput): Promise<RelationTuple[]>;
    create(input: RelationTupleInput): Promise<void>;
    delete(input: DeleteRelationInput): Promise<void>;
  };
  invalidate(input?: { key?: string }): Promise<void>;
};

/**
 * Creates an authorization engine from entity definitions, resource definitions, policies, and an optional store.
 *
 * @example
 * const allowed = await author.as(user).can("update").on("Project", project).allowed();
 */
export function createAuthor<
  const Entities extends EntityMap,
  const Resources extends ResourceMap,
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(input: CreateAuthorInput<Entities, Resources, CustomContext>): AuthorInstance<Entities, Resources, CustomContext> {
  const store = input.store ?? memoryStore();
  const mode = input.mode ?? "backend";
  const cacheTtlMs = input.cacheTtlMs ?? 30_000;

  async function evaluate(request: EvaluateInput<CustomContext>): Promise<Decision> {
    const startedAt = performance.now();
    const entityDefinition = input.entities[request.entityType];
    if (!entityDefinition) throw new UnknownEntityTypeError(request.entityType);

    const resourceDefinition = input.resources[request.resourceType];
    if (!resourceDefinition) throw new UnknownResourceTypeError(request.resourceType);
    if (!resourceDefinition.actions.includes(request.action))
      throw new UnknownActionError(request.action, request.resourceType);

    const entityId = entityDefinition.id(request.entity);
    const resourceId = resourceDefinition.id(request.resource);
    const cacheKey = input.cache
      ? await decisionCacheKey({
          entityType: request.entityType,
          entityId,
          action: request.action,
          resourceType: request.resourceType,
          resourceId,
          mode: request.mode,
          context: request.context,
          resource: request.resource,
        })
      : null;
    if (cacheKey) {
      const cached = await input.cache?.get(cacheKey);
      if (cached) return cached;
    }
    const ctx = buildContext({
      entity: request.entity,
      action: request.action,
      resourceType: request.resourceType,
      resourceId,
      resource: request.resource,
      context: request.context,
      mode: request.mode,
      store,
      entityType: request.entityType,
      entityId,
      resourceDefinition,
      entitlements: input.entitlements,
    });

    const matchedAllows: Decision["matchedPolicies"] = [];
    const matchedDenies: Decision["matchedPolicies"] = [];
    const skippedPolicies: Decision["skippedPolicies"] = [];

    for (const policy of input.policies) {
      const raw = await policy.check(ctx as unknown as PolicyContext<Entities, Resources, CustomContext>);
      const result = normalizePolicyResult(policy, raw);
      if (result.effect === "skip") {
        skippedPolicies.push(
          result.reason === undefined ? { name: policy.name } : { name: policy.name, reason: result.reason },
        );
      } else if (result.effect === "deny") {
        matchedDenies.push({ name: policy.name, effect: "deny", reason: result.reason });
      } else {
        matchedAllows.push({ name: policy.name, effect: "allow", reason: result.reason });
      }
    }

    const decision = makeDecision({
      action: request.action,
      entityType: request.entityType,
      entityId,
      resourceType: request.resourceType,
      resourceId,
      matchedDenies,
      matchedAllows,
      skippedPolicies,
      mode: request.mode,
      durationMs: performance.now() - startedAt,
    });

    if (cacheKey) await input.cache?.set(cacheKey, decision, cacheTtlMs);

    await store.writeAuditLog?.({
      id: crypto.randomUUID(),
      entityType: decision.entity.type,
      entityId: decision.entity.id,
      action: decision.action,
      resourceType: decision.resource.type,
      resourceId: decision.resource.id,
      allowed: decision.allowed,
      reason: decision.reason,
      matchedPolicies: decision.matchedPolicies.map((policy) => policy.name),
      createdAt: new Date(),
    });

    return decision;
  }

  return {
    store,
    cache: input.cache,
    roles: {
      list: (query) => store.getRoles(query),
      grant: async (role) => {
        await store.grantRole(role);
        await invalidateCache(input.cache);
      },
      revoke: async (role) => {
        await store.revokeRole(role);
        await invalidateCache(input.cache);
      },
    },
    permissions: {
      list: (query) => store.getPermissions(query),
      grant: async (permission) => {
        await store.grantPermission(permission);
        await invalidateCache(input.cache);
      },
      revoke: async (permission) => {
        await store.revokePermission(permission);
        await invalidateCache(input.cache);
      },
    },
    relations: {
      list: (query) => store.getRelations(query),
      create: async (relation) => {
        await store.createRelation(relation);
        await invalidateCache(input.cache);
      },
      delete: async (relation) => {
        await store.deleteRelation(relation);
        await invalidateCache(input.cache);
      },
    },
    async invalidate(request) {
      if (!input.cache) return;
      if (request?.key) await input.cache.delete(request.key);
      else await input.cache.clear?.();
    },
    evaluate,
    as(entityType, entity) {
      const chain = (negated: boolean) => (action: ResourceAction<Resources>) => ({
        on: ((
          first: string | TypedResource<Resources, keyof Resources & string>,
          second?: ResourceValue<Resources, keyof Resources> | CustomContext,
          third?: CustomContext,
        ) => {
          const parsed = parseResourceInput(first, second, third);
          const run = async () => {
            const decision = await evaluate({
              entityType,
              entity,
              action,
              resourceType: parsed.resourceType,
              resource: parsed.resource,
              context: parsed.context,
              mode,
            });
            return negated ? invertDecision(decision) : decision;
          };
          return decisionBuilder(run);
        }) as ResourceOn<Resources, CustomContext>,
      });
      return { can: chain(false), cannot: chain(true) };
    },
  };
}

async function invalidateCache(cache: AuthorCache | undefined): Promise<void> {
  await cache?.clear?.();
}

function emptyContext<CustomContext extends Record<string, unknown>>(): CustomContext {
  return {} as CustomContext;
}

function decisionBuilder(run: () => Promise<Decision>): ResourceDecisionBuilder {
  const allowed = async () => (await run()).allowed;
  return {
    then: (onFulfilled, onRejected) => allowed().then(onFulfilled, onRejected),
    allowed,
    denied: async () => !(await run()).allowed,
    explain: run,
    throw: async () => {
      const decision = await run();
      if (!decision.allowed) throw new AuthorizationDeniedError(decision);
    },
  };
}

function parseResourceInput<Resources, CustomContext extends Record<string, unknown>>(
  first: string | TypedResource<Resources, keyof Resources & string>,
  second: ResourceValue<Resources, keyof Resources> | CustomContext | undefined,
  third: CustomContext | undefined,
): { resourceType: string; resource: unknown; context: CustomContext } {
  if (typeof first === "string") {
    return { resourceType: first, resource: second, context: third ?? emptyContext<CustomContext>() };
  }
  return {
    resourceType: first.authorType,
    resource: first,
    context: isContext(second) ? second : emptyContext<CustomContext>(),
  };
}

function isContext<CustomContext extends Record<string, unknown>>(value: unknown): value is CustomContext {
  return typeof value === "object" && value !== null && !("authorType" in value);
}

function makeDecision(input: {
  action: string;
  entityType: string;
  entityId: string;
  resourceType: string;
  resourceId: string;
  matchedDenies: Decision["matchedPolicies"];
  matchedAllows: Decision["matchedPolicies"];
  skippedPolicies: Decision["skippedPolicies"];
  mode: Mode;
  durationMs: number;
}): Decision {
  const deny = input.matchedDenies[0];
  const allow = input.matchedAllows[0];
  const effect: PolicyEffect = deny ? "deny" : allow ? "allow" : "deny";
  return {
    allowed: effect === "allow",
    effect,
    reason: deny?.reason ?? allow?.reason ?? "No matching allow policy",
    action: input.action,
    entity: { type: input.entityType, id: input.entityId },
    resource: { type: input.resourceType, id: input.resourceId },
    matchedPolicies: [...input.matchedDenies, ...input.matchedAllows],
    skippedPolicies: input.skippedPolicies,
    metadata: { evaluatedAt: new Date(), mode: input.mode, durationMs: input.durationMs },
  };
}

function invertDecision(decision: Decision): Decision {
  return {
    ...decision,
    allowed: !decision.allowed,
    effect: decision.allowed ? "deny" : "allow",
    reason: decision.allowed ? `Cannot check failed: ${decision.reason}` : `Cannot check passed: ${decision.reason}`,
  };
}

function buildContext<CustomContext extends Record<string, unknown>>(input: {
  entity: unknown;
  entityType: string;
  entityId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resource: unknown;
  context: CustomContext;
  mode: Mode;
  store: AuthorStore;
  resourceDefinition: ResourceDefinition<unknown, string, readonly string[]>;
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined;
}): PolicyContext<EntityMap, ResourceMap, CustomContext> {
  const parents = createParentResolver({
    definition: input.resourceDefinition,
    resource: input.resource,
    store: input.store,
    entityType: input.entityType,
    entityId: input.entityId,
  });
  return {
    subject: { type: input.entityType, id: input.entityId, data: input.entity },
    entity: input.entity,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    resource: { type: input.resourceType, id: input.resourceId, data: input.resource },
    context: input.context,
    mode: input.mode,
    store: input.store,
    parents,
    subscription: {
      plan: () => resolvePlan(input.entitlements, entitlementContext(input)),
    },
    features: {
      has: async (feature) => (await listFeatures(input.entitlements, entitlementContext(input))).includes(feature),
      list: () => listFeatures(input.entitlements, entitlementContext(input)),
    },
    limits: {
      get: (name) => getLimit(input.entitlements, entitlementContext(input), name),
      within: async (name, value) => {
        const limit = await getLimit(input.entitlements, entitlementContext(input), name);
        return limit === null || value.used < limit;
      },
      remaining: async (name, value) => {
        const limit = await getLimit(input.entitlements, entitlementContext(input), name);
        return limit === null ? null : Math.max(0, limit - value.used);
      },
    },
    relations: {
      has: async (query) => (await input.store.getRelations(query)).length > 0,
      list: (query) => input.store.getRelations(query),
    },
    entityHasRelation: async (relation) =>
      (
        await input.store.getRelations({
          subjectType: input.entityType,
          subjectId: input.entityId,
          relation,
          objectType: input.resourceType,
          objectId: input.resourceId,
        })
      ).length > 0,
    roles: {
      has: async (role, scope) => {
        const roles = await input.store.getRoles(roleQuery(input.entityType, input.entityId, scope));
        return roles.some((grant) => grant.role === role);
      },
      list: (scope) => input.store.getRoles(roleQuery(input.entityType, input.entityId, scope)),
    },
    permissions: {
      has: async (action, resource) => {
        const permissions = await input.store.getPermissions(
          permissionQuery(input.entityType, input.entityId, resource),
        );
        const deny = permissions.some((grant) => grant.action === action && grant.effect === "deny");
        const allow = permissions.some((grant) => grant.action === action && grant.effect === "allow");
        return !deny && allow;
      },
      list: (resource) => input.store.getPermissions(permissionQuery(input.entityType, input.entityId, resource)),
    },
  };
}

function entitlementContext<CustomContext extends Record<string, unknown>>(input: {
  entity: unknown;
  action: string;
  resourceType: string;
  resourceId: string;
  resource: unknown;
  context: CustomContext;
  mode: Mode;
}): EntitlementContext<unknown, unknown, CustomContext> {
  return {
    entity: input.entity,
    action: input.action,
    resource: { type: input.resourceType, id: input.resourceId, data: input.resource },
    context: input.context,
    mode: input.mode,
  };
}

async function resolvePlan<CustomContext extends Record<string, unknown>>(
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined,
  ctx: EntitlementContext<unknown, unknown, CustomContext>,
): Promise<string | null> {
  if (!entitlements) return null;
  return typeof entitlements.plan === "function" ? entitlements.plan(ctx) : entitlements.plan;
}

async function listFeatures<CustomContext extends Record<string, unknown>>(
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined,
  ctx: EntitlementContext<unknown, unknown, CustomContext>,
): Promise<string[]> {
  const plan = await resolvePlan(entitlements, ctx);
  if (!plan) return [];
  return [...(entitlements?.features?.[plan] ?? [])];
}

async function getLimit<CustomContext extends Record<string, unknown>>(
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined,
  ctx: EntitlementContext<unknown, unknown, CustomContext>,
  name: string,
): Promise<number | null> {
  const plan = await resolvePlan(entitlements, ctx);
  if (!plan) return null;
  return entitlements?.limits?.[plan]?.[name] ?? null;
}

function roleQuery(entityType: string, entityId: string, scope: ScopeInput | undefined): GetRolesInput {
  return scope ? { entityType, entityId, scopeType: scope.type, scopeId: scope.id } : { entityType, entityId };
}

function permissionQuery(
  entityType: string,
  entityId: string,
  resource: ResourceInput | undefined,
): GetPermissionsInput {
  if (!resource) return { entityType, entityId };
  return resource.id === undefined
    ? { entityType, entityId, resourceType: resource.type }
    : { entityType, entityId, resourceType: resource.type, resourceId: resource.id };
}

function createParentResolver(input: {
  definition: ResourceDefinition<unknown, string, readonly string[]>;
  resource: unknown;
  store: AuthorStore;
  entityType: string;
  entityId: string;
}): ParentResolver {
  const parents = input.definition.parents ?? {};
  const resolve = (name: string): ParentRef | null => {
    const parent = parents[name];
    return parent ? { type: parent.type, id: parent.id(input.resource) } : null;
  };
  const required = (name: string): ParentRef => {
    const parent = resolve(name);
    if (!parent) throw new MissingParentResourceError(name);
    return parent;
  };
  return {
    async get(name) {
      return resolve(name);
    },
    async getRequired(name) {
      return required(name);
    },
    async list() {
      return Object.entries(parents).map(([name, parent]) => ({
        name,
        type: parent.type,
        id: parent.id(input.resource),
      }));
    },
    async hasRole(role, parentName) {
      const parent = required(parentName);
      const roles = await input.store.getRoles(roleQuery(input.entityType, input.entityId, parent));
      return roles.some((grant) => grant.role === role);
    },
    async hasPermission(action, parentName) {
      const parent = required(parentName);
      const permissions = await input.store.getPermissions(permissionQuery(input.entityType, input.entityId, parent));
      return (
        !permissions.some((grant) => grant.action === action && grant.effect === "deny") &&
        permissions.some((grant) => grant.action === action && grant.effect === "allow")
      );
    },
    async hasRelation(relation, parentName) {
      const parent = required(parentName);
      return (
        (
          await input.store.getRelations({
            subjectType: input.entityType,
            subjectId: input.entityId,
            relation,
            objectType: parent.type,
            objectId: parent.id,
          })
        ).length > 0
      );
    },
  };
}
