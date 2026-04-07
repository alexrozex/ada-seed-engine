/**
 * emitter.ts — AgentType → OpenClaw Workspace Files
 *
 * The emitter is the bridge between the type system and the runtime.
 * It takes validated agent primitives and topologies and produces
 * the actual files that OpenClaw reads.
 *
 * This is the ONLY OpenClaw-specific component. If the runtime changes,
 * only this file needs updating. The rest of the system is runtime-agnostic.
 */

import {
  AgentType,
  AgentPrimitive,
  Topology,
  isLeaf,
  isComposite,
  Identity,
  Contract,
  AgentInterface,
  Lifecycle,
  AgentState,
} from "../schema/index.js";

// ─── Emitted File Types ────────────────────────────────────────────────

export interface EmittedFile {
  path: string;
  content: string;
}

export interface EmittedWorkspace {
  agent_id: string;
  files: EmittedFile[];
}

export interface EmittedSystem {
  workspaces: EmittedWorkspace[];
  topology_json: string;
  governance_json: string;
  provenance_json: string;
}

// ─── SOUL.md Generation ────────────────────────────────────────────────

function emitSoulMd(identity: Identity, contract: Contract): string {
  const lines: string[] = [];

  lines.push(`# ${identity.name}`);
  lines.push("");

  // Core identity
  lines.push("## Core Identity");
  lines.push("");
  lines.push(`You are ${identity.name} (id: ${identity.id}).`);
  lines.push("");

  // What you must do
  lines.push("## What You Must Do");
  lines.push("");
  for (const m of contract.must) {
    lines.push(`- ${m}`);
  }
  lines.push("");

  // What you must never do
  lines.push("## What You Must Never Do");
  lines.push("");
  for (const m of contract.must_not) {
    lines.push(`- ${m}`);
  }
  lines.push("");

  // Authority scope
  lines.push("## Authority Scope");
  lines.push("");
  lines.push(`Your authority is bounded to: \`${contract.scope}\``);
  lines.push(
    "Never act outside this scope. Escalate if a task requires broader authority.",
  );
  lines.push("");

  return lines.join("\n");
}

// ─── AGENTS.md Generation ──────────────────────────────────────────────

function emitAgentsMd(
  identity: Identity,
  _contract: Contract,
  iface: AgentInterface,
  lifecycle: Lifecycle,
): string {
  const lines: string[] = [];

  lines.push(`# Operating Instructions — ${identity.name}`);
  lines.push("");

  // Interface
  lines.push("## Messages You Accept");
  lines.push("");
  if (iface.accepts.length === 0) {
    lines.push("None defined.");
  } else {
    for (const msg of iface.accepts) {
      lines.push(
        `- **${msg.type}**${msg.description ? `: ${msg.description}` : ""}`,
      );
    }
  }
  lines.push("");

  lines.push("## Messages You Emit");
  lines.push("");
  if (iface.emits.length === 0) {
    lines.push("None defined.");
  } else {
    for (const msg of iface.emits) {
      lines.push(
        `- **${msg.type}**${msg.description ? `: ${msg.description}` : ""}`,
      );
    }
  }
  lines.push("");

  // Supervision
  lines.push("## Supervision");
  lines.push("");
  lines.push(`Your supervisor is: \`${lifecycle.supervisor}\``);
  lines.push("Report results and escalations to your supervisor.");
  lines.push("Accept task assignments from your supervisor.");
  lines.push("");

  // Specialization triggers
  if (lifecycle.specialization_triggers.length > 0) {
    lines.push("## Specialization Triggers");
    lines.push("");
    lines.push(
      "Monitor these conditions. If any become true, report to your supervisor:",
    );
    lines.push("");
    for (const trigger of lifecycle.specialization_triggers) {
      lines.push(`- **Condition:** ${trigger.condition}`);
      lines.push(`  **Action:** ${trigger.action}`);
    }
    lines.push("");
  }

  // Death conditions
  if (lifecycle.death_conditions.length > 0) {
    lines.push("## Shutdown Conditions");
    lines.push("");
    lines.push("You should request shutdown if:");
    lines.push("");
    for (const dc of lifecycle.death_conditions) {
      lines.push(`- ${dc.condition}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── IDENTITY.md Generation ────────────────────────────────────────────

function emitIdentityMd(identity: Identity): string {
  const lines: string[] = [];

  lines.push(`# ${identity.name}`);
  lines.push("");
  lines.push(`**ID:** ${identity.id}`);
  lines.push(`**Created:** ${identity.created}`);
  if (identity.lineage.length > 0) {
    lines.push(`**Lineage:** ${identity.lineage.join(" → ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ─── HEARTBEAT.md Generation ───────────────────────────────────────────

function emitHeartbeatMd(
  identity: Identity,
  lifecycle: Lifecycle,
  contract: Contract,
): string {
  const lines: string[] = [];

  lines.push(`# Heartbeat — ${identity.name}`);
  lines.push("");
  lines.push("## Periodic Tasks");
  lines.push("");

  // Default heartbeat behavior
  lines.push("### Every Heartbeat Cycle");
  lines.push("");
  lines.push("- Respond to heartbeat_ping with current status");
  lines.push("- Report any anomalies via health_alert to supervisor");
  lines.push("- Log resource consumption via cost_report");
  lines.push("");

  // Contract-derived periodic tasks
  lines.push("### Ongoing Responsibilities");
  lines.push("");
  for (const m of contract.must) {
    // Heuristic: if the must contains time-related words, it's periodic
    const timeWords = [
      "daily",
      "weekly",
      "hourly",
      "periodic",
      "schedule",
      "regular",
      "monitor",
      "track",
    ];
    if (timeWords.some((w) => m.toLowerCase().includes(w))) {
      lines.push(`- ${m}`);
    }
  }
  lines.push("");

  // Specialization monitoring
  if (lifecycle.specialization_triggers.length > 0) {
    lines.push("### Watch for Specialization Triggers");
    lines.push("");
    for (const trigger of lifecycle.specialization_triggers) {
      lines.push(`- Monitor: ${trigger.condition}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── MEMORY.md Generation ──────────────────────────────────────────────

function emitMemoryMd(identity: Identity, state: AgentState): string {
  const lines: string[] = [];

  lines.push(`# Memory — ${identity.name}`);
  lines.push("");
  lines.push("## State Domains");
  lines.push("");
  for (const domain of state.owns) {
    lines.push(`### ${domain}`);
    lines.push("");
    lines.push("(initialized empty)");
    lines.push("");
  }

  lines.push(
    `**Persistence:** ${state.persists ? "State survives restarts" : "Ephemeral — state resets on restart"}`,
  );
  lines.push("");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Emit a single agent as an OpenClaw workspace directory.
 */
export function emitAgentWorkspace(agent: AgentPrimitive): EmittedWorkspace {
  return {
    agent_id: agent.identity.id,
    files: [
      { path: "SOUL.md", content: emitSoulMd(agent.identity, agent.contract) },
      {
        path: "AGENTS.md",
        content: emitAgentsMd(
          agent.identity,
          agent.contract,
          agent.interface,
          agent.lifecycle,
        ),
      },
      { path: "IDENTITY.md", content: emitIdentityMd(agent.identity) },
      {
        path: "HEARTBEAT.md",
        content: emitHeartbeatMd(
          agent.identity,
          agent.lifecycle,
          agent.contract,
        ),
      },
      { path: "MEMORY.md", content: emitMemoryMd(agent.identity, agent.state) },
    ],
  };
}

/**
 * Emit an entire topology as a complete OpenClaw multi-agent system.
 * Handles recursive composites by flattening all leaf agents.
 */
export function emitTopology(
  topology: Topology,
  governance: GovernanceConfig,
  provenance: ProvenanceRecord,
): EmittedSystem {
  const workspaces: EmittedWorkspace[] = [];

  // Recursively collect all leaf agents
  function collectLeaves(agent: AgentType): void {
    if (isLeaf(agent)) {
      workspaces.push(emitAgentWorkspace(agent));
    } else if (isComposite(agent)) {
      // Emit the composite as its own workspace too (it acts as supervisor)
      workspaces.push(
        emitAgentWorkspace({
          kind: "primitive",
          identity: agent.identity,
          contract: agent.contract,
          interface: agent.interface,
          state: agent.state,
          lifecycle: agent.lifecycle,
        }),
      );
      for (const child of agent.topology.agents) {
        collectLeaves(child);
      }
    }
  }

  for (const agent of topology.agents) {
    collectLeaves(agent);
  }

  // Deduplicate by agent_id
  const seen = new Set<string>();
  const uniqueWorkspaces = workspaces.filter((w) => {
    if (seen.has(w.agent_id)) return false;
    seen.add(w.agent_id);
    return true;
  });

  return {
    workspaces: uniqueWorkspaces,
    topology_json: JSON.stringify(emitTopologyJson(topology), null, 2),
    governance_json: JSON.stringify(governance, null, 2),
    provenance_json: JSON.stringify(provenance, null, 2),
  };
}

// ─── topology.json Generation ──────────────────────────────────────────

interface TopologyJsonEntry {
  workspace: string;
  supervisor: string;
}

interface TopologyJson {
  version: string;
  root: string;
  agents: Record<string, TopologyJsonEntry>;
  routes: TopologyRoute[];
}

interface TopologyRoute {
  from: string;
  to: string;
  type: string;
  message_types: string[];
  config?: Record<string, unknown>;
}

function emitTopologyJson(topology: Topology): TopologyJson {
  const agents: Record<string, TopologyJsonEntry> = {};

  function collectAgentEntries(agent: AgentType): void {
    agents[agent.identity.id] = {
      workspace: `./${agent.identity.id}`,
      supervisor: agent.lifecycle.supervisor,
    };
    if (isComposite(agent)) {
      for (const child of agent.topology.agents) {
        collectAgentEntries(child);
      }
    }
  }

  for (const agent of topology.agents) {
    collectAgentEntries(agent);
  }

  const routes: TopologyRoute[] = topology.connections.map((conn) => ({
    from: conn.from,
    to: conn.to,
    type: conn.constructor,
    message_types: conn.message_types,
    ...(conn.config ? { config: conn.config } : {}),
  }));

  return {
    version: "1.0.0",
    root: topology.root,
    agents,
    routes,
  };
}

// ─── Config Types ──────────────────────────────────────────────────────

export interface GovernanceConfig {
  invariants: string[];
  escalation_target: string;
  escalation_channel: string;
  governor_checks: string[];
}

export interface ProvenanceRecord {
  seed_intent: string;
  compiler_version: string;
  compilation_time_ms: number;
  stages: ProvenanceStage[];
  total_tokens: number;
  estimated_cost: number;
  agent_count: number;
  max_depth: number;
}

export interface ProvenanceStage {
  stage: string;
  model: string;
  tokens: number;
  governor: string;
}
