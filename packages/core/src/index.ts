export { decisionCacheKey, memoryCache } from "./cache.js";
export { createAuthor } from "./create-author.js";
export { defineContext, defineEntity, defineResource } from "./definitions.js";
export {
  AuthorError,
  AuthorizationDeniedError,
  MissingParentResourceError,
  UnknownActionError,
  UnknownEntityTypeError,
  UnknownResourceTypeError,
} from "./errors.js";
export { memoryStore } from "./memory-store.js";
export { allow, deny, skip } from "./policy.js";
export type { AuthorCache, CacheKeyInput } from "./cache.js";
export type { AuthorInstance, CreateAuthorInput, ResourceDecisionBuilder } from "./create-author.js";
export type { ContextDefinition, EntityDefinition, ResourceDefinition, ResourceParent } from "./definitions.js";
export type { EntitlementContext, EntitlementsConfig } from "./entitlements.js";
export type { AuthorPolicyContext, Policy, PolicyChecker, PolicyResult } from "./policy.js";
export type * from "./types.js";
