import { AuthorizationDeniedError, type Decision } from "../../core/src/index";

type MaybePromise<T> = T | Promise<T>;
type AuthorLike = {
  evaluate(input: { entity: unknown; action: string; resourceType: string; resource: unknown; context: Record<string, unknown>; mode: "backend" }): Promise<Decision>;
};

/** Input for server-side Next.js authorization assertions. */
export type AssertCanInput = {
  author: AuthorLike;
  entity: unknown;
  action: string;
  resourceType: string;
  resource: unknown;
  context?: Record<string, unknown>;
};

/** Options for building reusable Next.js server authorization checks. */
export type NextRequireCanOptions<Req> = {
  author: AuthorLike;
  entity(request: Req): MaybePromise<unknown>;
  action: string | ((request: Req) => MaybePromise<string>);
  resourceType: string | ((request: Req) => MaybePromise<string>);
  resource(request: Req): MaybePromise<unknown>;
  context?: (request: Req) => MaybePromise<Record<string, unknown>>;
};

/** Evaluates a backend check and throws `AuthorizationDeniedError` when denied. */
export async function assertCan(input: AssertCanInput): Promise<Decision> {
  const decision = await input.author.evaluate({
    entity: input.entity,
    action: input.action,
    resourceType: input.resourceType,
    resource: input.resource,
    context: input.context ?? {},
    mode: "backend",
  });
  if (!decision.allowed) throw new AuthorizationDeniedError(decision);
  return decision;
}

/** Creates a reusable request-to-decision helper for Next.js route handlers and server actions. */
export function requireCan<Req>(options: NextRequireCanOptions<Req>) {
  return async (request: Req): Promise<Decision> => {
    const [entity, action, resourceType, resource, context] = await Promise.all([
      options.entity(request),
      value(options.action, request),
      value(options.resourceType, request),
      options.resource(request),
      options.context?.(request) ?? {},
    ]);
    return assertCan({ author: options.author, entity, action, resourceType, resource, context });
  };
}

function value<Req>(input: string | ((request: Req) => MaybePromise<string>), request: Req): MaybePromise<string> {
  return typeof input === "string" ? input : input(request);
}
