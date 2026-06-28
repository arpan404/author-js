export { createAuthor } from "./create-author";
export { defineEntity, defineResource } from "./definitions";
export { AuthorError, AuthorizationDeniedError, UnknownActionError, UnknownEntityTypeError, UnknownResourceTypeError } from "./errors";
export { memoryStore } from "./memory-store";
export { allow, deny, skip } from "./policy";
export type { AuthorInstance, CreateAuthorInput, ResourceDecisionBuilder } from "./create-author";
export type { EntityDefinition, ResourceDefinition, ResourceParent } from "./definitions";
export type { AuthorPolicyContext, Policy, PolicyChecker, PolicyResult } from "./policy";
export type * from "./types";
