/** Describes how Author JS identifies an application entity, such as a user or service account. */
export type EntityDefinition<T, Type extends string = string> = {
  /** Internal marker used to distinguish entity definitions from resources. */
  kind: "entity";
  /** Stable entity type name used in decisions, roles, permissions, relations, and audit logs. */
  type: Type;
  /** Returns the stable ID for an entity instance. */
  id(entity: T): string;
};

/** A named parent reference for nested authorization checks. */
export type ResourceParent<T> = {
  /** Parent resource type, for example `Organization`. */
  type: string;
  /** Returns the parent resource ID from the child resource. */
  id(resource: T): string;
};

/** Describes a protected resource, its valid actions, and optional parent references. */
export type ResourceDefinition<
  T,
  Type extends string = string,
  Actions extends readonly string[] = readonly string[],
> = {
  /** Internal marker used to distinguish resource definitions from entities. */
  kind: "resource";
  /** Stable resource type name used by `.on(type, resource)`. */
  type: Type;
  /** Returns the stable ID for a resource instance. */
  id(resource: T): string;
  /** Actions allowed to be checked against this resource type. */
  actions: Actions;
  /** Optional parent resources for nested checks, for example project → organization. */
  parents?: Record<string, ResourceParent<T>>;
};

/**
 * Defines an entity type and ID resolver.
 *
 * @example
 * const User = defineEntity<User>()({ type: "User", id: (user) => user.id });
 */
export function defineEntity<T>() {
  return function createEntityDefinition<const Type extends string>(input: {
    /** Stable entity type name. */
    type: Type;
    /** Returns a stable entity ID. */
    id(entity: T): string;
  }): EntityDefinition<T, Type> {
    return { kind: "entity", type: input.type, id: input.id };
  };
}

/**
 * Defines a resource type, valid actions, ID resolver, and optional parents.
 *
 * @example
 * const Project = defineResource<Project>()({
 *   type: "Project",
 *   id: (project) => project.id,
 *   actions: ["read", "update"] as const,
 * });
 */
export function defineResource<T>() {
  return function createResourceDefinition<
    const Type extends string,
    const Actions extends readonly string[],
  >(input: {
    /** Stable resource type name. */
    type: Type;
    /** Returns a stable resource ID. */
    id(resource: T): string;
    /** Actions that may be checked for this resource. */
    actions: Actions;
    /** Optional named parent references for nested authorization. */
    parents?: Record<string, ResourceParent<T>>;
  }): ResourceDefinition<T, Type, Actions> {
    return { kind: "resource", ...input };
  };
}
