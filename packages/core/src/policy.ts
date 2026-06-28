import type { AuthorStore, Mode, ParentResolver, PermissionGrant, RelationTuple, RoleGrant, ScopeInput, ResourceInput, PolicyEffect } from "./types.js";

/** Result returned by a policy checker after normalization. */
export type PolicyResult =
  | { effect: "allow"; reason: string }
  | { effect: "deny"; reason: string }
  | { effect: "skip"; reason?: string };

/** Query shape for listing or testing relationship tuples. Omitted fields act as wildcards. */
export type RelationQuery = Partial<RelationTuple>;

/** Data available inside every policy checker. */
export type AuthorPolicyContext<Entity, Resource, CustomContext extends Record<string, unknown>> = {
  /** Current actor being authorized. */
  entity: Entity;
  /** Action being checked, for example `read`, `update`, or `delete`. */
  action: string;
  /** Resource reference and original resource data. */
  resource: { type: string; id: string; data: Resource };
  /** Caller-provided request context such as IP address, tenant, or flags. */
  context: CustomContext;
  /** Evaluation mode. Frontend mode is only for UX; enforce security on the backend. */
  mode: Mode;
  /** Store adapter backing roles, permissions, relations, and audit logs. */
  store: AuthorStore;
  /** Parent resource resolver for nested authorization checks. */
  parents: ParentResolver;
  /** Subscription helpers for plan-aware authorization. */
  subscription: {
    /** Returns the current plan, or null when no subscription applies. */
    plan(): Promise<string | null>;
  };
  /** Feature flag helpers resolved from the current plan. */
  features: {
    /** Returns true when the current plan includes the feature. */
    has(feature: string): Promise<boolean>;
    /** Lists all features enabled for the current plan. */
    list(): Promise<string[]>;
  };
  /** Numeric limit helpers resolved from the current plan. */
  limits: {
    /** Returns the configured limit, or null when unlimited/unconfigured. */
    get(name: string): Promise<number | null>;
    /** Returns true when `used` is below the configured limit. Null limit means allowed. */
    within(name: string, input: { used: number }): Promise<boolean>;
    /** Returns remaining units, or null when unlimited/unconfigured. */
    remaining(name: string, input: { used: number }): Promise<number | null>;
  };
  /** Relationship-based authorization helpers. */
  relations: {
    /** Returns true when at least one relation tuple matches the query. */
    has(input: RelationQuery): Promise<boolean>;
    /** Lists relation tuples matching the query. */
    list(input: RelationQuery): Promise<RelationTuple[]>;
  };
  /** Convenience check for `entity --relation--> current resource`. */
  entityHasRelation(relation: string): Promise<boolean>;
  /** Role-based authorization helpers scoped to the current entity. */
  roles: {
    /** Returns true when the current entity has the role, optionally within a scope. */
    has(role: string, scope?: ScopeInput): Promise<boolean>;
    /** Lists roles for the current entity, optionally within a scope. */
    list(scope?: ScopeInput): Promise<RoleGrant[]>;
  };
  /** Direct permission grant helpers scoped to the current entity. */
  permissions: {
    /** Returns true when an allow grant exists and no deny grant matches. */
    has(action: string, resource?: ResourceInput): Promise<boolean>;
    /** Lists permission grants for the current entity, optionally for a resource. */
    list(resource?: ResourceInput): Promise<PermissionGrant[]>;
  };
};

/** A policy function. Return `true` to match, `false` to skip, or a detailed `PolicyResult`. */
export type PolicyChecker<Ctx> = {
  bivarianceHack(ctx: Ctx): boolean | PolicyResult | Promise<boolean | PolicyResult>;
}["bivarianceHack"];

/** Named allow/deny rule evaluated by the authorization engine. */
export type Policy<Ctx> = { name: string; effect: PolicyEffect; check: PolicyChecker<Ctx> };

/** Creates an allow policy. A `true` checker result becomes an allow decision reasoned by `name`. */
export function allow<Ctx>(name: string, check: PolicyChecker<Ctx>): Policy<Ctx> {
  return { name, effect: "allow", check };
}

/** Creates a deny policy. Deny policies override all allow policies. */
export function deny<Ctx>(name: string, check: PolicyChecker<Ctx>): Policy<Ctx> {
  return { name, effect: "deny", check };
}

/** Explicitly skips a policy with an optional explanation for `Decision.skippedPolicies`. */
export function skip(reason?: string): PolicyResult {
  return reason === undefined ? { effect: "skip" } : { effect: "skip", reason };
}

/** Converts boolean policy returns into structured policy results. */
export function normalizePolicyResult<Ctx>(policy: Policy<Ctx>, result: boolean | PolicyResult): PolicyResult {
  if (typeof result === "boolean") {
    return result ? { effect: policy.effect, reason: policy.name } : { effect: "skip" };
  }
  return result;
}
