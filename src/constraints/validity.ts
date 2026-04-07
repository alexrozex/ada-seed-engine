/**
 * validity.ts — Constraints C1-C8
 *
 * These determine whether a topology is WELL-FORMED.
 * Checked at compile time. If any fails, compilation is rejected.
 */

import {
  Topology,
  AgentType,
  isLeaf,
  isComposite,
  scopeContains,
} from "../schema/index.js";

// ─── Violation type ────────────────────────────────────────────────────

export interface Violation {
  constraint: string;
  description: string;
  agents?: string[];
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

// ─── Helper: flatten all agents from topology ──────────────────────────

function flattenAgents(topology: Topology): AgentType[] {
  const result: AgentType[] = [];
  for (const agent of topology.agents) {
    result.push(agent);
    if (isComposite(agent)) {
      // Recursively collect from sub-topologies
      for (const child of agent.topology.agents) {
        result.push(child);
        if (isComposite(child)) {
          result.push(...flattenDeep(child));
        }
      }
    }
  }
  return result;
}

function flattenDeep(agent: AgentType): AgentType[] {
  if (isLeaf(agent)) return [];
  const result: AgentType[] = [];
  if (isComposite(agent)) {
    for (const child of agent.topology.agents) {
      result.push(child);
      if (isComposite(child)) {
        result.push(...flattenDeep(child));
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// C1: IDENTITY UNIQUENESS
// No two agents in a topology share an id.
// ═══════════════════════════════════════════════════════════════════════

export function checkIdentityUniqueness(topology: Topology): Violation[] {
  const allAgents = flattenAgents(topology);
  const seen = new Map<string, number>();
  const violations: Violation[] = [];

  for (const agent of allAgents) {
    const count = (seen.get(agent.identity.id) ?? 0) + 1;
    seen.set(agent.identity.id, count);
  }

  for (const [id, count] of seen) {
    if (count > 1) {
      violations.push({
        constraint: "C1_IDENTITY_UNIQUENESS",
        description: `Agent id "${id}" appears ${count} times in topology`,
        agents: [id],
      });
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C2: CONTRACT COMPLETENESS
// Every agent has a non-empty contract (must + must_not).
// ═══════════════════════════════════════════════════════════════════════

export function checkContractCompleteness(topology: Topology): Violation[] {
  const allAgents = flattenAgents(topology);
  const violations: Violation[] = [];

  for (const agent of allAgents) {
    if (!agent.contract.must.length) {
      violations.push({
        constraint: "C2_CONTRACT_COMPLETENESS",
        description: `Agent "${agent.identity.id}" has empty must[] in contract`,
        agents: [agent.identity.id],
      });
    }
    if (!agent.contract.must_not.length) {
      violations.push({
        constraint: "C2_CONTRACT_COMPLETENESS",
        description: `Agent "${agent.identity.id}" has empty must_not[] in contract`,
        agents: [agent.identity.id],
      });
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C3: INTERFACE COMPATIBILITY
// Every pipe connection requires type overlap between emitter and receiver.
// ═══════════════════════════════════════════════════════════════════════

export function checkInterfaceCompatibility(topology: Topology): Violation[] {
  const violations: Violation[] = [];
  const agentMap = new Map<string, AgentType>();

  for (const agent of flattenAgents(topology)) {
    agentMap.set(agent.identity.id, agent);
  }

  for (const conn of topology.connections) {
    if (conn.constructor === "pipe") {
      const from = agentMap.get(conn.from);
      const to = agentMap.get(conn.to);

      if (!from || !to) continue;

      const emitted = new Set(from.interface.emits.map((m) => m.type));
      const accepted = to.interface.accepts.map((m) => m.type);
      const overlap = accepted.filter((t) => emitted.has(t));

      if (overlap.length === 0) {
        violations.push({
          constraint: "C3_INTERFACE_COMPATIBILITY",
          description: `pipe(${conn.from}, ${conn.to}): no message type overlap. ${conn.from} emits [${Array.from(emitted).join(", ")}], ${conn.to} accepts [${accepted.join(", ")}]`,
          agents: [conn.from, conn.to],
        });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C4: STATE ISOLATION
// No agent reads or writes another agent's state directly.
// (This is enforced architecturally — agents can only exchange data via
// messages. This validator checks that no agent's state.owns overlaps
// with another's, which would indicate shared state.)
// ═══════════════════════════════════════════════════════════════════════

export function checkStateIsolation(topology: Topology): Violation[] {
  const allAgents = flattenAgents(topology);
  const violations: Violation[] = [];
  const stateOwnership = new Map<string, string>(); // state_domain → agent_id

  for (const agent of allAgents) {
    for (const domain of agent.state.owns) {
      const existingOwner = stateOwnership.get(domain);
      if (existingOwner && existingOwner !== agent.identity.id) {
        violations.push({
          constraint: "C4_STATE_ISOLATION",
          description: `State domain "${domain}" is owned by both "${existingOwner}" and "${agent.identity.id}"`,
          agents: [existingOwner, agent.identity.id],
        });
      }
      stateOwnership.set(domain, agent.identity.id);
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C5: AUTHORITY MONOTONICITY
// delegate scope ≤ delegator scope
// ═══════════════════════════════════════════════════════════════════════

export function checkAuthorityMonotonicity(topology: Topology): Violation[] {
  const violations: Violation[] = [];
  const agentMap = new Map<string, AgentType>();

  for (const agent of flattenAgents(topology)) {
    agentMap.set(agent.identity.id, agent);
  }

  for (const conn of topology.connections) {
    if (conn.constructor === "delegate" && conn.config?.scope) {
      const from = agentMap.get(conn.from);
      if (!from) continue;

      const delegatedScope = conn.config.scope as string;
      if (!scopeContains(from.contract.scope, delegatedScope)) {
        violations.push({
          constraint: "C5_AUTHORITY_MONOTONICITY",
          description: `"${conn.from}" (scope: "${from.contract.scope}") delegates scope "${delegatedScope}" which exceeds its own authority`,
          agents: [conn.from, conn.to],
        });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C6: SUPERVISION COMPLETENESS
// Every agent has exactly one supervisor. Root → Governor.
// ═══════════════════════════════════════════════════════════════════════

export function checkSupervisionCompleteness(topology: Topology): Violation[] {
  const allAgents = flattenAgents(topology);
  const violations: Violation[] = [];

  for (const agent of allAgents) {
    if (!agent.lifecycle.supervisor) {
      violations.push({
        constraint: "C6_SUPERVISION_COMPLETENESS",
        description: `Agent "${agent.identity.id}" has no supervisor`,
        agents: [agent.identity.id],
      });
    }
  }

  // Check for multiple supervisors (via supervise connections)
  const supervisorCount = new Map<string, string[]>();
  for (const conn of topology.connections) {
    if (conn.constructor === "supervise") {
      const existing = supervisorCount.get(conn.to) ?? [];
      existing.push(conn.from);
      supervisorCount.set(conn.to, existing);
    }
  }

  for (const [agentId, supervisors] of supervisorCount) {
    if (supervisors.length > 1) {
      violations.push({
        constraint: "C6_SUPERVISION_COMPLETENESS",
        description: `Agent "${agentId}" has multiple supervisors: [${supervisors.join(", ")}]`,
        agents: [agentId, ...supervisors],
      });
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C7: LIFECYCLE GOVERNANCE
// Birth and death require supervisor approval.
// (Structural check: every agent must have a supervisor that could approve)
// ═══════════════════════════════════════════════════════════════════════

export function checkLifecycleGovernance(topology: Topology): Violation[] {
  const allAgents = flattenAgents(topology);
  const violations: Violation[] = [];
  const agentIds = new Set(allAgents.map((a) => a.identity.id));

  for (const agent of allAgents) {
    const sup = agent.lifecycle.supervisor;
    // Supervisor must either be 'governor' (special) or an agent in the topology
    if (sup !== "governor" && !agentIds.has(sup)) {
      violations.push({
        constraint: "C7_LIFECYCLE_GOVERNANCE",
        description: `Agent "${agent.identity.id}" references supervisor "${sup}" which does not exist in topology`,
        agents: [agent.identity.id],
        details: { missing_supervisor: sup },
      });
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C8: BOUNDED DELEGATION
// Every delegation has a timeout. No infinite chains.
// ═══════════════════════════════════════════════════════════════════════

export function checkBoundedDelegation(topology: Topology): Violation[] {
  const violations: Violation[] = [];

  for (const conn of topology.connections) {
    if (conn.constructor === "delegate") {
      if (!conn.config?.timeout) {
        violations.push({
          constraint: "C8_BOUNDED_DELEGATION",
          description: `Delegation from "${conn.from}" to "${conn.to}" has no timeout`,
          agents: [conn.from, conn.to],
        });
      }
    }
  }

  // Check for delegation cycles
  const delegationEdges = topology.connections
    .filter((c) => c.constructor === "delegate")
    .map((c) => [c.from, c.to] as const);

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const [from, to] of delegationEdges) {
      if (from === node && hasCycle(to)) return true;
    }
    inStack.delete(node);
    return false;
  }

  const delegators = new Set(delegationEdges.map(([from]) => from));
  for (const node of delegators) {
    visited.clear();
    inStack.clear();
    if (hasCycle(node)) {
      violations.push({
        constraint: "C8_BOUNDED_DELEGATION",
        description: `Delegation cycle detected involving "${node}"`,
        agents: [node],
      });
      break; // one cycle report is enough
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// COMBINED VALIDITY CHECK
// ═══════════════════════════════════════════════════════════════════════

export function checkValidity(topology: Topology): ValidationResult {
  const violations = [
    ...checkIdentityUniqueness(topology),
    ...checkContractCompleteness(topology),
    ...checkInterfaceCompatibility(topology),
    ...checkStateIsolation(topology),
    ...checkAuthorityMonotonicity(topology),
    ...checkSupervisionCompleteness(topology),
    ...checkLifecycleGovernance(topology),
    ...checkBoundedDelegation(topology),
  ];

  return {
    valid: violations.length === 0,
    violations,
  };
}
