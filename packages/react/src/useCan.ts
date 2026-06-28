import { useEffect, useState } from "react";
import { useOptionalAuthor } from "./author-context.js";
import type { Decision } from "../../core/src/index.js";
import type { UseCanInput, UseCanResult } from "./types.js";

const missingProvider = new Error("AuthorProvider is required");
const missingEntity = new Error("Author entity is required");

/** Runs an async `can` check and returns loading, error, boolean, and decision state. */
export function useCan(input: UseCanInput): UseCanResult {
  const author = useOptionalAuthor();
  const entityType = input.iType ?? author?.entityType;
  const entity = input.i ?? author?.entity;
  const [state, setState] = useState<UseCanResult>({ allowed: false, loading: true, error: null, decision: null });
  const mergedContext = { ...(author?.context ?? {}), ...(input.context ?? {}) };
  const resourceKey = stableKey(input.resource);
  const contextKey = stableKey(mergedContext);

  useEffect(() => {
    let active = true;
    if (author === null) {
      setState({ allowed: false, loading: false, error: missingProvider, decision: null });
      return () => { active = false; };
    }
    if (entityType === undefined || entity === undefined) {
      setState({ allowed: false, loading: false, error: missingEntity, decision: null });
      return () => { active = false; };
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    author.authorization.evaluate({
      entityType,
      entity,
      action: input.do,
      resourceType: input.on,
      resource: input.resource,
      context: mergedContext,
      mode: author.mode,
    }).then((decision) => {
      if (active) setState(fromDecision(decision));
    }).catch((error: unknown) => {
      if (active) setState({ allowed: false, loading: false, error: toError(error), decision: null });
    });

    return () => { active = false; };
  }, [author, entityType, entity, input.do, input.on, resourceKey, contextKey]);

  return state;
}

function stableKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return String(value);
  }
}

function fromDecision(decision: Decision): UseCanResult {
  return { allowed: decision.allowed, loading: false, error: null, decision };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
