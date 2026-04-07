/**
 * types.ts — Message Type Payload Schemas
 *
 * 27 semantic types across 5 shapes.
 * This is the complete vocabulary of the system.
 * Every interaction is one of these types.
 */

import { z } from 'zod';
import { Decision, AgentStatus, TaskStatus, Severity, Priority, Confidence } from './message.js';

// ═══════════════════════════════════════════════════════════════════════
// SHAPE 1: REQUEST → RESPONSE
// ═══════════════════════════════════════════════════════════════════════

// ─── Verdict (governance, quality, review — universal judgment pattern) ─

export const VerdictRequestPayload = z.object({
  scope: z.string().describe('What domain/authority this verdict covers'),
  action: z.string().describe('What action is being requested/evaluated'),
  evidence: z.record(z.unknown()).describe('Supporting data for the request'),
});
export type VerdictRequestPayload = z.infer<typeof VerdictRequestPayload>;

export const VerdictPayload = z.object({
  decision: Decision,
  reason: z.string().describe('Why this decision was made'),
  feedback: z.string().optional().describe('Guidance for ITERATE decisions'),
});
export type VerdictPayload = z.infer<typeof VerdictPayload>;

// ─── State Query / Report ──────────────────────────────────────────────

export const StateQueryPayload = z.object({
  keys: z.array(z.string()).describe('Which state domains to query'),
  context: z.string().optional().describe('Why this query is being made'),
});
export type StateQueryPayload = z.infer<typeof StateQueryPayload>;

export const StateReportPayload = z.object({
  data: z.record(z.unknown()).describe('Requested state data'),
});
export type StateReportPayload = z.infer<typeof StateReportPayload>;

// ─── Heartbeat ─────────────────────────────────────────────────────────

export const HeartbeatPingPayload = z.object({}).describe('Empty — just a liveness check');
export type HeartbeatPingPayload = z.infer<typeof HeartbeatPingPayload>;

export const HeartbeatPongPayload = z.object({
  status: AgentStatus,
  metrics: z.record(z.unknown()).optional().describe('Agent-specific health metrics'),
});
export type HeartbeatPongPayload = z.infer<typeof HeartbeatPongPayload>;

// ─── Audit Query / Report ──────────────────────────────────────────────

export const AuditQueryPayload = z.object({
  filters: z.record(z.unknown()).describe('Search criteria for audit entries'),
  time_range: z.tuple([z.string().datetime(), z.string().datetime()]).optional(),
});
export type AuditQueryPayload = z.infer<typeof AuditQueryPayload>;

export const AuditEntryData = z.object({
  event_type: z.string(),
  source_message_id: z.string().uuid().optional(),
  context: z.record(z.unknown()),
  recorded_at: z.string().datetime(),
});
export type AuditEntryData = z.infer<typeof AuditEntryData>;

export const AuditReportPayload = z.object({
  entries: z.array(AuditEntryData),
  count: z.number().int().min(0),
});
export type AuditReportPayload = z.infer<typeof AuditReportPayload>;

// ─── Compile Request / Result ──────────────────────────────────────────

export const CompileRequestPayload = z.object({
  intent: z.string().describe('Natural language intent to compile'),
  parent_context: z.record(z.unknown()).optional().describe('Context from parent topology'),
  constraints: z.array(z.string()).optional().describe('Additional constraints'),
  depth_threshold: z.number().optional().describe('Override depth weight threshold'),
});
export type CompileRequestPayload = z.infer<typeof CompileRequestPayload>;

export const RiskEntry = z.object({
  constraint: z.string().describe('Which constraint was not fully resolved'),
  description: z.string().describe('What the residual risk is'),
  weight: z.number().describe('Calculated weight at time of acceptance'),
  mitigation: z.string().optional().describe('Partial mitigation in place'),
});
export type RiskEntry = z.infer<typeof RiskEntry>;

export const CompilationResultPayload = z.object({
  topology: z.record(z.unknown()).describe('Complete topology object'),
  workspaces: z.array(z.record(z.unknown())).describe('Generated workspace specs'),
  governance: z.record(z.unknown()).describe('Governance configuration'),
  provenance: z.record(z.unknown()).describe('Build trace'),
  accepted_risks: z.array(RiskEntry).describe('Risks accepted via C14'),
});
export type CompilationResultPayload = z.infer<typeof CompilationResultPayload>;

// ═══════════════════════════════════════════════════════════════════════
// SHAPE 2: ASSIGN → RESULT
// ═══════════════════════════════════════════════════════════════════════

export const TaskAssignmentPayload = z.object({
  task: z.string().describe('What needs to be done'),
  deadline: z.string().datetime().optional(),
  constraints: z.array(z.string()).optional(),
  priority: Priority.optional(),
});
export type TaskAssignmentPayload = z.infer<typeof TaskAssignmentPayload>;

export const TaskResultPayload = z.object({
  status: TaskStatus,
  output: z.record(z.unknown()).optional().describe('Task output data'),
  issues: z.array(z.string()).optional().describe('Problems encountered'),
});
export type TaskResultPayload = z.infer<typeof TaskResultPayload>;

// ═══════════════════════════════════════════════════════════════════════
// SHAPE 3: SIGNAL (one-way, no response)
// ═══════════════════════════════════════════════════════════════════════

export const EscalationPayload = z.object({
  issue: z.string().describe('What the problem is'),
  severity: Severity,
  context: z.record(z.unknown()).describe('Relevant context data'),
  recommended_action: z.string().optional(),
});
export type EscalationPayload = z.infer<typeof EscalationPayload>;

export const HealthAlertPayload = z.object({
  agent_id: z.string().describe('Which agent has the anomaly'),
  anomaly: z.string().describe('What was detected'),
  evidence: z.record(z.unknown()),
  severity: Severity,
});
export type HealthAlertPayload = z.infer<typeof HealthAlertPayload>;

export const EnvironmentSignalPayload = z.object({
  domain: z.string().describe('Which domain the change affects'),
  signal: z.string().describe('What changed'),
  data: z.record(z.unknown()),
  confidence: Confidence,
});
export type EnvironmentSignalPayload = z.infer<typeof EnvironmentSignalPayload>;

export const RefreshTriggerPayload = z.object({
  agent_id: z.string().describe('Which agent needs refreshing'),
  domain: z.string().describe('Which knowledge domain'),
  reason: z.string(),
  staleness: z.string().describe('Duration since last refresh'),
});
export type RefreshTriggerPayload = z.infer<typeof RefreshTriggerPayload>;

export const CostReportPayload = z.object({
  agent_id: z.string(),
  period: z.string().describe('Duration this report covers'),
  tokens: z.number().int().min(0),
  api_calls: z.number().int().min(0),
  estimated_cost: z.number().min(0),
});
export type CostReportPayload = z.infer<typeof CostReportPayload>;

// ═══════════════════════════════════════════════════════════════════════
// SHAPE 4: LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

export const AgentSpawnPayload = z.object({
  agent_id: z.string(),
  identity: z.record(z.unknown()).describe('Agent identity object'),
  contract: z.record(z.unknown()).describe('Agent contract object'),
  interface: z.record(z.unknown()).describe('Agent interface object'),
  state_init: z.record(z.unknown()).describe('Initial state'),
  lifecycle: z.record(z.unknown()).describe('Lifecycle configuration'),
  supervisor: z.string().describe('Supervisor node_id'),
});
export type AgentSpawnPayload = z.infer<typeof AgentSpawnPayload>;

export const AgentReadyPayload = z.object({
  agent_id: z.string(),
  capabilities: z.array(z.string()).describe('What this agent can do'),
});
export type AgentReadyPayload = z.infer<typeof AgentReadyPayload>;

export const AgentKillPayload = z.object({
  agent_id: z.string(),
  reason: z.string(),
  ordered_by: z.string().describe('Who ordered the kill'),
});
export type AgentKillPayload = z.infer<typeof AgentKillPayload>;

export const AgentDeadPayload = z.object({
  agent_id: z.string(),
  final_state: z.record(z.unknown()).describe('State snapshot at death'),
});
export type AgentDeadPayload = z.infer<typeof AgentDeadPayload>;

// ═══════════════════════════════════════════════════════════════════════
// SHAPE 5: RECORD
// ═══════════════════════════════════════════════════════════════════════

export const AuditEntryPayload = z.object({
  event_type: z.string(),
  source_message_id: z.string().uuid().optional(),
  context: z.record(z.unknown()),
  recorded_at: z.string().datetime(),
});
export type AuditEntryPayload = z.infer<typeof AuditEntryPayload>;

export const KnowledgeUpdatePayload = z.object({
  agent_id: z.string(),
  domain: z.string(),
  data: z.record(z.unknown()),
  source: z.string(),
  freshness: z.string().datetime().describe('When this knowledge was current'),
});
export type KnowledgeUpdatePayload = z.infer<typeof KnowledgeUpdatePayload>;

// ═══════════════════════════════════════════════════════════════════════
// TYPE REGISTRY — maps type name to shape + payload schema
// ═══════════════════════════════════════════════════════════════════════

export const MESSAGE_TYPE_REGISTRY = {
  // Shape 1: REQUEST → RESPONSE
  verdict_request:    { shape: 'request' as const,   schema: VerdictRequestPayload },
  verdict:            { shape: 'response' as const,  schema: VerdictPayload },
  state_query:        { shape: 'request' as const,   schema: StateQueryPayload },
  state_report:       { shape: 'response' as const,  schema: StateReportPayload },
  heartbeat_ping:     { shape: 'request' as const,   schema: HeartbeatPingPayload },
  heartbeat_pong:     { shape: 'response' as const,  schema: HeartbeatPongPayload },
  audit_query:        { shape: 'request' as const,   schema: AuditQueryPayload },
  audit_report:       { shape: 'response' as const,  schema: AuditReportPayload },
  compile_request:    { shape: 'request' as const,   schema: CompileRequestPayload },
  compilation_result: { shape: 'response' as const,  schema: CompilationResultPayload },

  // Shape 2: ASSIGN → RESULT
  task_assignment:    { shape: 'assign' as const,    schema: TaskAssignmentPayload },
  task_result:        { shape: 'result' as const,    schema: TaskResultPayload },

  // Shape 3: SIGNAL
  escalation:         { shape: 'signal' as const,    schema: EscalationPayload },
  health_alert:       { shape: 'signal' as const,    schema: HealthAlertPayload },
  environment_signal: { shape: 'signal' as const,    schema: EnvironmentSignalPayload },
  refresh_trigger:    { shape: 'signal' as const,    schema: RefreshTriggerPayload },
  cost_report:        { shape: 'signal' as const,    schema: CostReportPayload },

  // Shape 4: LIFECYCLE
  agent_spawn:        { shape: 'lifecycle' as const, schema: AgentSpawnPayload },
  agent_ready:        { shape: 'lifecycle' as const, schema: AgentReadyPayload },
  agent_kill:         { shape: 'lifecycle' as const, schema: AgentKillPayload },
  agent_dead:         { shape: 'lifecycle' as const, schema: AgentDeadPayload },

  // Shape 5: RECORD
  audit_entry:        { shape: 'record' as const,    schema: AuditEntryPayload },
  knowledge_update:   { shape: 'record' as const,    schema: KnowledgeUpdatePayload },
} as const;

export type MessageTypeName = keyof typeof MESSAGE_TYPE_REGISTRY;

/**
 * Validate a payload against its registered type schema
 */
export function validatePayload(typeName: string, payload: unknown): boolean {
  const entry = MESSAGE_TYPE_REGISTRY[typeName as MessageTypeName];
  if (!entry) return false;
  return entry.schema.safeParse(payload).success;
}

/**
 * Get the expected shape for a message type
 */
export function shapeForType(typeName: string): string | null {
  const entry = MESSAGE_TYPE_REGISTRY[typeName as MessageTypeName];
  return entry?.shape ?? null;
}
