/**
 * agent-extractor.ts — Stage 2: Extract agent specs from structured intent
 *
 * Determines how many agents are needed, what roles they play,
 * and flags composite agents for recursive compilation.
 */

import { z } from "zod";
import type { StructuredIntent } from "./intent-parser.js";

// ─── Agent Spec (pre-compilation) ──────────────────────────────────────

export const AgentSpec = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  complexity: z.enum(["low", "medium", "high"]),
  type: z.enum(["leaf", "composite"]),
  domain: z.string(),
  must: z.array(z.string()),
  must_not: z.array(z.string()),
  accepts: z.array(z.string()),
  emits: z.array(z.string()),
  state_domains: z.array(z.string()),
  supervisor: z.string(),
});
export type AgentSpec = z.infer<typeof AgentSpec>;

export const AgentExtractionResult = z.object({
  agents: z.array(AgentSpec),
  root_agent: z.string(),
  composition: z
    .string()
    .describe("How agents should be composed (natural language)"),
});
export type AgentExtractionResult = z.infer<typeof AgentExtractionResult>;

/**
 * Build the prompt for agent extraction.
 */
export function buildAgentExtractionPrompt(
  intent: StructuredIntent,
  scopePrefix: string = "*",
): string {
  return `You are an agent architect for an autonomous system compiler.

Given this structured intent, determine what agents are needed.

OBJECTIVE: ${intent.objective}
ENTITIES: ${JSON.stringify(intent.entities)}
CONSTRAINTS: ${JSON.stringify(intent.constraints)}
IMPLIED DOMAINS: ${JSON.stringify(intent.implied_domains)}
SCALE: ${intent.scale ?? "not specified"}
CHANNELS: ${JSON.stringify(intent.channels ?? [])}
SCOPE PREFIX: ${scopePrefix}

Rules:
- ONE agent per functional domain. Never combine domains into one agent.
- Every agent needs a clear, non-overlapping objective.
- Mark complexity: "low" = single-skill leaf. "medium" = multi-step, might need sub-agents. "high" = definitely needs sub-agents.
- Type: "leaf" for low complexity, "composite" for medium/high.
- One agent should be the root supervisor that coordinates the others.
- Agent IDs should be short, kebab-case, prefixed with a project abbreviation.
- Inherit constraints from the intent into each relevant agent's must_not.
- Each agent must have at least one must and one must_not.
- accepts/emits are message type names from the Ada type system:
  verdict_request, verdict, state_query, state_report, heartbeat_ping, heartbeat_pong,
  task_assignment, task_result, escalation, health_alert, compile_request, compilation_result,
  environment_signal, refresh_trigger, cost_report, audit_entry, knowledge_update
- State domains should be unique per agent (no sharing).

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "agents": [
    {
      "id": "string",
      "name": "string",
      "objective": "string",
      "complexity": "low|medium|high",
      "type": "leaf|composite",
      "domain": "string",
      "must": ["string"],
      "must_not": ["string"],
      "accepts": ["message_type_name"],
      "emits": ["message_type_name"],
      "state_domains": ["string"],
      "supervisor": "agent_id or governor"
    }
  ],
  "root_agent": "agent_id of the root supervisor",
  "composition": "natural language description of how agents connect"
}`;
}

/**
 * Parse the LLM response into an AgentExtractionResult.
 */
export function parseAgentExtractionResponse(
  response: string,
): AgentExtractionResult {
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
        `Agent extractor: LLM returned invalid JSON.\nResponse: ${cleaned.slice(0, 200)}`,
      );
    parsed = JSON.parse(match[0]);
  }
  return AgentExtractionResult.parse(parsed);
}
