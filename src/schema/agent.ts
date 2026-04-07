/**
 * agent.ts — Agent Primitives
 *
 * An agent is exactly five things. Remove any one and it ceases to be an agent.
 * Identity, Contract, Interface, State, Lifecycle.
 *
 * AgentType = AgentPrimitive | Topology<AgentType>
 * This recursive definition is the fractal core of the system.
 */

import { z } from "zod";
import { AgentStatus } from "./message.js";

// ─── Identity ──────────────────────────────────────────────────────────

export const Identity = z.object({
  id: z.string().min(1).describe("Unique, immutable after creation"),
  name: z.string().min(1).describe("Human-readable label"),
  created: z.string().datetime().describe("Birth timestamp"),
  lineage: z
    .array(z.string())
    .describe("Chain of compilation/evolution that produced this"),
});
export type Identity = z.infer<typeof Identity>;

// ─── Contract ──────────────────────────────────────────────────────────

export const Contract = z.object({
  must: z.array(z.string()).min(1).describe("Behaviors the agent MUST exhibit"),
  must_not: z
    .array(z.string())
    .min(1)
    .describe("Behaviors the agent MUST NOT exhibit"),
  scope: z
    .string()
    .min(1)
    .describe('Authority boundary, dot-notation (e.g., "wsb.social.*")'),
});
export type Contract = z.infer<typeof Contract>;

// ─── MessageTypeRef ────────────────────────────────────────────────────

export const MessageTypeRef = z.object({
  type: z.string().min(1).describe("Message type name from the registry"),
  description: z
    .string()
    .optional()
    .describe("How this agent uses this message type"),
});
export type MessageTypeRef = z.infer<typeof MessageTypeRef>;

// ─── Interface ─────────────────────────────────────────────────────────

export const AgentInterface = z.object({
  accepts: z
    .array(MessageTypeRef)
    .describe("Message types this agent can receive"),
  emits: z
    .array(MessageTypeRef)
    .describe("Message types this agent can produce"),
});
export type AgentInterface = z.infer<typeof AgentInterface>;

// ─── State ─────────────────────────────────────────────────────────────

export const AgentState = z.object({
  owns: z
    .array(z.string())
    .describe("Named state domains this agent maintains"),
  persists: z.boolean().describe("Whether state survives restarts"),
});
export type AgentState = z.infer<typeof AgentState>;

// ─── Specialization Trigger ────────────────────────────────────────────

export const SpecializationTrigger = z.object({
  condition: z
    .string()
    .describe("When this trigger fires (natural language or expression)"),
  action: z.string().describe('What happens (e.g., "spawn dm_handler")'),
});
export type SpecializationTrigger = z.infer<typeof SpecializationTrigger>;

// ─── Death Condition ───────────────────────────────────────────────────

export const DeathCondition = z.object({
  condition: z.string().describe("When this agent should be decomposed"),
});
export type DeathCondition = z.infer<typeof DeathCondition>;

// ─── Lifecycle ─────────────────────────────────────────────────────────

export const Lifecycle = z.object({
  status: AgentStatus,
  supervisor: z
    .string()
    .describe("Node_id of supervisor (Governor for root agents)"),
  specialization_triggers: z.array(SpecializationTrigger),
  death_conditions: z.array(DeathCondition),
});
export type Lifecycle = z.infer<typeof Lifecycle>;

// ─── AgentPrimitive ────────────────────────────────────────────────────

export const AgentPrimitive = z.object({
  kind: z.literal("primitive"),
  identity: Identity,
  contract: Contract,
  interface: AgentInterface,
  state: AgentState,
  lifecycle: Lifecycle,
});
export type AgentPrimitive = z.infer<typeof AgentPrimitive>;

// ─── CompositeAgentShape (type declared before use) ───────────────────

export interface CompositeAgentShape {
  kind: "composite";
  identity: Identity;
  contract: Contract;
  interface: AgentInterface;
  state: AgentState;
  lifecycle: Lifecycle;
  topology: {
    constructor: "pipe" | "parallel" | "supervise" | "delegate";
    agents: AgentType[];
    config?: Record<string, unknown>;
  };
}

// ─── AgentType (recursive) ─────────────────────────────────────────────
// AgentType = AgentPrimitive | Topology<AgentType>
// We use z.lazy for the recursive Topology reference.

export const AgentType: z.ZodType<AgentPrimitive | CompositeAgentShape> =
  z.lazy(() => z.union([AgentPrimitive, CompositeAgent]));
export type AgentType = AgentPrimitive | CompositeAgentShape;

/**
 * CompositeAgent — an agent that is internally a topology of agents.
 * From the outside, it exposes the same five primitives.
 * The internal topology is an implementation detail.
 */
export const CompositeAgent: z.ZodType<CompositeAgentShape> = z.lazy(() =>
  z.object({
    kind: z.literal("composite"),
    identity: Identity,
    contract: Contract,
    interface: AgentInterface,
    state: AgentState,
    lifecycle: Lifecycle,
    topology: z.object({
      constructor: z.enum(["pipe", "parallel", "supervise", "delegate"]),
      agents: z.array(AgentType),
      config: z.record(z.unknown()).optional(),
    }),
  }),
);

// ─── Helper: check if an AgentType is a leaf or composite ──────────────

export function isLeaf(agent: AgentType): agent is AgentPrimitive {
  return agent.kind === "primitive";
}

export function isComposite(agent: AgentType): agent is CompositeAgentShape {
  return agent.kind === "composite";
}

// ─── Helper: count all agents in a topology (recursive) ────────────────

export function countAgents(agent: AgentType): number {
  if (isLeaf(agent)) return 1;
  let count = 1; // the composite itself
  for (const child of agent.topology.agents) {
    count += countAgents(child);
  }
  return count;
}

// ─── Helper: get max depth of a topology ───────────────────────────────

export function maxDepth(agent: AgentType): number {
  if (isLeaf(agent)) return 0;
  let deepest = 0;
  for (const child of agent.topology.agents) {
    const d = maxDepth(child);
    if (d > deepest) deepest = d;
  }
  return deepest + 1;
}

// ─── Helper: collect all agent IDs in a topology ───────────────────────

export function collectIds(agent: AgentType): string[] {
  const ids = [agent.identity.id];
  if (isComposite(agent)) {
    for (const child of agent.topology.agents) {
      ids.push(...collectIds(child));
    }
  }
  return ids;
}
