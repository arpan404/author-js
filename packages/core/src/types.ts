export type Mode = "backend" | "frontend";
export type PolicyEffect = "allow" | "deny";

export type ScopeInput = { type: string; id: string };
export type ResourceInput = { type: string; id?: string };

export type RoleGrant = {
  id: string;
  entityType: string;
  entityId: string;
  role: string;
  scopeType?: string;
  scopeId?: string;
  createdAt: Date;
};

export type RoleGrantInput = Omit<RoleGrant, "id" | "createdAt">;
export type RevokeRoleInput = RoleGrantInput;
export type GetRolesInput = { entityType: string; entityId: string; scopeType?: string; scopeId?: string };

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

export type PermissionGrantInput = Omit<PermissionGrant, "id" | "createdAt">;
export type RevokePermissionInput = PermissionGrantInput;
export type GetPermissionsInput = { entityType: string; entityId: string; resourceType?: string; resourceId?: string };

export type RelationTuple = {
  id: string;
  subjectType: string;
  subjectId: string;
  relation: string;
  objectType: string;
  objectId: string;
  createdAt: Date;
};

export type RelationTupleInput = Omit<RelationTuple, "id" | "createdAt">;
export type DeleteRelationInput = RelationTupleInput;
export type GetRelationsInput = Partial<RelationTupleInput>;

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

export interface AuthorStore {
  getRoles(input: GetRolesInput): Promise<RoleGrant[]>;
  grantRole(input: RoleGrantInput): Promise<void>;
  revokeRole(input: RevokeRoleInput): Promise<void>;
  getPermissions(input: GetPermissionsInput): Promise<PermissionGrant[]>;
  grantPermission(input: PermissionGrantInput): Promise<void>;
  revokePermission(input: RevokePermissionInput): Promise<void>;
  getRelations(input: GetRelationsInput): Promise<RelationTuple[]>;
  createRelation(input: RelationTupleInput): Promise<void>;
  deleteRelation(input: DeleteRelationInput): Promise<void>;
  writeAuditLog?(entry: AuditEntry): Promise<void>;
}

export type ParentRef = { type: string; id: string; data?: unknown };
export type ParentResolver = {
  get(name: string): Promise<ParentRef | null>;
  list(): Promise<Array<ParentRef & { name: string }>>;
};

export type Decision = {
  allowed: boolean;
  effect: PolicyEffect;
  reason: string;
  action: string;
  entity: { type: string; id: string };
  resource: { type: string; id: string };
  matchedPolicies: Array<{ name: string; effect: PolicyEffect; reason: string }>;
  skippedPolicies: Array<{ name: string; reason?: string }>;
  metadata: { evaluatedAt: Date; mode: Mode; durationMs: number };
};
