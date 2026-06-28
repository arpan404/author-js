import type { AuditEntry, AuthorStore, DeleteRelationInput, GetPermissionsInput, GetRelationsInput, GetRolesInput, PermissionGrant, PermissionGrantInput, PolicyEffect, RelationTuple, RelationTupleInput, RevokePermissionInput, RevokeRoleInput, RoleGrant, RoleGrantInput } from "../../core/src/index";
import { mongoCollections } from "./collections";

type MongoQuery = Record<string, unknown>;
type MongoFindResult = { toArray(): Promise<readonly unknown[]> };
type MongoCollection = {
  find(query: MongoQuery): MongoFindResult;
  insertOne(document: MongoQuery): Promise<unknown>;
  deleteOne(query: MongoQuery): Promise<unknown>;
  createIndex(index: MongoQuery, options?: MongoQuery): Promise<unknown>;
};
type MongoDatabase = { collection(name: string): MongoCollection };
export type MongoClientLike = { db(name: string): MongoDatabase };
export type MongoStoreInput = { client: MongoClientLike; database: string };

export function mongodbStore(input: MongoStoreInput): AuthorStore {
  const db = input.client.db(input.database);
  const roles = db.collection(mongoCollections.roles);
  const permissions = db.collection(mongoCollections.permissions);
  const relations = db.collection(mongoCollections.relations);
  const auditLogs = db.collection(mongoCollections.auditLogs);

  return {
    getRoles: (query) => findRoles(roles, query),
    grantRole: (role) => insert(roles, roleDocument(role)),
    revokeRole: (role) => remove(roles, roleQuery(role)),
    getPermissions: (query) => findPermissions(permissions, query),
    grantPermission: (permission) => insert(permissions, permissionDocument(permission)),
    revokePermission: (permission) => remove(permissions, permissionQuery(permission)),
    getRelations: (query) => findRelations(relations, query),
    createRelation: (relation) => insert(relations, relationDocument(relation)),
    deleteRelation: (relation) => remove(relations, relationQuery(relation)),
    writeAuditLog: (entry) => insert(auditLogs, auditDocument(entry)),
  };
}

export async function ensureMongoIndexes(input: MongoStoreInput): Promise<void> {
  const db = input.client.db(input.database);
  await Promise.all([
    db.collection(mongoCollections.roles).createIndex({ entityType: 1, entityId: 1 }),
    db.collection(mongoCollections.roles).createIndex({ scopeType: 1, scopeId: 1 }),
    db.collection(mongoCollections.permissions).createIndex({ entityType: 1, entityId: 1 }),
    db.collection(mongoCollections.permissions).createIndex({ resourceType: 1, resourceId: 1 }),
    db.collection(mongoCollections.relations).createIndex({ subjectType: 1, subjectId: 1 }),
    db.collection(mongoCollections.relations).createIndex({ objectType: 1, objectId: 1 }),
    db.collection(mongoCollections.relations).createIndex({ subjectType: 1, subjectId: 1, relation: 1, objectType: 1, objectId: 1 }, { unique: true }),
    db.collection(mongoCollections.auditLogs).createIndex({ entityType: 1, entityId: 1 }),
    db.collection(mongoCollections.auditLogs).createIndex({ resourceType: 1, resourceId: 1 }),
    db.collection(mongoCollections.auditLogs).createIndex({ createdAt: 1 }),
  ]);
}

async function insert(collection: MongoCollection, document: MongoQuery): Promise<void> {
  await collection.insertOne(document);
}

async function remove(collection: MongoCollection, query: MongoQuery): Promise<void> {
  await collection.deleteOne(query);
}

async function findRoles(collection: MongoCollection, input: GetRolesInput): Promise<RoleGrant[]> {
  return (await collection.find(withOptionals({ entityType: input.entityType, entityId: input.entityId }, "scopeType", input.scopeType, "scopeId", input.scopeId)).toArray()).map(readRole).filter((role) => role !== null);
}

async function findPermissions(collection: MongoCollection, input: GetPermissionsInput): Promise<PermissionGrant[]> {
  return (await collection.find(withOptionals({ entityType: input.entityType, entityId: input.entityId }, "resourceType", input.resourceType, "resourceId", input.resourceId)).toArray()).map(readPermission).filter((permission) => permission !== null);
}

async function findRelations(collection: MongoCollection, input: GetRelationsInput): Promise<RelationTuple[]> {
  return (await collection.find(withOptionals({}, "subjectType", input.subjectType, "subjectId", input.subjectId, "relation", input.relation, "objectType", input.objectType, "objectId", input.objectId)).toArray()).map(readRelation).filter((relation) => relation !== null);
}

function roleDocument(input: RoleGrantInput): MongoQuery {
  return withOptionals({ _id: crypto.randomUUID(), entityType: input.entityType, entityId: input.entityId, role: input.role, createdAt: new Date() }, "scopeType", input.scopeType, "scopeId", input.scopeId);
}

function permissionDocument(input: PermissionGrantInput): MongoQuery {
  return withOptionals({ _id: crypto.randomUUID(), entityType: input.entityType, entityId: input.entityId, action: input.action, resourceType: input.resourceType, effect: input.effect, createdAt: new Date() }, "resourceId", input.resourceId);
}

function relationDocument(input: RelationTupleInput): MongoQuery {
  return { _id: crypto.randomUUID(), subjectType: input.subjectType, subjectId: input.subjectId, relation: input.relation, objectType: input.objectType, objectId: input.objectId, createdAt: new Date() };
}

function auditDocument(input: AuditEntry): MongoQuery {
  return withOptionals({ _id: input.id, entityType: input.entityType, entityId: input.entityId, action: input.action, resourceType: input.resourceType, resourceId: input.resourceId, allowed: input.allowed, reason: input.reason, matchedPolicies: input.matchedPolicies, createdAt: input.createdAt }, "metadata", input.metadata);
}

function roleQuery(input: RevokeRoleInput): MongoQuery {
  return withOptionals({ entityType: input.entityType, entityId: input.entityId, role: input.role }, "scopeType", input.scopeType, "scopeId", input.scopeId);
}

function permissionQuery(input: RevokePermissionInput): MongoQuery {
  return withOptionals({ entityType: input.entityType, entityId: input.entityId, action: input.action, resourceType: input.resourceType, effect: input.effect }, "resourceId", input.resourceId);
}

function relationQuery(input: DeleteRelationInput): MongoQuery {
  return { subjectType: input.subjectType, subjectId: input.subjectId, relation: input.relation, objectType: input.objectType, objectId: input.objectId };
}

function readRole(document: unknown): RoleGrant | null {
  if (!isRecord(document)) return null;
  const id = idAt(document);
  const entityType = stringAt(document, "entityType");
  const entityId = stringAt(document, "entityId");
  const role = stringAt(document, "role");
  const createdAt = dateAt(document, "createdAt");
  return id && entityType && entityId && role && createdAt ? optional({ id, entityType, entityId, role, createdAt }, "scopeType", stringAt(document, "scopeType"), "scopeId", stringAt(document, "scopeId")) : null;
}

function readPermission(document: unknown): PermissionGrant | null {
  if (!isRecord(document)) return null;
  const id = idAt(document);
  const entityType = stringAt(document, "entityType");
  const entityId = stringAt(document, "entityId");
  const action = stringAt(document, "action");
  const resourceType = stringAt(document, "resourceType");
  const effect = effectAt(document, "effect");
  const createdAt = dateAt(document, "createdAt");
  return id && entityType && entityId && action && resourceType && effect && createdAt ? optional({ id, entityType, entityId, action, resourceType, effect, createdAt }, "resourceId", stringAt(document, "resourceId")) : null;
}

function readRelation(document: unknown): RelationTuple | null {
  if (!isRecord(document)) return null;
  const id = idAt(document);
  const subjectType = stringAt(document, "subjectType");
  const subjectId = stringAt(document, "subjectId");
  const relation = stringAt(document, "relation");
  const objectType = stringAt(document, "objectType");
  const objectId = stringAt(document, "objectId");
  const createdAt = dateAt(document, "createdAt");
  return id && subjectType && subjectId && relation && objectType && objectId && createdAt ? { id, subjectType, subjectId, relation, objectType, objectId, createdAt } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function idAt(row: Record<string, unknown>): string | undefined {
  const id = row["id"] ?? row["_id"];
  return typeof id === "string" ? id : undefined;
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

function withOptionals(base: MongoQuery, ...entries: readonly [string, unknown, string?, unknown?, string?, unknown?, string?, unknown?, string?, unknown?]): MongoQuery {
  const output: MongoQuery = { ...base };
  for (let index = 0; index < entries.length; index += 2) {
    const key = entries[index];
    const value = entries[index + 1];
    if (typeof key === "string" && value !== undefined) output[key] = value;
  }
  return output;
}
