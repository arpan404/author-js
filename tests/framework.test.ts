import { describe, expect, test } from "bun:test";
import { AuthorizationDeniedError, type Decision } from "../index";
import { requireCan as expressRequireCan } from "../packages/express/src/index";
import { requireCan as fastifyRequireCan } from "../packages/fastify/src/index";
import { requireCan as honoRequireCan } from "../packages/hono/src/index";
import { assertCan, requireCan as nextRequireCan } from "../packages/next/src/index";

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
  test("express requireCan calls next when allowed", async () => {
    type Req = { user: unknown; action: string; project: unknown; ip: string };
    const calls: unknown[] = [];
    const author = { evaluate: async (input: unknown) => { calls.push(input); return allowedDecision; } };
    const middleware = expressRequireCan<Req>({
      author,
      entity: (req) => req.user,
      action: (req) => req.action,
      resourceType: "Project",
      resource: (req) => req.project,
      context: (req) => ({ ip: req.ip }),
    });

    await middleware({ user: "u", action: "read", project: "p", ip: "127.0.0.1" }, { status: () => ({ json: () => undefined }) }, () => calls.push("next"));

    expect(calls).toEqual([{ entity: "u", action: "read", resourceType: "Project", resource: "p", context: { ip: "127.0.0.1" }, mode: "backend" }, "next"]);
  });

  test("express requireCan sends 403 when denied", async () => {
    const author = { evaluate: async () => deniedDecision };
    const sent: unknown[] = [];
    const res = { status: (code: number) => ({ json: (body: unknown) => sent.push({ code, body }) }) };
    const middleware = expressRequireCan({ author, entity: () => ({}), action: "read", resourceType: "Project", resource: () => ({}) });

    await middleware({}, res, () => sent.push("next"));

    expect(sent).toEqual([{ code: 403, body: { error: "Forbidden", reason: "no" } }]);
  });

  test("hono requireCan handles allow and deny", async () => {
    const allowed = honoRequireCan({ author: { evaluate: async () => allowedDecision }, entity: () => ({}), action: "read", resourceType: "Project", resource: () => ({}) });
    const denied = honoRequireCan({ author: { evaluate: async () => deniedDecision }, entity: () => ({}), action: "read", resourceType: "Project", resource: () => ({}) });
    const calls: unknown[] = [];
    const context = { json: (body: unknown, status?: number) => new Response(JSON.stringify({ body, status })) };

    await allowed(context, async () => { calls.push("next"); });
    const response = await denied(context, async () => { calls.push("bad"); });

    expect(calls).toEqual(["next"]);
    expect(response).toBeInstanceOf(Response);
    expect(await response?.json()).toEqual({ body: { error: "Forbidden", reason: "no" }, status: 403 });
  });

  test("fastify requireCan sends only when denied", async () => {
    const sent: unknown[] = [];
    const reply = { code: (status: number) => ({ send: (body: unknown) => sent.push({ status, body }) }) };
    await fastifyRequireCan({ author: { evaluate: async () => allowedDecision }, entity: () => ({}), action: "read", resourceType: "Project", resource: () => ({}) })({}, reply);
    await fastifyRequireCan({ author: { evaluate: async () => deniedDecision }, entity: () => ({}), action: "read", resourceType: "Project", resource: () => ({}) })({}, reply);

    expect(sent).toEqual([{ status: 403, body: { error: "Forbidden", reason: "no" } }]);
  });

  test("next assertCan and requireCan enforce backend checks", async () => {
    await expect(assertCan({ author: { evaluate: async () => allowedDecision }, entity: {}, action: "read", resourceType: "Project", resource: {} })).resolves.toBe(allowedDecision);
    await expect(assertCan({ author: { evaluate: async () => deniedDecision }, entity: {}, action: "read", resourceType: "Project", resource: {} })).rejects.toBeInstanceOf(AuthorizationDeniedError);

    type Req = { user: unknown; project: unknown };
    const check = nextRequireCan<Req>({ author: { evaluate: async () => allowedDecision }, entity: (req) => req.user, action: "read", resourceType: "Project", resource: (req) => req.project });
    await expect(check({ user: "u", project: "p" })).resolves.toBe(allowedDecision);
  });
});
