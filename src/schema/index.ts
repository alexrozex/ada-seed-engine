/**
 * schema/index.ts — Unified Export
 *
 * The complete type system of the Ada Seed Engine.
 * Five message shapes. Five agent primitives. Four constructors. One coupling surface.
 */

// Message shapes — the stud geometry
export {
  MessageShape,
  SHAPE_PAIRS,
  UNIDIRECTIONAL_SHAPES,
  BIDIRECTIONAL_SHAPES,
  expectsReply,
  isReply,
  replyShape,
} from './shapes.js';

// Message schema — the universal interface
export {
  Trace,
  Message,
  Decision,
  AgentStatus,
  TaskStatus,
  Severity,
  Priority,
  Confidence,
} from './message.js';

// Message type payloads — the 27 semantic types
export {
  VerdictRequestPayload,
  VerdictPayload,
  StateQueryPayload,
  StateReportPayload,
  HeartbeatPingPayload,
  HeartbeatPongPayload,
  AuditQueryPayload,
  AuditReportPayload,
  AuditEntryData,
  CompileRequestPayload,
  CompilationResultPayload,
  RiskEntry,
  TaskAssignmentPayload,
  TaskResultPayload,
  EscalationPayload,
  HealthAlertPayload,
  EnvironmentSignalPayload,
  RefreshTriggerPayload,
  CostReportPayload,
  AgentSpawnPayload,
  AgentReadyPayload,
  AgentKillPayload,
  AgentDeadPayload,
  AuditEntryPayload,
  KnowledgeUpdatePayload,
  MESSAGE_TYPE_REGISTRY,
  validatePayload,
  shapeForType,
} from './types.js';
export type { MessageTypeName } from './types.js';

// Agent primitives — the five irreducible components
export {
  Identity,
  Contract,
  MessageTypeRef,
  AgentInterface,
  AgentState,
  SpecializationTrigger,
  DeathCondition,
  Lifecycle,
  AgentPrimitive,
  AgentType,
  CompositeAgent,
  isLeaf,
  isComposite,
  countAgents,
  maxDepth,
  collectIds,
} from './agent.js';

// Topology + constructors — how agents connect
export {
  JoinCondition,
  DelegationScope,
  TopologyConnection,
  Topology,
  pipe,
  parallel,
  supervise,
  delegate,
  mergeTopologies,
  scopeContains,
} from './topology.js';
export type { ConstructorResult } from './topology.js';
