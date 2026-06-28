import type { AuthorStore, Mode, ParentResolver, PermissionGrant, RelationTuple, RoleGrant, ScopeInput, ResourceInput, PolicyEffect } from "./types";

export type PolicyResult =
  | { effect: "allow"; reason: string }
  | { effect: "deny"; reason: string }
  | { effect: "skip"; reason?: string };

export type AuthorPolicyContext<Entity, Resource, CustomContext extends Record<string, unknown>> = {
  entity: Entity;
  action: string;
  resource: { type: string; id: string; data: Resource };
  context: CustomContext;
  mode: Mode;
  store: AuthorStore;
  parents: ParentResolver;
  relations: {
    has(input: Partial<RelationTuple>): Promise<boolean>;
    list(input: Partial<RelationTuple>): Promise<RelationTuple[]>;
  };
  roles: {
    has(role: string, scope?: ScopeInput): Promise<boolean>;
    list(scope?: ScopeInput): Promise<RoleGrant[]>;
  };
  permissions: {
    has(action: string, resource?: ResourceInput): Promise<boolean>;
    list(resource?: ResourceInput): Promise<PermissionGrant[]>;
  };
};

export type PolicyChecker<Ctx> = {
  bivarianceHack(ctx: Ctx): boolean | PolicyResult | Promise<boolean | PolicyResult>;
}["bivarianceHack"];
export type Policy<Ctx> = { name: string; effect: PolicyEffect; check: PolicyChecker<Ctx> };

export function allow<Ctx>(name: string, check: PolicyChecker<Ctx>): Policy<Ctx> {
  return { name, effect: "allow", check };
}

export function deny<Ctx>(name: string, check: PolicyChecker<Ctx>): Policy<Ctx> {
  return { name, effect: "deny", check };
}

export function skip(reason?: string): PolicyResult {
  return reason === undefined ? { effect: "skip" } : { effect: "skip", reason };
}

export function normalizePolicyResult<Ctx>(policy: Policy<Ctx>, result: boolean | PolicyResult): PolicyResult {
  if (typeof result === "boolean") {
    return result ? { effect: policy.effect, reason: policy.name } : { effect: "skip" };
  }
  return result;
}
