import { decisionCacheKey, type AuthorCache, type CacheKeyInput } from "./cache.js";
import type { ContextDefinition, EntityDefinition, ResourceDefinition } from "./definitions.js";
import type { EntitlementContext, EntitlementsConfig } from "./entitlements.js";
import {
  AuthorizationDeniedError,
  DuplicateResourceTypeError,
  MissingParentResourceError,
  UnknownActionError,
  UnknownEntityTypeError,
  UnknownResourceTypeError,
} from "./errors.js";
import { normalizePolicyResult, type AuthorPolicyContext, type Policy } from "./policy.js";
import { memoryStore } from "./memory-store.js";
import type { AuthorModule } from "./module.js";
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
type EmptyResourceMap = Record<never, never>;
type AnyAuthorModule = AuthorModule<ResourceMap, unknown>;
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
type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;
type ModuleResourceUnion<Modules extends readonly AnyAuthorModule[]> =
  Modules[number] extends AuthorModule<infer Resources, unknown> ? Resources : never;
type ResourcesFromModules<Modules extends readonly AnyAuthorModule[]> = [Modules[number]] extends [never]
  ? EmptyResourceMap
  : UnionToIntersection<ModuleResourceUnion<Modules>>;
type CombinedResources<Resources, Modules extends readonly AnyAuthorModule[]> = Resources &
  ResourcesFromModules<Modules>;
type CombinedPolicyContext<
  Entities,
  Resources,
  Modules extends readonly AnyAuthorModule[],
  CustomContext extends Record<string, unknown>,
> = PolicyContext<Entities, CombinedResources<Resources, Modules>, CustomContext>;

/** Configuration for `createAuthor`. */
export type CreateAuthorInput<
  Entities,
  Resources,
  CustomContext extends Record<string, unknown>,
  Modules extends readonly AnyAuthorModule[] = readonly AnyAuthorModule[],
> = {
  entities: Entities;
  /** Root resource definitions. Prefer modules for larger applications. */
  resources?: Resources;
  context?: ContextDefinition<CustomContext>;
  /** Global policies that apply across modules. */
  policies?: readonly Policy<CombinedPolicyContext<Entities, Resources, Modules, CustomContext>>[];
  /** Domain modules merged into this author instance. */
  modules?: Modules;
  store?: AuthorStore;
  mode?: Mode;
  /** Optional decision cache. Include resource/context data in cache keys to avoid cross-request collisions. */
  cache?: AuthorCache;
  /** TTL for cached decisions. Defaults to 30 seconds when `cache` is provided. */
  cacheTtlMs?: number;
  /** Optional cache key resolver. Use this when the default stable SHA-256 decision key is too expensive. */
  cacheKey?: (input: CacheKeyInput) => string | Promise<string>;
  /** Optional plan, feature, and limit configuration exposed in policy context. */
  entitlements?: EntitlementsConfig<
    EntityValue<Entities>,
    ResourceValue<CombinedResources<Resources, Modules>, keyof CombinedResources<Resources, Modules>>,
    CustomContext
  >;
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
  check(input: EvaluateInput<CustomContext>): Promise<boolean>;
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
 * Creates one authorization engine from entity definitions, optional root resources, domain modules, policies, and adapters.
 *
 * @example
 * const allowed = await author.as(user).can("update").on("Project", project).allowed();
 */
export function createAuthor<
  const Entities extends EntityMap,
  const Resources extends ResourceMap = EmptyResourceMap,
  const Modules extends readonly AnyAuthorModule[] = [],
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(
  input: CreateAuthorInput<Entities, Resources, CustomContext, Modules>,
): AuthorInstance<Entities, CombinedResources<Resources, Modules>, CustomContext> {
  type RuntimeResources = CombinedResources<Resources, Modules>;
  const store = input.store ?? memoryStore();
  const mode = input.mode ?? "backend";
  const cacheTtlMs = input.cacheTtlMs ?? 30_000;
  const resources = mergeResources(input.resources, input.modules);
  const policies = mergePolicies(input.policies, input.modules);
  const resourceActionSets = buildResourceActionSets(resources);
  const policyPlan = buildPolicyPlan({
    policies,
    entities: input.entities,
    resources,
  });
  const emptyPolicyList: readonly Policy<unknown>[] = [];

  function prepareEvaluation(request: EvaluateInput<CustomContext>) {
    const startedAt = performance.now();
    const entityDefinition = input.entities[request.entityType];
    if (!entityDefinition) throw new UnknownEntityTypeError(request.entityType);

    const resourceDefinition = resources[request.resourceType];
    if (!resourceDefinition) throw new UnknownResourceTypeError(request.resourceType);
    if (!resourceActionSets.get(request.resourceType)?.has(request.action))
      throw new UnknownActionError(request.action, request.resourceType);

    return {
      startedAt,
      resourceDefinition,
      entityId: entityDefinition.id(request.entity),
      resourceId: resourceDefinition.id(request.resource),
      policies:
        policyPlan.get(selectionKey(request.entityType, request.resourceType, request.action)) ?? emptyPolicyList,
    };
  }

  async function cacheKeyFor(
    request: EvaluateInput<CustomContext>,
    entityId: string,
    resourceId: string,
  ): Promise<string | null> {
    if (!input.cache) return null;

    const cacheInput = {
      entityType: request.entityType,
      entityId,
      action: request.action,
      resourceType: request.resourceType,
      resourceId,
      mode: request.mode,
      context: request.context,
      resource: request.resource,
    } satisfies CacheKeyInput;

    return input.cacheKey ? input.cacheKey(cacheInput) : decisionCacheKey(cacheInput);
  }

  async function evaluate(request: EvaluateInput<CustomContext>): Promise<Decision> {
    const prepared = prepareEvaluation(request);
    const cacheKey = await cacheKeyFor(request, prepared.entityId, prepared.resourceId);
    if (cacheKey) {
      const cached = await input.cache?.get(cacheKey);
      if (cached) return cached;
    }
    const ctx = buildContext({
      entity: request.entity,
      action: request.action,
      resourceType: request.resourceType,
      resourceId: prepared.resourceId,
      resource: request.resource,
      context: request.context,
      mode: request.mode,
      store,
      entityType: request.entityType,
      entityId: prepared.entityId,
      resourceDefinition: prepared.resourceDefinition,
      entitlements: input.entitlements,
    });

    const matchedAllows: Decision["matchedPolicies"] = [];
    const matchedDenies: Decision["matchedPolicies"] = [];
    const skippedPolicies: Decision["skippedPolicies"] = [];

    for (const policy of prepared.policies) {
      const raw = await policy.check(ctx);
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
      entityId: prepared.entityId,
      resourceType: request.resourceType,
      resourceId: prepared.resourceId,
      matchedDenies,
      matchedAllows,
      skippedPolicies,
      mode: request.mode,
      durationMs: performance.now() - prepared.startedAt,
    });

    if (cacheKey) await input.cache?.set(cacheKey, decision, cacheTtlMs);

    await writeDecisionAuditLog(store, decision);

    return decision;
  }

  async function evaluateAllowed(request: EvaluateInput<CustomContext>): Promise<boolean> {
    if (input.cache) return (await evaluate(request)).allowed;

    const prepared = prepareEvaluation(request);
    const ctx = buildContext({
      entity: request.entity,
      action: request.action,
      resourceType: request.resourceType,
      resourceId: prepared.resourceId,
      resource: request.resource,
      context: request.context,
      mode: request.mode,
      store,
      entityType: request.entityType,
      entityId: prepared.entityId,
      resourceDefinition: prepared.resourceDefinition,
      entitlements: input.entitlements,
    });
    const auditMatches = store.writeAuditLog ? { allows: [] as string[], denies: [] as string[] } : null;
    let allowReason: string | null = null;

    for (const policy of prepared.policies) {
      const raw = await policy.check(ctx);
      const result = normalizePolicyResult(policy, raw);

      if (result.effect === "deny") {
        auditMatches?.denies.push(policy.name);
        await writeBooleanAuditLog({
          store,
          request,
          entityId: prepared.entityId,
          resourceId: prepared.resourceId,
          allowed: false,
          reason: result.reason,
          matchedPolicies: auditMatches ? [...auditMatches.denies, ...auditMatches.allows] : [],
        });
        return false;
      }

      if (result.effect === "allow") {
        auditMatches?.allows.push(policy.name);
        allowReason ??= result.reason;
      }
    }

    const allowed = allowReason !== null;
    await writeBooleanAuditLog({
      store,
      request,
      entityId: prepared.entityId,
      resourceId: prepared.resourceId,
      allowed,
      reason: allowReason ?? "No matching allow policy",
      matchedPolicies: auditMatches ? [...auditMatches.denies, ...auditMatches.allows] : [],
    });
    return allowed;
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
    check: evaluateAllowed,
    as(entityType, entity) {
      const chain = (negated: boolean) => (action: ResourceAction<RuntimeResources>) => ({
        on: ((
          first: string | TypedResource<RuntimeResources, keyof RuntimeResources & string>,
          second?: ResourceValue<RuntimeResources, keyof RuntimeResources> | CustomContext,
          third?: CustomContext,
        ) => {
          const parsed = parseResourceInput(first, second, third);
          const request = {
            entityType,
            entity,
            action,
            resourceType: parsed.resourceType,
            resource: parsed.resource,
            context: parsed.context,
            mode,
          };
          const explain = async () => {
            const decision = await evaluate({
              ...request,
            });
            return negated ? invertDecision(decision) : decision;
          };
          const allowed = async () => {
            const result = await evaluateAllowed({
              ...request,
            });
            return negated ? !result : result;
          };
          return decisionBuilder({ allowed, explain });
        }) as ResourceOn<RuntimeResources, CustomContext>,
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

function decisionBuilder(input: {
  allowed: () => Promise<boolean>;
  explain: () => Promise<Decision>;
}): ResourceDecisionBuilder {
  return {
    then: (onFulfilled, onRejected) => input.allowed().then(onFulfilled, onRejected),
    allowed: input.allowed,
    denied: async () => !(await input.allowed()),
    explain: input.explain,
    throw: async () => {
      const decision = await input.explain();
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
  const memoizedStore = memoizeStoreReads(input.store);
  const entitlementCtx = entitlementContext(input);
  const getPlan = once(() => resolvePlan(input.entitlements, entitlementCtx));
  const getFeatures = once(async () => featuresForPlan(input.entitlements, await getPlan()));
  const limitCache = new Map<string, Promise<number | null>>();
  const getLimitByName = (name: string) =>
    memoizePromise(limitCache, name, async () => limitForPlan(input.entitlements, await getPlan(), name));
  const parents = createParentResolver({
    definition: input.resourceDefinition,
    resource: input.resource,
    store: memoizedStore,
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
    store: memoizedStore,
    parents,
    subscription: {
      plan: getPlan,
    },
    features: {
      has: async (feature) => (await getFeatures()).includes(feature),
      list: getFeatures,
    },
    limits: {
      get: getLimitByName,
      within: async (name, value) => {
        const limit = await getLimitByName(name);
        return limit === null || value.used < limit;
      },
      remaining: async (name, value) => {
        const limit = await getLimitByName(name);
        return limit === null ? null : Math.max(0, limit - value.used);
      },
    },
    relations: {
      has: async (query) => (await memoizedStore.getRelations(query)).length > 0,
      list: (query) => memoizedStore.getRelations(query),
    },
    entityHasRelation: async (relation) =>
      (
        await memoizedStore.getRelations({
          subjectType: input.entityType,
          subjectId: input.entityId,
          relation,
          objectType: input.resourceType,
          objectId: input.resourceId,
        })
      ).length > 0,
    roles: {
      has: async (role, scope) => {
        const roles = await memoizedStore.getRoles(roleQuery(input.entityType, input.entityId, scope));
        return roles.some((grant) => grant.role === role);
      },
      list: (scope) => memoizedStore.getRoles(roleQuery(input.entityType, input.entityId, scope)),
    },
    permissions: {
      has: async (action, resource) => {
        const permissions = await memoizedStore.getPermissions(
          permissionQuery(input.entityType, input.entityId, resource),
        );
        const deny = permissions.some((grant) => grant.action === action && grant.effect === "deny");
        const allow = permissions.some((grant) => grant.action === action && grant.effect === "allow");
        return !deny && allow;
      },
      list: (resource) => memoizedStore.getPermissions(permissionQuery(input.entityType, input.entityId, resource)),
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

function buildResourceActionSets(resources: ResourceMap): ReadonlyMap<string, ReadonlySet<string>> {
  const actionSets = new Map<string, ReadonlySet<string>>();
  for (const [resourceType, resource] of Object.entries(resources)) {
    actionSets.set(resourceType, new Set(resource.actions));
  }
  return actionSets;
}

function mergeResources(
  rootResources: ResourceMap | undefined,
  modules: readonly AnyAuthorModule[] | undefined,
): ResourceMap {
  const resources: ResourceMap = {};
  const sources = new Map<string, string>();
  addResources(resources, sources, "root", rootResources);

  for (const [index, module] of (modules ?? []).entries()) {
    addResources(resources, sources, module.name ?? `module:${index}`, module.resources);
  }

  return resources;
}

function addResources(
  target: ResourceMap,
  sources: Map<string, string>,
  source: string,
  resources: ResourceMap | undefined,
): void {
  if (!resources) return;

  for (const [resourceType, resource] of Object.entries(resources)) {
    const existingSource = sources.get(resourceType);
    if (existingSource) throw new DuplicateResourceTypeError(resourceType, [existingSource, source]);

    target[resourceType] = resource;
    sources.set(resourceType, source);
  }
}

function mergePolicies(
  rootPolicies: readonly Policy<unknown>[] | undefined,
  modules: readonly AnyAuthorModule[] | undefined,
): readonly Policy<unknown>[] {
  return [...(rootPolicies ?? []), ...(modules ?? []).flatMap((module) => module.policies)];
}

function buildPolicyPlan<Ctx>(input: {
  policies: readonly Policy<Ctx>[];
  entities: EntityMap;
  resources: ResourceMap;
}): ReadonlyMap<string, readonly Policy<Ctx>[]> {
  const entityTypes = Object.keys(input.entities);
  const resources = Object.entries(input.resources);
  const plan = new Map<string, Policy<Ctx>[]>();

  for (const entityType of entityTypes) {
    for (const [resourceType, resource] of resources) {
      for (const action of resource.actions) {
        plan.set(selectionKey(entityType, resourceType, action), []);
      }
    }
  }

  for (const policy of input.policies) {
    const scopedEntityTypes = selectPolicyScopeValues(entityTypes, policy.scope?.entityTypes);
    for (const entityType of scopedEntityTypes) {
      for (const [resourceType, resource] of resources) {
        if (!scopeIncludes(policy.scope?.resourceTypes, resourceType)) continue;

        const scopedActions = selectPolicyScopeValues(resource.actions, policy.scope?.actions);
        for (const action of scopedActions) {
          plan.get(selectionKey(entityType, resourceType, action))?.push(policy);
        }
      }
    }
  }

  return plan;
}

function selectPolicyScopeValues(
  availableValues: readonly string[],
  scopedValues: readonly string[] | undefined,
): readonly string[] {
  if (scopedValues === undefined) return availableValues;
  return availableValues.filter((value) => scopedValues.includes(value));
}

function scopeIncludes(scopedValues: readonly string[] | undefined, value: string): boolean {
  return scopedValues === undefined || scopedValues.includes(value);
}

function selectionKey(entityType: string, resourceType: string, action: string): string {
  return `${entityType.length}:${entityType}|${resourceType.length}:${resourceType}|${action.length}:${action}`;
}

async function writeDecisionAuditLog(store: AuthorStore, decision: Decision): Promise<void> {
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
}

async function writeBooleanAuditLog<CustomContext extends Record<string, unknown>>(input: {
  store: AuthorStore;
  request: EvaluateInput<CustomContext>;
  entityId: string;
  resourceId: string;
  allowed: boolean;
  reason: string;
  matchedPolicies: readonly string[];
}): Promise<void> {
  await input.store.writeAuditLog?.({
    id: crypto.randomUUID(),
    entityType: input.request.entityType,
    entityId: input.entityId,
    action: input.request.action,
    resourceType: input.request.resourceType,
    resourceId: input.resourceId,
    allowed: input.allowed,
    reason: input.reason,
    matchedPolicies: [...input.matchedPolicies],
    createdAt: new Date(),
  });
}

function memoizeStoreReads(store: AuthorStore): AuthorStore {
  const roles = new Map<string, Promise<RoleGrant[]>>();
  const permissions = new Map<string, Promise<PermissionGrant[]>>();
  const relations = new Map<string, Promise<RelationTuple[]>>();
  const reads = {
    getRoles: (input: GetRolesInput) => memoizePromise(roles, queryKey(input), () => store.getRoles(input)),
    getPermissions: (input: GetPermissionsInput) =>
      memoizePromise(permissions, queryKey(input), () => store.getPermissions(input)),
    getRelations: (input: GetRelationsInput) =>
      memoizePromise(relations, queryKey(input), () => store.getRelations(input)),
    grantRole: (input: RoleGrantInput) => store.grantRole(input),
    revokeRole: (input: RevokeRoleInput) => store.revokeRole(input),
    grantPermission: (input: PermissionGrantInput) => store.grantPermission(input),
    revokePermission: (input: RevokePermissionInput) => store.revokePermission(input),
    createRelation: (input: RelationTupleInput) => store.createRelation(input),
    deleteRelation: (input: DeleteRelationInput) => store.deleteRelation(input),
  };

  const writeAuditLog = store.writeAuditLog;
  if (!writeAuditLog) return reads;
  return { ...reads, writeAuditLog: (entry) => writeAuditLog.call(store, entry) };
}

function memoizePromise<Value>(
  cache: Map<string, Promise<Value>>,
  key: string,
  create: () => Promise<Value>,
): Promise<Value> {
  const cached = cache.get(key);
  if (cached) return cached;

  const value = create();
  cache.set(key, value);
  return value;
}

function once<Value>(load: () => Promise<Value>): () => Promise<Value> {
  let value: Promise<Value> | null = null;
  return () => {
    value ??= load();
    return value;
  };
}

function queryKey(input: GetRolesInput | GetPermissionsInput | GetRelationsInput): string {
  return Object.entries(input)
    .filter((entry) => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");
}

function featuresForPlan<CustomContext extends Record<string, unknown>>(
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined,
  plan: string | null,
): string[] {
  if (!plan) return [];
  return [...(entitlements?.features?.[plan] ?? [])];
}

function limitForPlan<CustomContext extends Record<string, unknown>>(
  entitlements: EntitlementsConfig<unknown, unknown, CustomContext> | undefined,
  plan: string | null,
  name: string,
): number | null {
  if (!plan) return null;
  return entitlements?.limits?.[plan]?.[name] ?? null;
}
