import { useCannot } from "./useCannot";
import type { CanProps } from "./types";

/** Renders children when the current entity cannot perform an action on a resource. */
export function Cannot(props: CanProps) {
  const result = useCannot(props);
  if (result.loading) return null;
  return result.allowed ? <>{props.children}</> : <>{props.fallback ?? null}</>;
}
