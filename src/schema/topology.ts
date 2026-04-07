/**
 * topology.ts — Topology & Composition Constructors
 *
 * Four operators. Every multi-agent topology is built from combinations of these.
 * pipe (sequential), parallel (concurrent), supervise (hierarchical), delegate (scoped authority).
 *
 * Every other pattern (swarm, mesh, hierarchy, pipeline) is a composition of these four.
 */

import { z } from "zod";
import { AgentType, MessageTypeRef } from "./agent.js";

// ─── Join Condition (for parallel) ─────────────────────────────────────

export const JoinCondition = z.enum(["all_complete", "any_complete", "quorum"]);
export type JoinCondition = z.infer<typeof JoinCondition>;

// ─── Delegation Scope ──────────────────────────────────────────────────

export const DelegationScope = z.object({
  scope: z.string().describe("Authority boundary for the delegation"),
  timeout: z.string().describe("Maximum duration for the delegated task"),
});
export type DelegationScope = z.infer<typeof DelegationScope>;

// ─── Topology (the compiled graph of agents) ───────────────────────────

export const TopologyConnection = z.object({
  from: z.string().describe("Source agent id"),
  to: z.string().describe("Target agent id"),
  constructor: z.enum(["pipe", "parallel", "supervise", "delegate"]),
  message_types: z
    .array(z.string())
    .describe("Message types that flow on this connection"),
  config: z.record(z.unknown()).optional(),
});
export type TopologyConnection = z.infer<typeof TopologyConnection>;

export const Topology = z.object({
  root: z.string().describe("Root agent id"),
  agents: z
    .array(z.lazy(() => AgentType))
    .describe("All agents in this topology"),
  connections: z.array(TopologyConnection).describe("How agents are connected"),
  metadata: z.object({
    agent_count: z.number().int().min(1),
    max_depth: z.number().int().min(0),
    constructors_used: z.array(z.string()),
    join_condition: z.string().optional(),
  }),
});
export type Topology = z.infer<typeof Topology>;

// ─── Constructor Results ───────────────────────────────────────────────

export interface ConstructorResult {
  success: boolean;
  topology?: Topology;
  error?: string;
}

// ─── Interface Compatibility Check ─────────────────────────────────────

function getEmittedTypes(agent: AgentType): string[] {
  return agent.interface.emits.map((m: MessageTypeRef) => m.type);
}

function getAcceptedTypes(agent: AgentType): string[] {
  return agent.interface.accepts.map((m: MessageTypeRef) => m.type);
}

function hasInterfaceOverlap(emitter: AgentType, receiver: AgentType): boolean {
  const emitted = new Set(getEmittedTypes(emitter));
  const accepted = getAcceptedTypes(receiver);
  return accepted.some((t) => emitted.has(t));
}

// ─── Scope Containment Check ───────────────────────────────────────────

/**
 * Check if innerScope is contained within outerScope.
 * Uses dot-notation with wildcard: "wsb.social.*" contains "wsb.social.creator"
 */
export function scopeContains(outerScope: string, innerScope: string): boolean {
  if (outerScope === "*") return true;
  if (outerScope === innerScope) return true;

  const outerParts = outerScope.replace(/\.\*$/, "").split(".");
  const innerParts = innerScope.replace(/\.\*$/, "").split(".");

  if (innerParts.length < outerParts.length) return false;

  for (let i = 0; i < outerParts.length; i++) {
    if (outerParts[i] !== innerParts[i]) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// THE FOUR CONSTRUCTORS
// ═══════════════════════════════════════════════════════════════════════

/**
 * pipe(A, B) → Topology
 * A's output feeds B's input. Sequential processing.
 * REQUIRES: at least one of A.emits matches at least one of B.accepts
 */
export function pipe(a: AgentType, b: AgentType): ConstructorResult {
  if (!hasInterfaceOverlap(a, b)) {
    return {
      success: false,
      error: `Interface incompatibility: ${a.identity.id} emits [${getEmittedTypes(a).join(", ")}] but ${b.identity.id} accepts [${getAcceptedTypes(b).join(", ")}]. No overlap.`,
    };
  }

  const emitted = new Set(getEmittedTypes(a));
  const matchingTypes = getAcceptedTypes(b).filter((t) => emitted.has(t));

  return {
    success: true,
    topology: {
      root: a.identity.id,
      agents: [a, b],
      connections: [
        {
          from: a.identity.id,
          to: b.identity.id,
          constructor: "pipe",
          message_types: matchingTypes,
        },
      ],
      metadata: {
        agent_count: 2,
        max_depth: 0,
        constructors_used: ["pipe"],
      },
    },
  };
}

/**
 * parallel(...agents) → Topology
 * All agents run simultaneously, sync at join.
 * REQUIRES: join condition specified
 */
export function parallel(
  agents: AgentType[],
  joinCondition: JoinCondition = "all_complete",
): ConstructorResult {
  if (agents.length < 2) {
    return {
      success: false,
      error: "parallel() requires at least 2 agents",
    };
  }

  // Parallel agents don't connect to each other — they connect
  // to a virtual join point. Connections are implicit.
  return {
    success: true,
    topology: {
      root: agents[0].identity.id,
      agents,
      connections: [], // parallel agents have no direct inter-connections
      metadata: {
        agent_count: agents.length,
        max_depth: 0,
        constructors_used: ["parallel"],
        join_condition: joinCondition,
      },
    },
  };
}

/**
 * supervise(supervisor, worker) → Topology
 * Supervisor monitors and directs worker.
 * REQUIRES: supervisor.scope contains worker.scope
 */
export function supervise(
  supervisor: AgentType,
  worker: AgentType,
): ConstructorResult {
  if (!scopeContains(supervisor.contract.scope, worker.contract.scope)) {
    return {
      success: false,
      error: `Scope violation: supervisor "${supervisor.identity.id}" scope "${supervisor.contract.scope}" does not contain worker "${worker.identity.id}" scope "${worker.contract.scope}"`,
    };
  }

  return {
    success: true,
    topology: {
      root: supervisor.identity.id,
      agents: [supervisor, worker],
      connections: [
        {
          from: supervisor.identity.id,
          to: worker.identity.id,
          constructor: "supervise",
          message_types: ["task_assignment"],
        },
        {
          from: worker.identity.id,
          to: supervisor.identity.id,
          constructor: "supervise",
          message_types: ["task_result", "escalation"],
        },
      ],
      metadata: {
        agent_count: 2,
        max_depth: 1,
        constructors_used: ["supervise"],
      },
    },
  };
}

/**
 * delegate(from, to, scope) → Topology
 * From gives To a scoped task with bounded authority.
 * REQUIRES: scope is subset of from.scope
 * REQUIRES: timeout defined
 */
export function delegate(
  from: AgentType,
  to: AgentType,
  delegationScope: DelegationScope,
): ConstructorResult {
  if (!scopeContains(from.contract.scope, delegationScope.scope)) {
    return {
      success: false,
      error: `Authority monotonicity violation: "${from.identity.id}" scope "${from.contract.scope}" cannot delegate scope "${delegationScope.scope}" — exceeds own authority`,
    };
  }

  return {
    success: true,
    topology: {
      root: from.identity.id,
      agents: [from, to],
      connections: [
        {
          from: from.identity.id,
          to: to.identity.id,
          constructor: "delegate",
          message_types: ["task_assignment"],
          config: {
            scope: delegationScope.scope,
            timeout: delegationScope.timeout,
          },
        },
        {
          from: to.identity.id,
          to: from.identity.id,
          constructor: "delegate",
          message_types: ["task_result"],
        },
      ],
      metadata: {
        agent_count: 2,
        max_depth: 0,
        constructors_used: ["delegate"],
      },
    },
  };
}

// ─── Topology Merging (for building complex topologies) ────────────────

/**
 * Merge multiple topologies into one.
 * Deduplicates agents by id. Merges connections.
 */
export function mergeTopologies(
  topologies: Topology[],
  rootId: string,
): Topology {
  const agentMap = new Map<string, AgentType>();
  const allConnections: TopologyConnection[] = [];
  const constructorsUsed = new Set<string>();

  for (const t of topologies) {
    for (const agent of t.agents) {
      agentMap.set(agent.identity.id, agent);
    }
    allConnections.push(...t.connections);
    for (const c of t.metadata.constructors_used) {
      constructorsUsed.add(c);
    }
  }

  const agents = Array.from(agentMap.values());

  return {
    root: rootId,
    agents,
    connections: allConnections,
    metadata: {
      agent_count: agents.length,
      max_depth: Math.max(...topologies.map((t) => t.metadata.max_depth)),
      constructors_used: Array.from(constructorsUsed),
    },
  };
}
