import type { ResourceDefinition } from "./definitions.js";
import type { AuthorRule } from "./policy.js";

type ModuleResourceMap = Record<string, ResourceDefinition<unknown, string, readonly string[]>>;

/** A composable authorization module containing resource definitions and policies for one domain. */
export type AuthorModule<Resources extends ModuleResourceMap = ModuleResourceMap, Ctx = unknown> = {
  readonly kind: "author-module";
  readonly name?: string;
  readonly resources: Resources;
  readonly policies: readonly AuthorRule<Ctx>[];
};

/** Defines a reusable authorization module. Modules are merged into one `createAuthor` runtime. */
export function defineAuthorModule<const Resources extends ModuleResourceMap, Ctx>(input: {
  readonly name?: string;
  readonly resources: Resources;
  readonly policies: readonly AuthorRule<Ctx>[];
}): AuthorModule<Resources, Ctx> {
  if (input.name === undefined) {
    return { kind: "author-module", resources: input.resources, policies: input.policies };
  }
  return { kind: "author-module", name: input.name, resources: input.resources, policies: input.policies };
}
