import type { ReactNode } from "react";
import type { Decision, Mode } from "../../core/src/index.js";

/** Minimal author instance shape consumed by the React adapter. */
export type ReactAuthor = {
  /** Evaluates one authorization request. */
  evaluate(input: {
    entity: unknown;
    action: string;
    resourceType: string;
    resource: unknown;
    context: Record<string, unknown>;
    mode: Mode;
  }): Promise<Decision>;
};

/** Props for `AuthorProvider`. */
export type AuthorProviderProps = {
  /** Authorization engine used by hooks and components. */
  authorization: ReactAuthor;
  /** Default entity for child checks. Can be overridden with `i`. */
  entity?: unknown;
  /** Evaluation mode. Defaults to `frontend`; frontend checks are UX only. */
  mode?: Mode;
  children: ReactNode;
};

/** Value stored in React context by `AuthorProvider`. */
export type AuthorContextValue = {
  authorization: ReactAuthor;
  entity?: unknown;
  mode: Mode;
};

/** Input accepted by `useCan`, `useCannot`, `Can`, and `Cannot`. */
export type UseCanInput = {
  /** Optional entity override. Defaults to provider entity. */
  i?: unknown;
  /** Action to check, for example `update`. */
  do: string;
  /** Resource type to check, for example `Project`. */
  on: string;
  /** Resource instance to authorize against. */
  resource: unknown;
  /** Optional request context passed to policies. */
  context?: Record<string, unknown>;
};

/** Async authorization state returned by React hooks. */
export type UseCanResult = {
  allowed: boolean;
  loading: boolean;
  error: Error | null;
  decision: Decision | null;
};

/** Props for `Can` and `Cannot`. */
export type CanProps = UseCanInput & {
  /** Rendered when a finished check denies. Loading renders null. */
  fallback?: ReactNode;
  children: ReactNode;
};
