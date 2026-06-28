export { createAuthor } from "./create-author.js";
export { defineEntity, defineResource } from "./definitions.js";
export { AuthorError, AuthorizationDeniedError, UnknownActionError, UnknownEntityTypeError, UnknownResourceTypeError } from "./errors.js";
export { memoryStore } from "./memory-store.js";
export { allow, deny, skip } from "./policy.js";
export type { AuthorInstance, CreateAuthorInput, ResourceDecisionBuilder } from "./create-author.js";
export type { EntityDefinition, ResourceDefinition, ResourceParent } from "./definitions.js";
export type { AuthorPolicyContext, Policy, PolicyChecker, PolicyResult } from "./policy.js";
export type * from "./types.js";
