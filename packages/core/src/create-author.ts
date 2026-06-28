import type { EntityDefinition, ResourceDefinition } from "./definitions";
import { AuthorizationDeniedError, UnknownActionError, UnknownEntityTypeError, UnknownResourceTypeError } from "./errors";
import { normalizePolicyResult, type AuthorPolicyContext, type Policy } from "./policy";
import { memoryStore } from "./memory-store";
import type { AuthorStore, Decision, GetPermissionsInput, GetRolesInput, Mode, ParentRef, ParentResolver, PolicyEffect, ResourceInput, ScopeInput } from "./types";

type EntityMap = Record<string, EntityDefinition<unknown, string>>;
type ResourceMap = Record<string, ResourceDefinition<unknown, string, readonly string[]>>;
type EntityValue<Entities> = Entities[keyof Entities] extends EntityDefinition<infer Entity, string> ? Entity : never;
type ResourceValue<Resources, Type extends keyof Resources> = Resources[Type] extends ResourceDefinition<infer Resource, string, readonly string[]> ? Resource : never;
type ResourceAction<Resources> = Resources[keyof Resources] extends ResourceDefinition<unknown, string, infer Actions> ? Actions[number] : string;
type TypedResource<Resources, Type extends keyof Resources & string> = ResourceValue<Resources, Type> & { readonly authorType: Type };
type ResourceOn<Resources, CustomContext extends Record<string, unknown>> = {
  <Type extends keyof Resources & string>(resourceType: Type, resource: ResourceValue<Resources, Type>, context?: CustomContext): ResourceDecisionBuilder;
  <Type extends keyof Resources & string>(resource: TypedResource<Resources, Type>, context?: CustomContext): ResourceDecisionBuilder;
};
type PolicyContext<Entities, Resources, CustomContext extends Record<string, unknown>> = AuthorPolicyContext<
  EntityValue<Entities>,
  ResourceValue<Resources, keyof Resources>,
  CustomContext
>;

export type CreateAuthorInput<Entities, Resources, CustomContext extends Record<string, unknown>> = {
  entities: Entities;
  resources: Resources;
  policies: readonly Policy<PolicyContext<Entities, Resources, CustomContext>>[];
  store?: AuthorStore;
  mode?: Mode;
};

type EvaluateInput<CustomContext extends Record<string, unknown>> = {
  entity: unknown;
  action: string;
  resourceType: string;
  resource: unknown;
  context: CustomContext;
  mode: Mode;
};

export type ResourceDecisionBuilder = {
  allowed(): Promise<boolean>;
  denied(): Promise<boolean>;
  explain(): Promise<Decision>;
  throw(): Promise<void>;
};

export type AuthorInstance<Entities, Resources, CustomContext extends Record<string, unknown>> = {
  as(entity: EntityValue<Entities>): {
    can<Action extends ResourceAction<Resources>>(action: Action): { on: ResourceOn<Resources, CustomContext> };
    cannot<Action extends ResourceAction<Resources>>(action: Action): { on: ResourceOn<Resources, CustomContext> };
  };
  evaluate(input: EvaluateInput<CustomContext>): Promise<Decision>;
  readonly store: AuthorStore;
};

export function createAuthor<
  const Entities extends EntityMap,
  const Resources extends ResourceMap,
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(input: CreateAuthorInput<Entities, Resources, CustomContext>): AuthorInstance<Entities, Resources, CustomContext> {
  const store = input.store ?? memoryStore();
  const mode = input.mode ?? "backend";

  async function evaluate(request: EvaluateInput<CustomContext>): Promise<Decision> {
    const startedAt = performance.now();
    const entityDefinition = firstValue(input.entities);
    if (!entityDefinition) throw new UnknownEntityTypeError("<none>");

    const resourceDefinition = input.resources[request.resourceType];
    if (!resourceDefinition) throw new UnknownResourceTypeError(request.resourceType);
    if (!resourceDefinition.actions.includes(request.action)) throw new UnknownActionError(request.action, request.resourceType);

    const entityId = entityDefinition.id(request.entity);
    const resourceId = resourceDefinition.id(request.resource);
    const ctx = buildContext({
      entity: request.entity,
      action: request.action,
      resourceType: request.resourceType,
      resourceId,
      resource: request.resource,
      context: request.context,
      mode: request.mode,
      store,
      entityType: entityDefinition.type,
      entityId,
      resourceDefinition,
    });

    const matchedAllows: Decision["matchedPolicies"] = [];
    const matchedDenies: Decision["matchedPolicies"] = [];
    const skippedPolicies: Decision["skippedPolicies"] = [];

    for (const policy of input.policies) {
      const raw = await policy.check(ctx as unknown as PolicyContext<Entities, Resources, CustomContext>);
      const result = normalizePolicyResult(policy, raw);
      if (result.effect === "skip") {
        skippedPolicies.push(result.reason === undefined ? { name: policy.name } : { name: policy.name, reason: result.reason });
      } else if (result.effect === "deny") {
        matchedDenies.push({ name: policy.name, effect: "deny", reason: result.reason });
      } else {
        matchedAllows.push({ name: policy.name, effect: "allow", reason: result.reason });
      }
    }

    const decision = makeDecision({
      action: request.action,
      entityType: entityDefinition.type,
      entityId,
      resourceType: request.resourceType,
      resourceId,
      matchedDenies,
      matchedAllows,
      skippedPolicies,
      mode: request.mode,
      durationMs: performance.now() - startedAt,
    });

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
    evaluate,
    as(entity) {
      const chain = (negated: boolean) => (action: ResourceAction<Resources>) => ({
        on: ((first: string | TypedResource<Resources, keyof Resources & string>, second?: ResourceValue<Resources, keyof Resources> | CustomContext, third?: CustomContext) => {
          const parsed = parseResourceInput(first, second, third);
          const run = async () => {
            const decision = await evaluate({ entity, action, resourceType: parsed.resourceType, resource: parsed.resource, context: parsed.context, mode });
            return negated ? invertDecision(decision) : decision;
          };
          return decisionBuilder(run);
        }) as ResourceOn<Resources, CustomContext>,
      });
      return { can: chain(false), cannot: chain(true) };
    },
  };
}

function firstValue<T>(record: Record<string, T>): T | undefined {
  return Object.values(record)[0];
}

function emptyContext<CustomContext extends Record<string, unknown>>(): CustomContext {
  return {} as CustomContext;
}

function decisionBuilder(run: () => Promise<Decision>): ResourceDecisionBuilder {
  return {
    allowed: async () => (await run()).allowed,
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
  return { resourceType: first.authorType, resource: first, context: isContext(second) ? second : emptyContext<CustomContext>() };
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
}): PolicyContext<EntityMap, ResourceMap, CustomContext> {
  const parents = createParentResolver(input.resourceDefinition, input.resource);
  return {
    entity: input.entity,
    action: input.action,
    resource: { type: input.resourceType, id: input.resourceId, data: input.resource },
    context: input.context,
    mode: input.mode,
    store: input.store,
    parents,
    relations: {
      has: async (query) => (await input.store.getRelations(query)).length > 0,
      list: (query) => input.store.getRelations(query),
    },
    entityHasRelation: async (relation) => (await input.store.getRelations({
      subjectType: input.entityType,
      subjectId: input.entityId,
      relation,
      objectType: input.resourceType,
      objectId: input.resourceId,
    })).length > 0,
    roles: {
      has: async (role, scope) => {
        const roles = await input.store.getRoles(roleQuery(input.entityType, input.entityId, scope));
        return roles.some((grant) => grant.role === role);
      },
      list: (scope) => input.store.getRoles(roleQuery(input.entityType, input.entityId, scope)),
    },
    permissions: {
      has: async (action, resource) => {
        const permissions = await input.store.getPermissions(permissionQuery(input.entityType, input.entityId, resource));
        const deny = permissions.some((grant) => grant.action === action && grant.effect === "deny");
        const allow = permissions.some((grant) => grant.action === action && grant.effect === "allow");
        return !deny && allow;
      },
      list: (resource) => input.store.getPermissions(permissionQuery(input.entityType, input.entityId, resource)),
    },
  };
}

function roleQuery(entityType: string, entityId: string, scope: ScopeInput | undefined): GetRolesInput {
  return scope ? { entityType, entityId, scopeType: scope.type, scopeId: scope.id } : { entityType, entityId };
}

function permissionQuery(entityType: string, entityId: string, resource: ResourceInput | undefined): GetPermissionsInput {
  if (!resource) return { entityType, entityId };
  return resource.id === undefined
    ? { entityType, entityId, resourceType: resource.type }
    : { entityType, entityId, resourceType: resource.type, resourceId: resource.id };
}

function createParentResolver(definition: ResourceDefinition<unknown, string, readonly string[]>, resource: unknown): ParentResolver {
  const parents = definition.parents ?? {};
  const resolve = (name: string): ParentRef | null => {
    const parent = parents[name];
    return parent ? { type: parent.type, id: parent.id(resource) } : null;
  };
  return {
    async get(name) {
      return resolve(name);
    },
    async list() {
      return Object.entries(parents).map(([name, parent]) => ({ name, type: parent.type, id: parent.id(resource) }));
    },
  };
}
