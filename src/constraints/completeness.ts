/**
 * completeness.ts — Constraints C9-C13
 *
 * These determine whether a topology will SURVIVE in reality.
 * Checked after domain agents are generated. For each violation,
 * the compiler adds infrastructure agents.
 */

import { Topology, AgentType } from "../schema/index.js";

// ─── Completeness Violation ────────────────────────────────────────────

export interface CompletenessViolation {
  constraint: string;
  description: string;
  agent_id: string;
  resolution_hint: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface CompletenessResult {
  complete: boolean;
  violations: CompletenessViolation[];
}

// ─── Helper: get all agent IDs that are monitored ──────────────────────

function getMonitoredAgents(topology: Topology): Set<string> {
  const monitored = new Set<string>();

  // An agent is monitored if there exists a connection where
  // another agent receives heartbeat_pong from it, or
  // if another agent's contract.must includes monitoring it
  for (const conn of topology.connections) {
    if (
      conn.message_types.includes("heartbeat_ping") ||
      conn.message_types.includes("heartbeat_pong")
    ) {
      monitored.add(conn.to); // the one being pinged
      monitored.add(conn.from); // or sending pong
    }
  }

  // Also check if any agent's contract mentions monitoring
  for (const agent of topology.agents) {
    for (const must of agent.contract.must) {
      const match = must.match(/monitor\s+(\S+)/i);
      if (match) {
        monitored.add(match[1]);
      }
    }
  }

  return monitored;
}

// ─── Helper: check if agent has external-facing output ─────────────────

function isExternalFacing(agent: AgentType): boolean {
  // An agent is external-facing if it emits messages that go
  // outside the system (heuristic: contract mentions public/external/publish)
  const externalKeywords = [
    "publish",
    "post",
    "send",
    "external",
    "public",
    "customer",
    "client",
  ];
  return agent.contract.must.some((m) =>
    externalKeywords.some((k) => m.toLowerCase().includes(k)),
  );
}

// ─── Helper: check if agent depends on external knowledge ──────────────

function hasExternalKnowledge(agent: AgentType): boolean {
  const knowledgeKeywords = [
    "monitor",
    "track",
    "scrape",
    "research",
    "analyze",
    "competitive",
    "market",
    "pricing",
  ];
  return agent.contract.must.some((m) =>
    knowledgeKeywords.some((k) => m.toLowerCase().includes(k)),
  );
}

// ═══════════════════════════════════════════════════════════════════════
// C9: UNMONITORED AGENTS DRIFT
// Every agent must have a monitor.
// ═══════════════════════════════════════════════════════════════════════

export function checkMonitoring(topology: Topology): CompletenessViolation[] {
  const monitored = getMonitoredAgents(topology);
  const violations: CompletenessViolation[] = [];

  // Check if there's any agent whose contract mentions monitoring
  const monitorAgentIds = new Set<string>();
  for (const agent of topology.agents) {
    if (
      agent.contract.must.some(
        (m) =>
          m.toLowerCase().includes("heartbeat") ||
          m.toLowerCase().includes("monitor agent"),
      )
    ) {
      monitorAgentIds.add(agent.identity.id);
    }
  }

  for (const agent of topology.agents) {
    // Skip agents that ARE monitors
    if (monitorAgentIds.has(agent.identity.id)) continue;

    if (!monitored.has(agent.identity.id)) {
      violations.push({
        constraint: "C9_UNMONITORED_AGENTS_DRIFT",
        description: `Agent "${agent.identity.id}" has no monitor`,
        agent_id: agent.identity.id,
        resolution_hint: `Add a health monitor that sends heartbeat_ping to "${agent.identity.id}" and reports health_alert on anomalies`,
        severity: "high",
      });
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C10: UNGOVERNED ACTIONS ARE UNSAFE
// Every boundary-crossing action requires a verdict.
// ═══════════════════════════════════════════════════════════════════════

export function checkGovernance(topology: Topology): CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  // Check if there's at least one governor agent
  const hasGovernor = topology.agents.some((a) =>
    a.contract.must.some(
      (m) =>
        m.toLowerCase().includes("enforce") ||
        m.toLowerCase().includes("govern") ||
        m.toLowerCase().includes("verdict"),
    ),
  );

  if (!hasGovernor && topology.agents.length > 1) {
    violations.push({
      constraint: "C10_UNGOVERNED_ACTIONS",
      description: "Topology has no governance agent",
      agent_id: topology.root,
      resolution_hint:
        "Add a governor agent that receives verdict_request and emits verdict messages",
      severity: "critical",
    });
  }

  // Check if external-facing agents have governance paths
  for (const agent of topology.agents) {
    if (isExternalFacing(agent)) {
      const hasGovernancePath = topology.connections.some(
        (c) =>
          c.from === agent.identity.id &&
          c.message_types.includes("verdict_request"),
      );

      if (!hasGovernancePath) {
        violations.push({
          constraint: "C10_UNGOVERNED_ACTIONS",
          description: `External-facing agent "${agent.identity.id}" has no governance path (no verdict_request emitted)`,
          agent_id: agent.identity.id,
          resolution_hint: `Add verdict_request/verdict message flow between "${agent.identity.id}" and a governor agent`,
          severity: "high",
        });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C11: STALE KNOWLEDGE PRODUCES WRONG OUTPUTS
// Every agent with external knowledge dependencies needs refresh.
// ═══════════════════════════════════════════════════════════════════════

export function checkKnowledgeFreshness(
  topology: Topology,
): CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  // Check if there's a knowledge refresher
  const hasRefresher = topology.agents.some((a) =>
    a.contract.must.some(
      (m) =>
        m.toLowerCase().includes("refresh") ||
        m.toLowerCase().includes("update knowledge"),
    ),
  );

  for (const agent of topology.agents) {
    if (hasExternalKnowledge(agent)) {
      // Check if this agent receives knowledge_update or refresh_trigger
      const receivesRefresh = topology.connections.some(
        (c) =>
          c.to === agent.identity.id &&
          (c.message_types.includes("knowledge_update") ||
            c.message_types.includes("refresh_trigger")),
      );

      if (!receivesRefresh && !hasRefresher) {
        violations.push({
          constraint: "C11_STALE_KNOWLEDGE",
          description: `Agent "${agent.identity.id}" depends on external knowledge but has no refresh mechanism`,
          agent_id: agent.identity.id,
          resolution_hint: `Add a knowledge refresher that sends refresh_trigger to "${agent.identity.id}" on a schedule`,
          severity: "medium",
        });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C12: UNHANDLED FAILURE CASCADES
// Every agent must have a failure handler in its supervision chain.
// ═══════════════════════════════════════════════════════════════════════

export function checkFailureHandling(
  topology: Topology,
): CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  // Check if there's a resilience/failure handler agent
  const hasFailureHandler = topology.agents.some((a) =>
    a.contract.must.some(
      (m) =>
        m.toLowerCase().includes("failure") ||
        m.toLowerCase().includes("recovery") ||
        m.toLowerCase().includes("restart") ||
        m.toLowerCase().includes("resilience"),
    ),
  );

  if (!hasFailureHandler && topology.agents.length > 3) {
    violations.push({
      constraint: "C12_UNHANDLED_FAILURE",
      description: "Topology has no failure handling agent",
      agent_id: topology.root,
      resolution_hint:
        "Add a resilience agent that receives failure_report and issues recovery_order",
      severity: "high",
    });
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// C13: UNEVALUATED OUTPUTS HAVE UNKNOWN QUALITY
// External-facing output must have an evaluator.
// ═══════════════════════════════════════════════════════════════════════

export function checkQualityEvaluation(
  topology: Topology,
): CompletenessViolation[] {
  const violations: CompletenessViolation[] = [];

  for (const agent of topology.agents) {
    if (isExternalFacing(agent)) {
      // Check if this agent's output passes through an evaluator
      // (i.e., there's a pipe from this agent through a reviewer/evaluator)
      const hasEvaluator =
        topology.connections.some(
          (c) => c.from === agent.identity.id && c.constructor === "pipe",
        ) ||
        topology.agents.some(
          (a) =>
            a.identity.id !== agent.identity.id &&
            a.contract.must.some(
              (m) =>
                m.toLowerCase().includes("review") ||
                m.toLowerCase().includes("evaluate") ||
                m.toLowerCase().includes("quality"),
            ),
        );

      if (!hasEvaluator) {
        violations.push({
          constraint: "C13_UNEVALUATED_OUTPUTS",
          description: `External-facing agent "${agent.identity.id}" has no quality evaluator`,
          agent_id: agent.identity.id,
          resolution_hint: `Add an evaluator agent that reviews "${agent.identity.id}" outputs before external delivery`,
          severity: "medium",
        });
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// COMBINED COMPLETENESS CHECK
// ═══════════════════════════════════════════════════════════════════════

export function checkCompleteness(topology: Topology): CompletenessResult {
  const violations = [
    ...checkMonitoring(topology),
    ...checkGovernance(topology),
    ...checkKnowledgeFreshness(topology),
    ...checkFailureHandling(topology),
    ...checkQualityEvaluation(topology),
  ];

  return {
    complete: violations.length === 0,
    violations,
  };
}
