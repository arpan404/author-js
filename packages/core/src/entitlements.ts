import type { Mode } from "./types.js";

type MaybePromise<T> = T | Promise<T>;

/** Minimal context passed to subscription and entitlement resolvers. */
export type EntitlementContext<Entity, Resource, CustomContext extends Record<string, unknown>> = {
  entity: Entity;
  action: string;
  resource: { type: string; id: string; data: Resource };
  context: CustomContext;
  mode: Mode;
};

/** Plan-based features and limits used by policy helpers. */
export type EntitlementPlanResolver<Entity, Resource, CustomContext extends Record<string, unknown>> = {
  bivarianceHack(ctx: EntitlementContext<Entity, Resource, CustomContext>): MaybePromise<string | null>;
}["bivarianceHack"];

export type EntitlementsConfig<Entity, Resource, CustomContext extends Record<string, unknown>> = {
  /** Current plan name, or an async resolver that can read entity/resource/context. */
  plan: string | null | EntitlementPlanResolver<Entity, Resource, CustomContext>;
  /** Feature names enabled per plan. */
  features?: Record<string, readonly string[]>;
  /** Numeric limits per plan, for example `{ pro: { seats: 10 } }`. */
  limits?: Record<string, Record<string, number>>;
};
