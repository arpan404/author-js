import type { Decision } from "./types";

export class AuthorError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AuthorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class AuthorizationDeniedError extends AuthorError {
  constructor(decision: Decision) {
    super("AUTHORIZATION_DENIED", decision.reason, { decision });
    this.name = "AuthorizationDeniedError";
  }
}

export class UnknownEntityTypeError extends AuthorError {
  constructor(type: string) {
    super("UNKNOWN_ENTITY_TYPE", `Unknown entity type: ${type}`);
    this.name = "UnknownEntityTypeError";
  }
}

export class UnknownResourceTypeError extends AuthorError {
  constructor(type: string) {
    super("UNKNOWN_RESOURCE_TYPE", `Unknown resource type: ${type}`);
    this.name = "UnknownResourceTypeError";
  }
}

export class UnknownActionError extends AuthorError {
  constructor(action: string, resourceType: string) {
    super("UNKNOWN_ACTION", `Unknown action ${action} for ${resourceType}`);
    this.name = "UnknownActionError";
  }
}
