import type { ReactNode } from "react";
import type { Decision, Mode } from "../../core/src/index";

export type ReactAuthor = {
  evaluate(input: {
    entity: unknown;
    action: string;
    resourceType: string;
    resource: unknown;
    context: Record<string, unknown>;
    mode: Mode;
  }): Promise<Decision>;
};

export type AuthorProviderProps = {
  authorization: ReactAuthor;
  entity?: unknown;
  mode?: Mode;
  children: ReactNode;
};

export type AuthorContextValue = {
  authorization: ReactAuthor;
  entity?: unknown;
  mode: Mode;
};

export type UseCanInput = {
  i?: unknown;
  do: string;
  on: string;
  resource: unknown;
  context?: Record<string, unknown>;
};

export type UseCanResult = {
  allowed: boolean;
  loading: boolean;
  error: Error | null;
  decision: Decision | null;
};

export type CanProps = UseCanInput & {
  fallback?: ReactNode;
  children: ReactNode;
};
