import { useCan } from "./useCan";
import type { CanProps } from "./types";

export function Can(props: CanProps) {
  const result = useCan(props);
  if (result.loading) return null;
  return result.allowed ? <>{props.children}</> : <>{props.fallback ?? null}</>;
}
