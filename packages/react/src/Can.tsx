import { useCan } from "./useCan.js";
import type { CanProps } from "./types.js";

/** Renders children when the current entity can perform an action on a resource. */
export function Can(props: CanProps) {
  const result = useCan(props);
  if (result.loading) return null;
  return result.allowed ? props.children : (props.fallback ?? null);
}
