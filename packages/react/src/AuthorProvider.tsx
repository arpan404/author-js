import { AuthorContext } from "./author-context";
import type { AuthorProviderProps } from "./types";

export function AuthorProvider({ authorization, entity, mode = "frontend", children }: AuthorProviderProps) {
  return <AuthorContext.Provider value={{ authorization, entity, mode }}>{children}</AuthorContext.Provider>;
}
