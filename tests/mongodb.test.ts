import { describe, expect, test } from "bun:test";
import { ensureMongoIndexes, mongodbStore, type MongoClientLike } from "../packages/mongodb/src/index";

class FakeCollection {
  rows: readonly unknown[] = [];
  readonly inserts: unknown[] = [];
  readonly indexes: unknown[] = [];

  find() {
    return { toArray: async () => this.rows };
  }
  async insertOne(document: Record<string, unknown>) {
    this.inserts.push(document);
  }
  async deleteOne() {
    return {};
  }
  async createIndex(index: Record<string, unknown>, options?: Record<string, unknown>) {
    this.indexes.push({ index, options });
  }
}

class FakeMongo implements MongoClientLike {
  readonly collections = new Map<string, FakeCollection>();
  db() {
    return { collection: (name: string) => this.collection(name) };
  }
  collection(name: string) {
    const existing = this.collections.get(name);
    if (existing) return existing;
    const collection = new FakeCollection();
    this.collections.set(name, collection);
    return collection;
  }
}

describe("mongodbStore", () => {
  test("maps relations and creates indexes", async () => {
    const client = new FakeMongo();
    const relations = client.collection("author_relations");
    relations.rows = [
      {
        _id: "r1",
        subjectType: "User",
        subjectId: "u1",
        relation: "owner",
        objectType: "Project",
        objectId: "p1",
        createdAt: new Date("2024-01-01"),
      },
    ];
    const store = mongodbStore({ client, database: "app" });

    await expect(store.getRelations({ subjectId: "u1" })).resolves.toEqual([
      {
        id: "r1",
        subjectType: "User",
        subjectId: "u1",
        relation: "owner",
        objectType: "Project",
        objectId: "p1",
        createdAt: new Date("2024-01-01"),
      },
    ]);
    await ensureMongoIndexes({ client, database: "app" });

    expect(relations.indexes.length).toBe(3);
  });
});
