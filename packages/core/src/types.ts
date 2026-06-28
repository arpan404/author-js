/** Where a check is being evaluated. Frontend mode is for UX only. */
export type Mode = "backend" | "frontend";

/** Policy and permission grant effects. Deny wins over allow. */
export type PolicyEffect = "allow" | "deny";

/** Resource scope for scoped roles, such as an organization role. */
export type ScopeInput = { type: string; id: string };

/** Resource selector for permission grants. Omit `id` to target all resources of a type. */
export type ResourceInput = { type: string; id?: string };

/** Role assigned to an entity, optionally scoped to a resource. */
export type RoleGrant = {
  id: string;
  entityType: string;
  entityId: string;
  role: string;
  scopeType?: string;
  scopeId?: string;
  createdAt: Date;
};

/** Input for creating a role grant. */
export type RoleGrantInput = Omit<RoleGrant, "id" | "createdAt">;
/** Input for revoking a role grant. */
export type RevokeRoleInput = RoleGrantInput;
/** Query for role grants belonging to an entity, optionally scoped. */
export type GetRolesInput = { entityType: string; entityId: string; scopeType?: string; scopeId?: string };

/** Direct permission grant for an entity and resource. */
export type PermissionGrant = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  effect: PolicyEffect;
  createdAt: Date;
};

/** Input for creating a permission grant. */
export type PermissionGrantInput = Omit<PermissionGrant, "id" | "createdAt">;
/** Input for revoking a permission grant. */
export type RevokePermissionInput = PermissionGrantInput;
/** Query for permission grants belonging to an entity, optionally filtered by resource. */
export type GetPermissionsInput = { entityType: string; entityId: string; resourceType?: string; resourceId?: string };

/** Relationship tuple for ReBAC checks, e.g. `User:user_1 owner Project:project_1`. */
export type RelationTuple = {
  id: string;
  subjectType: string;
  subjectId: string;
  relation: string;
  objectType: string;
  objectId: string;
  createdAt: Date;
};

/** Input for creating a relation tuple. */
export type RelationTupleInput = Omit<RelationTuple, "id" | "createdAt">;
/** Input for deleting a relation tuple. */
export type DeleteRelationInput = RelationTupleInput;
/** Relation query. Omitted fields act as wildcards. */
export type GetRelationsInput = Partial<RelationTupleInput>;

/** Audit log entry written after an authorization decision. */
export type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  allowed: boolean;
  reason: string;
  matchedPolicies: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

/** Adapter interface for persistence-backed roles, permissions, relations, and audit logs. */
export interface AuthorStore {
  /** Lists roles for an entity, optionally scoped. */
  getRoles(input: GetRolesInput): Promise<RoleGrant[]>;
  /** Grants a role to an entity. */
  grantRole(input: RoleGrantInput): Promise<void>;
  /** Revokes a role from an entity. */
  revokeRole(input: RevokeRoleInput): Promise<void>;
  /** Lists direct permission grants for an entity. */
  getPermissions(input: GetPermissionsInput): Promise<PermissionGrant[]>;
  /** Grants a direct permission to an entity. */
  grantPermission(input: PermissionGrantInput): Promise<void>;
  /** Revokes a direct permission from an entity. */
  revokePermission(input: RevokePermissionInput): Promise<void>;
  /** Lists relation tuples matching a partial query. */
  getRelations(input: GetRelationsInput): Promise<RelationTuple[]>;
  /** Creates a relation tuple. Implementations should ignore duplicates when possible. */
  createRelation(input: RelationTupleInput): Promise<void>;
  /** Deletes a relation tuple. */
  deleteRelation(input: DeleteRelationInput): Promise<void>;
  /** Optional audit sink called after decisions are evaluated. */
  writeAuditLog?(entry: AuditEntry): Promise<void>;
}

/** Parent resource reference resolved from a child resource. */
export type ParentRef = { type: string; id: string; data?: unknown };

/** Resolver for named parent resources configured on a resource definition. */
export type ParentResolver = {
  /** Gets one named parent reference, or `null` when it does not exist. */
  get(name: string): Promise<ParentRef | null>;
  /** Lists every configured parent reference for the current resource. */
  list(): Promise<Array<ParentRef & { name: string }>>;
};

/** Rich result for one authorization check. */
export type Decision = {
  /** True when the final decision allows the action. */
  allowed: boolean;
  /** Final effect after deny-overrides-allow evaluation. */
  effect: PolicyEffect;
  /** Human-readable reason, usually the first matching policy name. */
  reason: string;
  /** Action that was evaluated. */
  action: string;
  /** Entity reference used for the check. */
  entity: { type: string; id: string };
  /** Resource reference used for the check. */
  resource: { type: string; id: string };
  /** Policies that matched, with deny policies listed before allows. */
  matchedPolicies: Array<{ name: string; effect: PolicyEffect; reason: string }>;
  /** Policies that ran but did not match. */
  skippedPolicies: Array<{ name: string; reason?: string }>;
  /** Evaluation metadata for logging and diagnostics. */
  metadata: { evaluatedAt: Date; mode: Mode; durationMs: number };
};
