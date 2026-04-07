/**
 * compile.ts — The Main Compilation Loop
 *
 * compile(intent) → complete, validated, governed topology
 *
 * This is the constraint satisfaction loop described in GEOMETRY.md.
 * It takes natural language, extracts agents, composes them, validates
 * against C1-C8, completes against C9-C13, limits depth via C14,
 * and emits OpenClaw workspaces.
 */

import { v4 as uuid } from "uuid";
import {
  AgentPrimitive,
  Topology,
  TopologyConnection,
} from "../schema/index.js";
import {
  checkValidity,
  checkCompleteness,
  calculateWeight,
  createAcceptedRisk,
} from "../constraints/index.js";
import type { ValidationResult, AcceptedRisk } from "../constraints/index.js";
import { emitTopology } from "./emitter.js";
import type {
  EmittedSystem,
  GovernanceConfig,
  ProvenanceRecord,
  ProvenanceStage,
} from "./emitter.js";
import {
  buildIntentParsePrompt,
  parseIntentResponse,
} from "./intent-parser.js";
import {
  buildAgentExtractionPrompt,
  parseAgentExtractionResponse,
} from "./agent-extractor.js";
import {
  specToAgent,
  buildContractRefinementPrompt,
  parseContractRefinement,
  applyRefinement,
} from "./contract-gen.js";

// ─── Compilation Options ───────────────────────────────────────────────

export interface CompileOptions {
  /** Depth weight threshold. Lower = more infrastructure. Default: 1.0 */
  threshold: number;
  /** Additional constraints to inject */
  constraints?: string[];
  /** Parent context for recursive compilation */
  parentContext?: Record<string, unknown>;
  /** Seed ID for provenance */
  seedId?: string;
  /** LLM caller function — injected for testability */
  llm: LlmCaller;
  /** Escalation target (human name). Default: 'operator' */
  escalationTarget?: string;
  /** Escalation channel. Default: 'chat' */
  escalationChannel?: string;
  /** Output directory for emitted workspaces */
  outputDir?: string;
}

export type LlmCaller = (
  prompt: string,
  model: "sonnet" | "opus",
) => Promise<string>;

// ─── Compilation Result ────────────────────────────────────────────────

export interface CompilationResult {
  topology: Topology;
  system: EmittedSystem;
  acceptedRisks: AcceptedRisk[];
  provenance: ProvenanceRecord;
  validation: ValidationResult;
}

// ─── Stage Tracking ────────────────────────────────────────────────────

// ─── Infrastructure Agent Templates ────────────────────────────────────

function createMonitorAgent(
  targetIds: string[],
  scopePrefix: string,
  supervisor: string,
): AgentPrimitive {
  return {
    kind: "primitive",
    identity: {
      id: `${scopePrefix}-health-monitor`
        .replace(/\.\*/g, "")
        .replace(/\./g, "-"),
      name: "Health Monitor",
      created: new Date().toISOString(),
      lineage: ["infrastructure-completion"],
    },
    contract: {
      must: [
        `Monitor agent health via heartbeat for: ${targetIds.join(", ")}`,
        "Report anomalies via health_alert to governor",
        "Track response times and error rates",
      ],
      must_not: [
        "Modify agent behavior directly",
        "Ignore repeated health check failures",
      ],
      scope: scopePrefix,
    },
    interface: {
      accepts: [{ type: "heartbeat_pong" }, { type: "task_assignment" }],
      emits: [
        { type: "heartbeat_ping" },
        { type: "health_alert" },
        { type: "task_result" },
      ],
    },
    state: { owns: ["health_history"], persists: true },
    lifecycle: {
      status: "alive",
      supervisor,
      specialization_triggers: [],
      death_conditions: [{ condition: "All monitored agents decomposed" }],
    },
  };
}

function createGovernorAgent(scopePrefix: string): AgentPrimitive {
  return {
    kind: "primitive",
    identity: {
      id: `${scopePrefix}-governor`.replace(/\.\*/g, "").replace(/\./g, "-"),
      name: "Governor",
      created: new Date().toISOString(),
      lineage: ["infrastructure-completion"],
    },
    contract: {
      must: [
        "Evaluate all verdict_request messages against governance rules",
        "Enforce contract compliance for all agents in scope",
        "Escalate critical issues to human",
        "Log all governance decisions to audit",
      ],
      must_not: [
        "Override human decisions",
        "Approve actions outside governance rules",
        "Modify its own governance rules without meta-governor approval",
      ],
      scope: scopePrefix,
    },
    interface: {
      accepts: [
        { type: "verdict_request" },
        { type: "health_alert" },
        { type: "task_assignment" },
      ],
      emits: [
        { type: "verdict" },
        { type: "escalation" },
        { type: "task_result" },
        { type: "audit_entry" },
      ],
    },
    state: { owns: ["governance_rules", "decision_history"], persists: true },
    lifecycle: {
      status: "alive",
      supervisor: "governor", // meta-governed by system governor
      specialization_triggers: [],
      death_conditions: [{ condition: "System shutdown" }],
    },
  };
}

function createResilienceAgent(
  scopePrefix: string,
  supervisor: string,
): AgentPrimitive {
  return {
    kind: "primitive",
    identity: {
      id: `${scopePrefix}-resilience`.replace(/\.\*/g, "").replace(/\./g, "-"),
      name: "Resilience Responder",
      created: new Date().toISOString(),
      lineage: ["infrastructure-completion"],
    },
    contract: {
      must: [
        "Handle failure reports from health monitor",
        "Execute recovery actions (restart, failover)",
        "Escalate persistent failures to human",
      ],
      must_not: [
        "Ignore failure reports",
        "Execute recovery without governor approval for critical agents",
      ],
      scope: scopePrefix,
    },
    interface: {
      accepts: [{ type: "health_alert" }, { type: "task_assignment" }],
      emits: [
        { type: "task_result" },
        { type: "escalation" },
        { type: "verdict_request" },
      ],
    },
    state: { owns: ["recovery_log"], persists: true },
    lifecycle: {
      status: "alive",
      supervisor,
      specialization_triggers: [],
      death_conditions: [{ condition: "System shutdown" }],
    },
  };
}

function createKnowledgeRefresher(
  scopePrefix: string,
  supervisor: string,
): AgentPrimitive {
  return {
    kind: "primitive",
    identity: {
      id: `${scopePrefix}-refresher`.replace(/\.\*/g, "").replace(/\./g, "-"),
      name: "Knowledge Refresher",
      created: new Date().toISOString(),
      lineage: ["infrastructure-completion"],
    },
    contract: {
      must: [
        "Schedule and trigger knowledge refresh for agents with external dependencies",
        "Track knowledge staleness per domain",
      ],
      must_not: [
        "Modify agent knowledge directly",
        "Skip refresh cycles without logging reason",
      ],
      scope: scopePrefix,
    },
    interface: {
      accepts: [{ type: "task_assignment" }],
      emits: [
        { type: "refresh_trigger" },
        { type: "knowledge_update" },
        { type: "task_result" },
      ],
    },
    state: { owns: ["refresh_schedule", "staleness_tracker"], persists: true },
    lifecycle: {
      status: "alive",
      supervisor,
      specialization_triggers: [],
      death_conditions: [{ condition: "No agents require knowledge refresh" }],
    },
  };
}

function createQualityEvaluator(
  scopePrefix: string,
  supervisor: string,
): AgentPrimitive {
  return {
    kind: "primitive",
    identity: {
      id: `${scopePrefix}-evaluator`.replace(/\.\*/g, "").replace(/\./g, "-"),
      name: "Quality Evaluator",
      created: new Date().toISOString(),
      lineage: ["infrastructure-completion"],
    },
    contract: {
      must: [
        "Evaluate external-facing outputs against quality criteria",
        "Review content before publication",
        "Track quality trends over time",
      ],
      must_not: [
        "Approve content that violates governance rules",
        "Skip evaluation for any external-facing output",
      ],
      scope: scopePrefix,
    },
    interface: {
      accepts: [{ type: "verdict_request" }, { type: "task_assignment" }],
      emits: [{ type: "verdict" }, { type: "task_result" }],
    },
    state: { owns: ["quality_history", "evaluation_criteria"], persists: true },
    lifecycle: {
      status: "alive",
      supervisor,
      specialization_triggers: [],
      death_conditions: [{ condition: "No external-facing agents remain" }],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPILE FUNCTION
// ═══════════════════════════════════════════════════════════════════════

export async function compile(
  intent: string,
  options: CompileOptions,
): Promise<CompilationResult> {
  const compilationId = uuid();
  const seedId = options.seedId ?? `seed-${uuid().slice(0, 8)}`;
  const stages: ProvenanceStage[] = [];
  const startTime = Date.now();

  // ─── Stage 1: Intent Parse ─────────────────────────────────────────

  const intentPrompt = buildIntentParsePrompt(intent, options.constraints);
  const intentResponse = await options.llm(intentPrompt, "sonnet");
  const structured = parseIntentResponse(intentResponse);

  stages.push({
    stage: "intent_parse",
    model: "claude-sonnet-4-6",
    tokens: intentResponse.length, // approximate
    governor: "ACCEPT", // auto-accept for now; full governor in later step
  });

  // ─── Stage 2: Agent Extraction ─────────────────────────────────────

  const extractPrompt = buildAgentExtractionPrompt(structured);
  const extractResponse = await options.llm(extractPrompt, "sonnet");
  const extraction = parseAgentExtractionResponse(extractResponse);

  stages.push({
    stage: "agent_extraction",
    model: "claude-sonnet-4-6",
    tokens: extractResponse.length,
    governor: "ACCEPT",
  });

  // ─── Stage 3: Convert specs to agents ──────────────────────────────

  const agents: AgentPrimitive[] = extraction.agents.map((spec) =>
    specToAgent(spec, compilationId, seedId, "*"),
  );

  // ─── Stage 4: Contract refinement ─────────────────────────────────

  const refinedAgents: AgentPrimitive[] = [];
  const siblingIds = agents.map((a) => a.identity.id);

  for (const agent of agents) {
    const refinePrompt = buildContractRefinementPrompt(
      extraction.agents.find((s) => s.id === agent.identity.id)!,
      structured.constraints,
      siblingIds.filter((id) => id !== agent.identity.id),
    );
    const refineResponse = await options.llm(refinePrompt, "opus");
    const refinement = parseContractRefinement(refineResponse);
    refinedAgents.push(applyRefinement(agent, refinement));

    stages.push({
      stage: `contract_refine_${agent.identity.id}`,
      model: "claude-opus-4-6",
      tokens: refineResponse.length,
      governor: "ACCEPT",
    });
  }

  // ─── Stage 5: Build topology ───────────────────────────────────────

  const rootId = extraction.root_agent;
  const connections: TopologyConnection[] = [];

  // Build supervision connections
  for (const agent of refinedAgents) {
    if (
      agent.lifecycle.supervisor !== "governor" &&
      agent.identity.id !== rootId
    ) {
      connections.push({
        from: agent.lifecycle.supervisor,
        to: agent.identity.id,
        constructor: "supervise",
        message_types: ["task_assignment"],
      });
      connections.push({
        from: agent.identity.id,
        to: agent.lifecycle.supervisor,
        constructor: "supervise",
        message_types: ["task_result", "escalation"],
      });
    }
  }

  // Compute supervision tree depth
  function computeMaxDepth(agents: AgentPrimitive[], root: string): number {
    const children = new Map<string, string[]>();
    for (const a of agents) {
      if (a.identity.id !== root && a.lifecycle.supervisor !== "governor") {
        const sup = a.lifecycle.supervisor;
        if (!children.has(sup)) children.set(sup, []);
        children.get(sup)!.push(a.identity.id);
      }
    }
    function walk(id: string): number {
      const kids = children.get(id);
      if (!kids || kids.length === 0) return 0;
      return 1 + Math.max(...kids.map(walk));
    }
    return walk(root);
  }

  let topology: Topology = {
    root: rootId,
    agents: refinedAgents,
    connections,
    metadata: {
      agent_count: refinedAgents.length,
      max_depth: computeMaxDepth(refinedAgents, rootId),
      constructors_used: connections.length > 0 ? ["supervise"] : [],
    },
  };

  // ─── Stage 6: Infrastructure completion (C9-C13, gated by C14) ────

  const acceptedRisks: AcceptedRisk[] = [];
  let depth = 0;
  const maxInfraIterations = 5; // safety limit

  for (let i = 0; i < maxInfraIterations; i++) {
    const completeness = checkCompleteness(topology);
    if (completeness.complete) break;

    for (const violation of completeness.violations) {
      const weight = calculateWeight(violation, depth, options.threshold);

      if (weight.justified) {
        // Add infrastructure agent
        const scopePrefix = topology.agents[0]?.contract.scope ?? "*";
        let infraAgent: AgentPrimitive | null = null;

        switch (violation.constraint) {
          case "C9_UNMONITORED_AGENTS_DRIFT":
            infraAgent = createMonitorAgent(
              topology.agents.map((a) => a.identity.id),
              scopePrefix,
              rootId,
            );
            break;
          case "C10_UNGOVERNED_ACTIONS":
            infraAgent = createGovernorAgent(scopePrefix);
            break;
          case "C12_UNHANDLED_FAILURE":
            infraAgent = createResilienceAgent(scopePrefix, rootId);
            break;
          case "C11_STALE_KNOWLEDGE":
            infraAgent = createKnowledgeRefresher(scopePrefix, rootId);
            break;
          case "C13_UNEVALUATED_OUTPUTS":
            infraAgent = createQualityEvaluator(scopePrefix, rootId);
            break;
        }

        if (infraAgent) {
          // Check for duplicate IDs before adding
          const existingIds = new Set(
            topology.agents.map((a) => a.identity.id),
          );
          if (!existingIds.has(infraAgent.identity.id)) {
            topology = {
              ...topology,
              agents: [...topology.agents, infraAgent],
              metadata: {
                ...topology.metadata,
                agent_count: topology.metadata.agent_count + 1,
              },
            };
          }
        }
      } else {
        acceptedRisks.push(createAcceptedRisk(violation, weight, depth));
      }
    }

    depth++;
  }

  stages.push({
    stage: "infrastructure_completion",
    model: "none",
    tokens: 0,
    governor: "ACCEPT",
  });

  // ─── Stage 7: Validation ───────────────────────────────────────────

  const validation = checkValidity(topology);

  stages.push({
    stage: "validation",
    model: "none",
    tokens: 0,
    governor: validation.valid ? "ACCEPT" : "REJECT",
  });

  // ─── Stage 8: Emission ─────────────────────────────────────────────

  const totalTokens = stages.reduce((sum, s) => sum + s.tokens, 0);
  const estimatedCost = totalTokens * 0.000003; // rough estimate

  const provenance: ProvenanceRecord = {
    seed_intent: intent,
    compiler_version: "0.1.0",
    compilation_time_ms: Date.now() - startTime,
    stages,
    total_tokens: totalTokens,
    estimated_cost: estimatedCost,
    agent_count: topology.metadata.agent_count,
    max_depth: topology.metadata.max_depth,
  };

  const governance: GovernanceConfig = {
    invariants: [...structured.constraints, ...(options.constraints ?? [])],
    escalation_target: options.escalationTarget ?? "operator",
    escalation_channel: options.escalationChannel ?? "chat",
    governor_checks: [
      "All external-facing outputs require quality evaluation",
      "All boundary-crossing actions require verdict",
    ],
  };

  const system = emitTopology(topology, governance, provenance);

  return {
    topology,
    system,
    acceptedRisks,
    provenance,
    validation,
  };
}
