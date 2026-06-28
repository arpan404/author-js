import { createContext, useContext } from "react";
import type { AuthorContextValue } from "./types.js";

export const AuthorContext = createContext<AuthorContextValue | null>(null);

/** Returns the current Author context or throws when used outside `AuthorProvider`. */
export function useAuthor(): AuthorContextValue {
  const value = useContext(AuthorContext);
  if (value === null) throw new Error("AuthorProvider is required");
  return value;
}

/** Returns the current Author context, or null outside `AuthorProvider`. */
export function useOptionalAuthor(): AuthorContextValue | null {
  return useContext(AuthorContext);
}
