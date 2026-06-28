import { AuthorContext } from "./author-context.js";
import type { AuthorProviderProps } from "./types.js";

/** Provides an Author JS instance and default entity to authorization hooks and components. */
export function AuthorProvider({ authorization, entity, mode = "frontend", context = {}, children }: AuthorProviderProps) {
  return <AuthorContext.Provider value={{ authorization, entity, mode, context }}>{children}</AuthorContext.Provider>;
}
