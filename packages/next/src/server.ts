import { AuthorizationDeniedError, type Decision } from "../../core/src/index";

type MaybePromise<T> = T | Promise<T>;
type AuthorLike = {
  evaluate(input: { entity: unknown; action: string; resourceType: string; resource: unknown; context: Record<string, unknown>; mode: "backend" }): Promise<Decision>;
};

export type AssertCanInput = {
  author: AuthorLike;
  entity: unknown;
  action: string;
  resourceType: string;
  resource: unknown;
  context?: Record<string, unknown>;
};

export type NextRequireCanOptions<Req> = {
  author: AuthorLike;
  entity(request: Req): MaybePromise<unknown>;
  action: string | ((request: Req) => MaybePromise<string>);
  resourceType: string | ((request: Req) => MaybePromise<string>);
  resource(request: Req): MaybePromise<unknown>;
  context?: (request: Req) => MaybePromise<Record<string, unknown>>;
};

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
