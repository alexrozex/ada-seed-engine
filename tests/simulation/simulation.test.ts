/**
 * simulation.test.ts — Full message flow simulation
 *
 * Verifies the six scenarios from GEOMETRY.md Appendix B:
 * 1. Full system boot from intent
 * 2. Normal work cycle (content creation)
 * 3. Agent failure and recovery
 * 4. Evolution (specialization)
 * 5. Compiler self-compilation
 * 6. Human interaction (escalation)
 *
 * Each scenario is tested by verifying that the compiled topology
 * has the correct message routes for the interaction pattern.
 */

import { describe, it, expect } from "vitest";
import { compile } from "@ada/compiler/compile.js";
import { verify } from "@ada/compiler/verifier.js";
import type { LlmCaller } from "@ada/compiler/compile.js";
import type { Topology } from "@ada/schema/index.js";

// ─── Mock LLM ──────────────────────────────────────────────────────────

function mockLlm(): LlmCaller {
  return async (prompt: string): Promise<string> => {
    if (prompt.includes("intent parser")) {
      return JSON.stringify({
        objective: "Manage barbershop operations",
        entities: [
          { name: "WSB", type: "business", attributes: { model: "walk-in" } },
        ],
        constraints: ["Walk-in only", "No booking"],
        implied_domains: ["operations", "social media", "reputation"],
        scale: "4 barbers",
        channels: ["instagram"],
      });
    }

    if (prompt.includes("agent architect")) {
      return JSON.stringify({
        agents: [
          {
            id: "wsb-ops",
            name: "Ops Manager",
            objective: "Coordinate ops",
            complexity: "low",
            type: "leaf",
            domain: "operations",
            must: ["Coordinate agents", "Produce daily summary"],
            must_not: ["Book appointments", "Share data externally"],
            accepts: [
              "task_assignment",
              "heartbeat_ping",
              "escalation",
              "verdict_request",
            ],
            emits: [
              "task_assignment",
              "task_result",
              "escalation",
              "heartbeat_pong",
              "verdict",
            ],
            state_domains: ["daily_log"],
            supervisor: "governor",
          },
          {
            id: "wsb-social",
            name: "Social Content",
            objective: "Instagram content",
            complexity: "low",
            type: "leaf",
            domain: "social",
            must: ["Publish 4 posts/week to Instagram", "Track engagement"],
            must_not: ["Post without review", "Use stock photos"],
            accepts: ["task_assignment", "heartbeat_ping", "verdict"],
            emits: [
              "task_result",
              "verdict_request",
              "heartbeat_pong",
              "escalation",
            ],
            state_domains: ["content_calendar"],
            supervisor: "wsb-ops",
          },
          {
            id: "wsb-reputation",
            name: "Reputation",
            objective: "Monitor reviews",
            complexity: "low",
            type: "leaf",
            domain: "reputation",
            must: ["Monitor Google reviews daily"],
            must_not: ["Respond rudely", "Ignore reviews"],
            accepts: ["task_assignment", "heartbeat_ping"],
            emits: ["task_result", "escalation", "heartbeat_pong"],
            state_domains: ["review_history"],
            supervisor: "wsb-ops",
          },
        ],
        root_agent: "wsb-ops",
        composition: "wsb-ops supervises wsb-social and wsb-reputation",
      });
    }

    if (prompt.includes("contract engineer")) {
      return JSON.stringify({
        must: [
          "Fulfill core responsibility",
          "Respond to heartbeats",
          "Escalate when needed",
        ],
        must_not: [
          "Book appointments",
          "Act outside scope",
          "Share customer data",
        ],
        specialization_triggers: [
          {
            condition: "Workload exceeds capacity for 7 days",
            action: "Request split",
          },
        ],
        death_conditions: [{ condition: "Business closure" }],
      });
    }

    return JSON.stringify({ error: "Unrecognized" });
  };
}

// ─── Scenario 1: Boot ──────────────────────────────────────────────────

describe("Scenario 1: Full system boot", () => {
  it("compiles intent into bootable topology", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    expect(result.topology.agents.length).toBeGreaterThanOrEqual(3);
    expect(result.system.workspaces.length).toBeGreaterThan(0);

    // Every agent should have a workspace with SOUL.md
    for (const ws of result.system.workspaces) {
      const hasSoul = ws.files.some((f) => f.path === "SOUL.md");
      expect(hasSoul).toBe(true);
    }
  });

  it("every agent has an identity and contract in emitted files", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    for (const ws of result.system.workspaces) {
      const soul = ws.files.find((f) => f.path === "SOUL.md")!;
      expect(soul.content).toContain("Must Do");
      expect(soul.content).toContain("Must Never");

      const identity = ws.files.find((f) => f.path === "IDENTITY.md")!;
      expect(identity.content).toContain(ws.agent_id);
    }
  });
});

// ─── Scenario 2: Normal work cycle ─────────────────────────────────────

describe("Scenario 2: Normal work cycle", () => {
  it("social agent can receive task_assignment and emit task_result", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const social = result.topology.agents.find(
      (a) => a.identity.id === "wsb-social",
    );
    expect(social).toBeDefined();

    const acceptsTask = social!.interface.accepts.some(
      (m) => m.type === "task_assignment",
    );
    const emitsResult = social!.interface.emits.some(
      (m) => m.type === "task_result",
    );
    expect(acceptsTask).toBe(true);
    expect(emitsResult).toBe(true);
  });

  it("social agent can request verdict for content review", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const social = result.topology.agents.find(
      (a) => a.identity.id === "wsb-social",
    );
    const emitsVerdict = social!.interface.emits.some(
      (m) => m.type === "verdict_request",
    );
    expect(emitsVerdict).toBe(true);
  });
});

// ─── Scenario 3: Failure and recovery ──────────────────────────────────

describe("Scenario 3: Failure and recovery", () => {
  it("with aggressive threshold, includes health monitor", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 0.3,
      llm: mockLlm(),
    });

    const hasMonitor = result.topology.agents.some(
      (a) =>
        a.identity.id.includes("monitor") || a.identity.id.includes("health"),
    );
    // At aggressive threshold, monitor should be added
    expect(hasMonitor).toBe(true);
  });
});

// ─── Scenario 4: Evolution ─────────────────────────────────────────────

describe("Scenario 4: Evolution signals", () => {
  it("agents have specialization triggers", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    // At least one agent should have specialization triggers
    const hasSpecTriggers = result.topology.agents.some(
      (a) => a.lifecycle.specialization_triggers.length > 0,
    );
    expect(hasSpecTriggers).toBe(true);
  });
});

// ─── Scenario 5: Verification ──────────────────────────────────────────

describe("Scenario 5: Topology verification", () => {
  it("compiled topology passes verification", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const verification = verify(result.topology);
    // Should pass (no errors) — warnings are acceptable
    expect(verification.passed).toBe(true);
  });

  it("verification reports correct agent count", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const verification = verify(result.topology);
    expect(verification.stats.total_agents).toBe(result.topology.agents.length);
  });
});

// ─── Scenario 6: Human escalation ──────────────────────────────────────

describe("Scenario 6: Human escalation path", () => {
  it("agents can emit escalation messages", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    // At least one domain agent should be able to escalate
    const canEscalate = result.topology.agents.some((a) =>
      a.interface.emits.some((m) => m.type === "escalation"),
    );
    expect(canEscalate).toBe(true);
  });

  it("governance config points to human escalation target", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const gov = JSON.parse(result.system.governance_json);
    expect(gov.escalation_target).toBe("operator");
    expect(gov.escalation_channel).toBeDefined();
  });
});

// ─── Provenance ────────────────────────────────────────────────────────

describe("Provenance chain", () => {
  it("every agent traces back to seed", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    for (const agent of result.topology.agents) {
      // Lineage should contain at least a seed reference
      expect(agent.identity.lineage.length).toBeGreaterThan(0);
    }
  });

  it("provenance records all stages", async () => {
    const result = await compile("Run barbershop ops", {
      threshold: 1.0,
      llm: mockLlm(),
    });

    const stageNames = result.provenance.stages.map((s) => s.stage);
    expect(stageNames).toContain("intent_parse");
    expect(stageNames).toContain("agent_extraction");
    expect(stageNames).toContain("infrastructure_completion");
    expect(stageNames).toContain("validation");
  });
});
