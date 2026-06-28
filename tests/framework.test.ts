import { describe, expect, test } from "bun:test";
import { assertCan } from "../packages/next/src/index";
import { requireCan as expressRequireCan } from "../packages/express/src/index";
import type { Decision } from "../index";

const allowedDecision: Decision = {
  allowed: true,
  effect: "allow",
  reason: "ok",
  action: "read",
  entity: { type: "User", id: "u1" },
  resource: { type: "Project", id: "p1" },
  matchedPolicies: [],
  skippedPolicies: [],
  metadata: { evaluatedAt: new Date(), mode: "backend", durationMs: 0 },
};

const deniedDecision = { ...allowedDecision, allowed: false, effect: "deny", reason: "no" } satisfies Decision;

describe("framework adapters", () => {
  test("next assertCan returns allowed decision", async () => {
    const author = { evaluate: async () => allowedDecision };
    await expect(assertCan({ author, entity: {}, action: "read", resourceType: "Project", resource: {} })).resolves.toBe(allowedDecision);
  });

  test("express requireCan sends 403 when denied", async () => {
    const author = { evaluate: async () => deniedDecision };
    const sent: unknown[] = [];
    const res = { status: (code: number) => ({ json: (body: unknown) => sent.push({ code, body }) }) };
    const middleware = expressRequireCan({
      author,
      entity: () => ({}),
      action: "read",
      resourceType: "Project",
      resource: () => ({}),
    });
    await middleware({}, res, () => sent.push("next"));
    expect(sent).toEqual([{ code: 403, body: { error: "Forbidden", reason: "no" } }]);
  });
});
