import { useCannot } from "./useCannot";
import type { CanProps } from "./types";

export function Cannot(props: CanProps) {
  const result = useCannot(props);
  if (result.loading) return null;
  return result.allowed ? <>{props.children}</> : <>{props.fallback ?? null}</>;
}
