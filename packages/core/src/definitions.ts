export type EntityDefinition<T, Type extends string = string> = {
  kind: "entity";
  type: Type;
  id(entity: T): string;
};

export type ResourceParent<T> = {
  type: string;
  id(resource: T): string;
};

export type ResourceDefinition<
  T,
  Type extends string = string,
  Actions extends readonly string[] = readonly string[],
> = {
  kind: "resource";
  type: Type;
  id(resource: T): string;
  actions: Actions;
  parents?: Record<string, ResourceParent<T>>;
};

export function defineEntity<T>() {
  return function createEntityDefinition<const Type extends string>(input: {
    type: Type;
    id(entity: T): string;
  }): EntityDefinition<T, Type> {
    return { kind: "entity", type: input.type, id: input.id };
  };
}

export function defineResource<T>() {
  return function createResourceDefinition<
    const Type extends string,
    const Actions extends readonly string[],
  >(input: {
    type: Type;
    id(resource: T): string;
    actions: Actions;
    parents?: Record<string, ResourceParent<T>>;
  }): ResourceDefinition<T, Type, Actions> {
    return { kind: "resource", ...input };
  };
}
