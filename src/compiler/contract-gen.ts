/**
 * contract-gen.ts — Stage 4: Generate full contracts for each agent
 *
 * Takes agent specs (from extraction) and produces complete AgentPrimitive
 * objects with validated contracts, interfaces, and lifecycle configuration.
 *
 * This is the highest-stakes stage — contracts define the behavioral bounds
 * of every agent. Uses opus-4-6 for maximum reliability.
 */

import { z } from "zod";
import type { AgentSpec } from "./agent-extractor.js";
import type { AgentPrimitive } from "../schema/index.js";

/**
 * Convert an AgentSpec into a full AgentPrimitive.
 * This is deterministic — no LLM needed for the conversion itself.
 * The LLM was used in extraction to produce the spec.
 */
export function specToAgent(
  spec: AgentSpec,
  compilationId: string,
  seedId: string,
  scopePrefix: string,
): AgentPrimitive {
  const scope =
    scopePrefix === "*"
      ? `${spec.id.split("-")[0]}.*`
      : `${scopePrefix}.${spec.domain}`;

  return {
    kind: "primitive",
    identity: {
      id: spec.id,
      name: spec.name,
      created: new Date().toISOString(),
      lineage: [seedId, compilationId],
    },
    contract: {
      must: spec.must,
      must_not: spec.must_not,
      scope,
    },
    interface: {
      accepts: spec.accepts.map((type) => ({ type })),
      emits: spec.emits.map((type) => ({ type })),
    },
    state: {
      owns: spec.state_domains,
      persists: true,
    },
    lifecycle: {
      status: "alive",
      supervisor: spec.supervisor,
      specialization_triggers: [],
      death_conditions: [],
    },
  };
}

/**
 * Build the prompt for contract refinement.
 * This stage takes the basic spec and produces a richer contract
 * with specialization triggers and death conditions.
 */
export function buildContractRefinementPrompt(
  spec: AgentSpec,
  parentConstraints: string[],
  siblingIds: string[],
): string {
  return `You are a contract engineer for an autonomous agent system.

Given this agent specification, produce a refined contract with specialization triggers and death conditions.

AGENT: ${spec.name} (${spec.id})
OBJECTIVE: ${spec.objective}
DOMAIN: ${spec.domain}
CURRENT MUST: ${JSON.stringify(spec.must)}
CURRENT MUST_NOT: ${JSON.stringify(spec.must_not)}
PARENT CONSTRAINTS: ${JSON.stringify(parentConstraints)}
SIBLING AGENTS: ${JSON.stringify(siblingIds)}

Rules:
- Keep all existing must/must_not. You may ADD to them but never remove.
- Specialization triggers: conditions that indicate this agent should split into sub-agents.
  Format: "IF <condition> THEN <action>"
  Only include if the agent's domain could genuinely need subdivision.
- Death conditions: when this agent should be shut down.
  These should be meaningful (e.g., "service discontinued") not trivial.
- Parent constraints MUST be inherited into must_not if not already present.
- No agent should have capabilities that overlap with its siblings.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "must": ["string — all behaviors this agent MUST exhibit"],
  "must_not": ["string — all behaviors this agent MUST NOT exhibit"],
  "specialization_triggers": [
    {"condition": "string", "action": "string"}
  ],
  "death_conditions": [
    {"condition": "string"}
  ]
}`;
}

// ─── Contract Refinement Response ──────────────────────────────────────

export const ContractRefinement = z.object({
  must: z.array(z.string()),
  must_not: z.array(z.string()),
  specialization_triggers: z.array(
    z.object({
      condition: z.string(),
      action: z.string(),
    }),
  ),
  death_conditions: z.array(
    z.object({
      condition: z.string(),
    }),
  ),
});
export type ContractRefinement = z.infer<typeof ContractRefinement>;

/**
 * Apply a contract refinement to an existing AgentPrimitive.
 */
export function applyRefinement(
  agent: AgentPrimitive,
  refinement: ContractRefinement,
): AgentPrimitive {
  return {
    ...agent,
    contract: {
      ...agent.contract,
      must: refinement.must,
      must_not: refinement.must_not,
    },
    lifecycle: {
      ...agent.lifecycle,
      specialization_triggers: refinement.specialization_triggers,
      death_conditions: refinement.death_conditions,
    },
  };
}

/**
 * Parse the LLM response for contract refinement.
 */
export function parseContractRefinement(response: string): ContractRefinement {
  const cleaned = response
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error(
        `Contract refinement: LLM returned invalid JSON.\nResponse: ${cleaned.slice(0, 200)}`,
      );
    parsed = JSON.parse(match[0]);
  }
  return ContractRefinement.parse(parsed);
}
