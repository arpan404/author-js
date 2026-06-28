import { AuthorContext } from "./author-context";
import type { AuthorProviderProps } from "./types";

/** Provides an Author JS instance and default entity to authorization hooks and components. */
export function AuthorProvider({ authorization, entity, mode = "frontend", children }: AuthorProviderProps) {
  return <AuthorContext.Provider value={{ authorization, entity, mode }}>{children}</AuthorContext.Provider>;
}
