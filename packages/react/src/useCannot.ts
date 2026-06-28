import { useCan } from "./useCan.js";
import type { UseCanInput, UseCanResult } from "./types.js";

/** Runs an async `cannot` check by inverting `useCan`. */
export function useCannot(input: UseCanInput): UseCanResult {
  const result = useCan(input);
  if (result.loading || result.error) return result;
  return { ...result, allowed: !result.allowed };
}
