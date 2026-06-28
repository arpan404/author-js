import type { AuditEntry, AuthorStore, DeleteRelationInput, GetPermissionsInput, GetRelationsInput, GetRolesInput, PermissionGrant, PermissionGrantInput, PolicyEffect, RelationTuple, RelationTupleInput, RevokePermissionInput, RevokeRoleInput, RoleGrant, RoleGrantInput } from "../../core/src/index";

export type PostgresClient = {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: readonly unknown[] }>;
};

export type PostgresStoreInput = { client: PostgresClient } | { connectionString: string };

export function postgresStore(input: PostgresStoreInput): AuthorStore {
  if (!("client" in input)) throw new Error("postgresStore({ connectionString }) needs a pg-compatible client; pass { client } in v1");
  const db = input.client;
  return {
    getRoles: (query) => getRoles(db, query),
    grantRole: (role) => exec(db, `INSERT INTO author_roles (id, entity_type, entity_id, role, scope_type, scope_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [crypto.randomUUID(), role.entityType, role.entityId, role.role, role.scopeType ?? null, role.scopeId ?? null, new Date()]),
    revokeRole: (role) => exec(db, `DELETE FROM author_roles WHERE entity_type = $1 AND entity_id = $2 AND role = $3 AND scope_type IS NOT DISTINCT FROM $4 AND scope_id IS NOT DISTINCT FROM $5`, [role.entityType, role.entityId, role.role, role.scopeType ?? null, role.scopeId ?? null]),
    getPermissions: (query) => getPermissions(db, query),
    grantPermission: (permission) => exec(db, `INSERT INTO author_permissions (id, entity_type, entity_id, action, resource_type, resource_id, effect, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [crypto.randomUUID(), permission.entityType, permission.entityId, permission.action, permission.resourceType, permission.resourceId ?? null, permission.effect, new Date()]),
    revokePermission: (permission) => exec(db, `DELETE FROM author_permissions WHERE entity_type = $1 AND entity_id = $2 AND action = $3 AND resource_type = $4 AND resource_id IS NOT DISTINCT FROM $5 AND effect = $6`, [permission.entityType, permission.entityId, permission.action, permission.resourceType, permission.resourceId ?? null, permission.effect]),
    getRelations: (query) => getRelations(db, query),
    createRelation: (relation) => exec(db, `INSERT INTO author_relations (id, subject_type, subject_id, relation, object_type, object_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`, [crypto.randomUUID(), relation.subjectType, relation.subjectId, relation.relation, relation.objectType, relation.objectId, new Date()]),
    deleteRelation: (relation) => exec(db, `DELETE FROM author_relations WHERE subject_type = $1 AND subject_id = $2 AND relation = $3 AND object_type = $4 AND object_id = $5`, [relation.subjectType, relation.subjectId, relation.relation, relation.objectType, relation.objectId]),
    writeAuditLog: (entry) => exec(db, `INSERT INTO author_audit_logs (id, entity_type, entity_id, action, resource_type, resource_id, allowed, reason, matched_policies, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [entry.id, entry.entityType, entry.entityId, entry.action, entry.resourceType, entry.resourceId, entry.allowed, entry.reason, JSON.stringify(entry.matchedPolicies), JSON.stringify(entry.metadata ?? {}), entry.createdAt]),
  };
}

async function exec(db: PostgresClient, sql: string, values: readonly unknown[]): Promise<void> {
  await db.query(sql, values);
}

async function getRoles(db: PostgresClient, input: GetRolesInput): Promise<RoleGrant[]> {
  const result = await db.query(`SELECT id, entity_type, entity_id, role, scope_type, scope_id, created_at FROM author_roles WHERE entity_type = $1 AND entity_id = $2 AND ($3::text IS NULL OR scope_type = $3) AND ($4::text IS NULL OR scope_id = $4)`, [input.entityType, input.entityId, input.scopeType ?? null, input.scopeId ?? null]);
  return result.rows.map(readRole).filter((role) => role !== null);
}

async function getPermissions(db: PostgresClient, input: GetPermissionsInput): Promise<PermissionGrant[]> {
  const result = await db.query(`SELECT id, entity_type, entity_id, action, resource_type, resource_id, effect, created_at FROM author_permissions WHERE entity_type = $1 AND entity_id = $2 AND ($3::text IS NULL OR resource_type = $3) AND ($4::text IS NULL OR resource_id = $4)`, [input.entityType, input.entityId, input.resourceType ?? null, input.resourceId ?? null]);
  return result.rows.map(readPermission).filter((permission) => permission !== null);
}

async function getRelations(db: PostgresClient, input: GetRelationsInput): Promise<RelationTuple[]> {
  const result = await db.query(`SELECT id, subject_type, subject_id, relation, object_type, object_id, created_at FROM author_relations WHERE ($1::text IS NULL OR subject_type = $1) AND ($2::text IS NULL OR subject_id = $2) AND ($3::text IS NULL OR relation = $3) AND ($4::text IS NULL OR object_type = $4) AND ($5::text IS NULL OR object_id = $5)`, [input.subjectType ?? null, input.subjectId ?? null, input.relation ?? null, input.objectType ?? null, input.objectId ?? null]);
  return result.rows.map(readRelation).filter((relation) => relation !== null);
}

function readRole(row: unknown): RoleGrant | null {
  if (!isRecord(row)) return null;
  const id = stringAt(row, "id");
  const entityType = stringAt(row, "entity_type");
  const entityId = stringAt(row, "entity_id");
  const role = stringAt(row, "role");
  const createdAt = dateAt(row, "created_at");
  if (!id || !entityType || !entityId || !role || !createdAt) return null;
  return optional({ id, entityType, entityId, role, createdAt }, "scopeType", stringAt(row, "scope_type"), "scopeId", stringAt(row, "scope_id"));
}

function readPermission(row: unknown): PermissionGrant | null {
  if (!isRecord(row)) return null;
  const id = stringAt(row, "id");
  const entityType = stringAt(row, "entity_type");
  const entityId = stringAt(row, "entity_id");
  const action = stringAt(row, "action");
  const resourceType = stringAt(row, "resource_type");
  const effect = effectAt(row, "effect");
  const createdAt = dateAt(row, "created_at");
  if (!id || !entityType || !entityId || !action || !resourceType || !effect || !createdAt) return null;
  return optional({ id, entityType, entityId, action, resourceType, effect, createdAt }, "resourceId", stringAt(row, "resource_id"));
}

function readRelation(row: unknown): RelationTuple | null {
  if (!isRecord(row)) return null;
  const id = stringAt(row, "id");
  const subjectType = stringAt(row, "subject_type");
  const subjectId = stringAt(row, "subject_id");
  const relation = stringAt(row, "relation");
  const objectType = stringAt(row, "object_type");
  const objectId = stringAt(row, "object_id");
  const createdAt = dateAt(row, "created_at");
  return id && subjectType && subjectId && relation && objectType && objectId && createdAt ? { id, subjectType, subjectId, relation, objectType, objectId, createdAt } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringAt(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
}

function effectAt(row: Record<string, unknown>, key: string): PolicyEffect | undefined {
  const value = row[key];
  return value === "allow" || value === "deny" ? value : undefined;
}

function dateAt(row: Record<string, unknown>, key: string): Date | undefined {
  const value = row[key];
  if (value instanceof Date) return value;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optional<T extends object, K1 extends string, K2 extends string>(base: T, key: K1, value: string | undefined, key2?: K2, value2?: string | undefined): T & Partial<Record<K1 | K2, string>> {
  return { ...base, ...(value === undefined ? {} : { [key]: value }), ...(key2 === undefined || value2 === undefined ? {} : { [key2]: value2 }) };
}
