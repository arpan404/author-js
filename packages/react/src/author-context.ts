import { createContext, useContext } from "react";
import type { AuthorContextValue } from "./types";

export const AuthorContext = createContext<AuthorContextValue | null>(null);

export function useAuthor(): AuthorContextValue {
  const value = useContext(AuthorContext);
  if (value === null) throw new Error("AuthorProvider is required");
  return value;
}

export function useOptionalAuthor(): AuthorContextValue | null {
  return useContext(AuthorContext);
}
