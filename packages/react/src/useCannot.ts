import { useCan } from "./useCan";
import type { UseCanInput, UseCanResult } from "./types";

export function useCannot(input: UseCanInput): UseCanResult {
  const result = useCan(input);
  if (result.loading || result.error) return result;
  return { ...result, allowed: !result.allowed };
}
