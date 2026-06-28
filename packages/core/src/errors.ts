import type { Decision } from "./types.js";

/** Base error for all Author JS runtime failures. */
export class AuthorError extends Error {
  /** Stable machine-readable error code. */
  readonly code: string;
  /** Optional structured debugging details. */
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AuthorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Thrown by `.throw()` and `assertCan` when authorization is denied. */
export class AuthorizationDeniedError extends AuthorError {
  constructor(decision: Decision) {
    super("AUTHORIZATION_DENIED", decision.reason, { decision });
    this.name = "AuthorizationDeniedError";
  }
}

/** Thrown when no registered entity definition can be used. */
export class UnknownEntityTypeError extends AuthorError {
  constructor(type: string) {
    super("UNKNOWN_ENTITY_TYPE", `Unknown entity type: ${type}`);
    this.name = "UnknownEntityTypeError";
  }
}

/** Thrown when `.on(type, resource)` references an unknown resource type. */
export class UnknownResourceTypeError extends AuthorError {
  constructor(type: string) {
    super("UNKNOWN_RESOURCE_TYPE", `Unknown resource type: ${type}`);
    this.name = "UnknownResourceTypeError";
  }
}

/** Thrown when an action is not listed on the target resource definition. */
export class UnknownActionError extends AuthorError {
  constructor(action: string, resourceType: string) {
    super("UNKNOWN_ACTION", `Unknown action ${action} for ${resourceType}`);
    this.name = "UnknownActionError";
  }
}
