import type { AuditEntry, AuthorStore, DeleteRelationInput, GetPermissionsInput, GetRelationsInput, GetRolesInput, PermissionGrant, PermissionGrantInput, RelationTuple, RelationTupleInput, RevokePermissionInput, RevokeRoleInput, RoleGrant, RoleGrantInput } from "./types";

function id(): string {
  return crypto.randomUUID();
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return right === undefined || left === right;
}

export type MemoryStore = AuthorStore & {
  readonly roles: readonly RoleGrant[];
  readonly permissions: readonly PermissionGrant[];
  readonly relations: readonly RelationTuple[];
  readonly auditLogs: readonly AuditEntry[];
};

export function memoryStore(): MemoryStore {
  const roles: RoleGrant[] = [];
  const permissions: PermissionGrant[] = [];
  const relations: RelationTuple[] = [];
  const auditLogs: AuditEntry[] = [];

  return {
    roles,
    permissions,
    relations,
    auditLogs,
    async getRoles(input: GetRolesInput) {
      return roles.filter((role) =>
        role.entityType === input.entityType &&
        role.entityId === input.entityId &&
        sameOptional(role.scopeType, input.scopeType) &&
        sameOptional(role.scopeId, input.scopeId),
      );
    },
    async grantRole(input: RoleGrantInput) {
      roles.push({ ...input, id: id(), createdAt: new Date() });
    },
    async revokeRole(input: RevokeRoleInput) {
      const index = roles.findIndex((role) =>
        role.entityType === input.entityType && role.entityId === input.entityId && role.role === input.role &&
        role.scopeType === input.scopeType && role.scopeId === input.scopeId,
      );
      if (index >= 0) roles.splice(index, 1);
    },
    async getPermissions(input: GetPermissionsInput) {
      return permissions.filter((permission) =>
        permission.entityType === input.entityType &&
        permission.entityId === input.entityId &&
        sameOptional(permission.resourceType, input.resourceType) &&
        sameOptional(permission.resourceId, input.resourceId),
      );
    },
    async grantPermission(input: PermissionGrantInput) {
      permissions.push({ ...input, id: id(), createdAt: new Date() });
    },
    async revokePermission(input: RevokePermissionInput) {
      const index = permissions.findIndex((permission) =>
        permission.entityType === input.entityType && permission.entityId === input.entityId &&
        permission.action === input.action && permission.resourceType === input.resourceType &&
        permission.resourceId === input.resourceId && permission.effect === input.effect,
      );
      if (index >= 0) permissions.splice(index, 1);
    },
    async getRelations(input: GetRelationsInput) {
      return relations.filter((relation) =>
        sameOptional(relation.subjectType, input.subjectType) &&
        sameOptional(relation.subjectId, input.subjectId) &&
        sameOptional(relation.relation, input.relation) &&
        sameOptional(relation.objectType, input.objectType) &&
        sameOptional(relation.objectId, input.objectId),
      );
    },
    async createRelation(input: RelationTupleInput) {
      const exists = relations.some((relation) =>
        relation.subjectType === input.subjectType && relation.subjectId === input.subjectId &&
        relation.relation === input.relation && relation.objectType === input.objectType && relation.objectId === input.objectId,
      );
      if (!exists) relations.push({ ...input, id: id(), createdAt: new Date() });
    },
    async deleteRelation(input: DeleteRelationInput) {
      const index = relations.findIndex((relation) =>
        relation.subjectType === input.subjectType && relation.subjectId === input.subjectId &&
        relation.relation === input.relation && relation.objectType === input.objectType && relation.objectId === input.objectId,
      );
      if (index >= 0) relations.splice(index, 1);
    },
    async writeAuditLog(entry: AuditEntry) {
      auditLogs.push(entry);
    },
  };
}
