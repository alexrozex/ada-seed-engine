/**
 * verifier.ts — Stage 8: Topology Verification
 *
 * Simulates message flow through the complete topology.
 * Checks:
 * - No dead-end agents (agents that receive but never emit)
 * - No orphaned agents (agents with no incoming connections except root)
 * - Governance membrane intact (all external-facing paths go through review)
 * - Supervision tree connected (every agent reachable from root)
 * - All contracts internally consistent
 */

import {
  Topology,
  AgentType,
  isLeaf,
  isComposite,
} from '../schema/index.js';

// ─── Verification Result ───────────────────────────────────────────────

export interface VerificationIssue {
  type: 'error' | 'warning';
  category: string;
  description: string;
  agents: string[];
}

export interface VerificationResult {
  passed: boolean;
  issues: VerificationIssue[];
  stats: {
    total_agents: number;
    total_connections: number;
    reachable_agents: number;
    dead_end_agents: number;
    orphaned_agents: number;
  };
}

// ─── Helper: build adjacency maps ──────────────────────────────────────

function buildAdjacency(topology: Topology): {
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
  agentIds: Set<string>;
} {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const agentIds = new Set<string>();

  // Collect all agent IDs (including nested composites)
  function collectIds(agent: AgentType): void {
    agentIds.add(agent.identity.id);
    if (isComposite(agent)) {
      for (const child of agent.topology.agents) {
        collectIds(child);
      }
    }
  }

  for (const agent of topology.agents) {
    collectIds(agent);
  }

  // Initialize empty sets for all agents
  for (const id of agentIds) {
    outgoing.set(id, new Set());
    incoming.set(id, new Set());
  }

  // Populate from connections
  for (const conn of topology.connections) {
    outgoing.get(conn.from)?.add(conn.to);
    incoming.get(conn.to)?.add(conn.from);
  }

  return { outgoing, incoming, agentIds };
}

// ─── Check: Reachability from root ─────────────────────────────────────

function checkReachability(
  topology: Topology,
  outgoing: Map<string, Set<string>>,
  agentIds: Set<string>,
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const visited = new Set<string>();
  const queue = [topology.root];

  // Also consider supervision relationships (supervisor can reach worker)
  const supervisionReach = new Map<string, Set<string>>();
  for (const agent of topology.agents) {
    if (isLeaf(agent) || isComposite(agent)) {
      const sup = agent.lifecycle.supervisor;
      if (!supervisionReach.has(sup)) {
        supervisionReach.set(sup, new Set());
      }
      supervisionReach.get(sup)!.add(agent.identity.id);
    }
  }

  // BFS from root through both connections and supervision
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Follow outgoing connections
    const neighbors = outgoing.get(current) ?? new Set();
    for (const n of neighbors) {
      if (!visited.has(n)) queue.push(n);
    }

    // Follow supervision relationships
    const supervised = supervisionReach.get(current) ?? new Set();
    for (const s of supervised) {
      if (!visited.has(s)) queue.push(s);
    }
  }

  // Check for unreachable agents
  for (const id of agentIds) {
    if (!visited.has(id) && id !== 'governor') {
      issues.push({
        type: 'warning',
        category: 'reachability',
        description: `Agent "${id}" is unreachable from root "${topology.root}"`,
        agents: [id],
      });
    }
  }

  return issues;
}

// ─── Check: Dead-end agents ────────────────────────────────────────────

function checkDeadEnds(
  topology: Topology,
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
  agentIds: Set<string>,
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (const id of agentIds) {
    const hasIncoming = (incoming.get(id)?.size ?? 0) > 0;
    const hasOutgoing = (outgoing.get(id)?.size ?? 0) > 0;

    // Agent receives messages but never sends any
    if (hasIncoming && !hasOutgoing && id !== topology.root) {
      // Check if agent has emits in its interface
      const agent = topology.agents.find(a => a.identity.id === id);
      if (agent && agent.interface.emits.length > 0) {
        issues.push({
          type: 'warning',
          category: 'dead_end',
          description: `Agent "${id}" has incoming connections but no outgoing connections, despite having emittable message types`,
          agents: [id],
        });
      }
    }
  }

  return issues;
}

// ─── Check: Supervision tree integrity ─────────────────────────────────

function checkSupervisionTree(topology: Topology): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const agentMap = new Map<string, AgentType>();

  function collectAgents(agent: AgentType): void {
    agentMap.set(agent.identity.id, agent);
    if (isComposite(agent)) {
      for (const child of agent.topology.agents) {
        collectAgents(child);
      }
    }
  }

  for (const agent of topology.agents) {
    collectAgents(agent);
  }

  // Check that supervision doesn't form cycles
  function findSupervisionCycle(startId: string): boolean {
    const visited = new Set<string>();
    let current = startId;

    while (current && current !== 'governor') {
      if (visited.has(current)) return true;
      visited.add(current);
      const agent = agentMap.get(current);
      if (!agent) break;
      current = agent.lifecycle.supervisor;
    }

    return false;
  }

  for (const [id] of agentMap) {
    if (findSupervisionCycle(id)) {
      issues.push({
        type: 'error',
        category: 'supervision_cycle',
        description: `Supervision cycle detected involving agent "${id}"`,
        agents: [id],
      });
      break; // One cycle report is sufficient
    }
  }

  return issues;
}

// ─── Check: Contract consistency ───────────────────────────────────────

function checkContractConsistency(topology: Topology): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (const agent of topology.agents) {
    // Check for contradictions: same item in must AND must_not
    const mustSet = new Set(agent.contract.must.map(m => m.toLowerCase()));
    for (const mn of agent.contract.must_not) {
      if (mustSet.has(mn.toLowerCase())) {
        issues.push({
          type: 'error',
          category: 'contract_contradiction',
          description: `Agent "${agent.identity.id}" has "${mn}" in both must and must_not`,
          agents: [agent.identity.id],
        });
      }
    }

    // Check for empty interface on non-infrastructure agents
    if (agent.interface.accepts.length === 0 && agent.interface.emits.length === 0) {
      issues.push({
        type: 'warning',
        category: 'empty_interface',
        description: `Agent "${agent.identity.id}" has no message types in its interface`,
        agents: [agent.identity.id],
      });
    }
  }

  return issues;
}

// ─── Check: Governance coverage ────────────────────────────────────────

function checkGovernanceCoverage(topology: Topology): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  // Find all agents that emit verdict_request
  const governanceEmitters = new Set<string>();
  // Find all agents that accept verdict_request (governors)
  const governors = new Set<string>();

  for (const agent of topology.agents) {
    if (agent.interface.emits.some(m => m.type === 'verdict_request')) {
      governanceEmitters.add(agent.identity.id);
    }
    if (agent.interface.accepts.some(m => m.type === 'verdict_request')) {
      governors.add(agent.identity.id);
    }
  }

  // Check that verdict_request emitters have a route to a governor
  for (const emitterId of governanceEmitters) {
    const hasGovernancePath = topology.connections.some(
      c => c.from === emitterId && governors.has(c.to) &&
           c.message_types.includes('verdict_request')
    );

    // Also check if there's a governor in the supervision chain
    const agent = topology.agents.find(a => a.identity.id === emitterId);
    const supervisorIsGovernor = agent && governors.has(agent.lifecycle.supervisor);

    if (!hasGovernancePath && !supervisorIsGovernor && governors.size > 0) {
      issues.push({
        type: 'warning',
        category: 'governance_gap',
        description: `Agent "${emitterId}" emits verdict_request but has no route to a governor`,
        agents: [emitterId],
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN VERIFICATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════

export function verify(topology: Topology): VerificationResult {
  const { outgoing, incoming, agentIds } = buildAdjacency(topology);

  const allIssues: VerificationIssue[] = [
    ...checkReachability(topology, outgoing, agentIds),
    ...checkDeadEnds(topology, outgoing, incoming, agentIds),
    ...checkSupervisionTree(topology),
    ...checkContractConsistency(topology),
    ...checkGovernanceCoverage(topology),
  ];

  const reachable = new Set<string>();
  const queue = [topology.root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const neighbors = outgoing.get(current) ?? new Set();
    for (const n of neighbors) {
      if (!reachable.has(n)) queue.push(n);
    }
    // Include supervised agents
    for (const agent of topology.agents) {
      if (agent.lifecycle.supervisor === current && !reachable.has(agent.identity.id)) {
        queue.push(agent.identity.id);
      }
    }
  }

  const deadEnds = [...agentIds].filter(id => {
    const hasIncoming = (incoming.get(id)?.size ?? 0) > 0;
    const hasOutgoing = (outgoing.get(id)?.size ?? 0) > 0;
    return hasIncoming && !hasOutgoing;
  });

  const orphaned = [...agentIds].filter(id =>
    !reachable.has(id) && id !== 'governor'
  );

  const hasErrors = allIssues.some(i => i.type === 'error');

  return {
    passed: !hasErrors,
    issues: allIssues,
    stats: {
      total_agents: agentIds.size,
      total_connections: topology.connections.length,
      reachable_agents: reachable.size,
      dead_end_agents: deadEnds.length,
      orphaned_agents: orphaned.length,
    },
  };
}
