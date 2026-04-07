# GEOMETRY.md — Ada Seed Engine Constitution

Version: 0.1.0
Status: Specification (pre-implementation)
Author: Alex (Motherlabs) + Claude (architectural compilation)
Date: 2026-04-07

---

## What This Document Is

This is the complete structural definition of the Ada Seed Engine — a system that
compiles natural language intent into governed, self-monitoring, self-evolving
multi-agent topologies running on OpenClaw.

Everything in this document is derived from first principles. Nothing is assumed
from training data or domain convention. The derivation chain:

    What breaks? → Constraints → Message shapes → Agent primitives →
    Constructors → Compiler → Runtime integration

This document is the build instruction. A developer (human or AI) with this
document and access to OpenClaw's documentation can implement the complete system
without additional specification.

---

## Part 1: The Universal Coupling Surface

Every interaction in the system — between agents, between compiler and runtime,
between governor and agent, between system and human — passes through a single
interface: the typed message.

### The Five Message Shapes

Every message in the system is one of exactly five shapes. The shape determines
routing behavior. The typed payload determines semantics.

```
Shape 1: REQUEST → RESPONSE
  Asking for something, getting an answer.
  Bidirectional. Caller blocks (logically) until response.

Shape 2: ASSIGN → RESULT
  Directing work, receiving outcome.
  Bidirectional. Caller may not block (work is async).

Shape 3: SIGNAL
  One-way notification. No response expected or required.
  Unidirectional. Fire and forget (but always audited).

Shape 4: LIFECYCLE
  Agent existence changes. Birth, readiness, death.
  Unidirectional. Emitted by the subject of the change.

Shape 5: RECORD
  Append-only information storage. Audit entries, knowledge.
  Unidirectional. Emitted to persistent storage.
```

### Message Schema

Every message instance, regardless of shape, has this structure:

```
Message {
  id:         string        — unique message identifier (uuid)
  shape:      1|2|3|4|5     — which of the five shapes
  from:       node_id       — sender (agent, compiler, runtime, human)
  to:         node_id       — receiver (agent, compiler, runtime, human)
  type:       string        — semantic type name (e.g., "verdict_request")
  payload:    object        — typed data conforming to the type's schema
  timestamp:  ISO-8601      — when the message was created
  trace:      Trace         — provenance chain
  reply_to:   string?       — id of the message this responds to (shapes 1, 2)
}

Trace {
  seed_id:        string    — which seed this traces to
  compilation_id: string    — which compilation produced this context
  depth:          number    — topology depth at point of emission
  chain:          string[]  — ordered list of node_ids this message passed through
}
```

### Message Type Catalog

These are the semantic types, grouped by shape. Each type has a defined payload
schema. The compiler, runtime, and all agents speak exclusively in these types.

**Shape 1: REQUEST → RESPONSE**

  verdict_request / verdict
    Purpose: Ask for permission, evaluation, or judgment
    Used by: agents requesting governance approval,
             quality evaluation, topology change proposals,
             meta-governance audits
    Payload (request): { scope: string, action: string, evidence: object }
    Payload (response): { decision: ACCEPT|REJECT|ITERATE, reason: string,
                          feedback?: string }

  state_query / state_report
    Purpose: Request information from an agent's private state
    Used by: any agent needing data from another agent
    Payload (query): { keys: string[], context?: string }
    Payload (report): { data: object }

  heartbeat_ping / heartbeat_pong
    Purpose: Verify agent is alive and functioning
    Used by: monitors checking agent health
    Payload (ping): { }
    Payload (pong): { status: alive|busy|degraded, metrics?: object }

  audit_query / audit_report
    Purpose: Search historical audit records
    Used by: any agent needing historical context
    Payload (query): { filters: object, time_range?: [ISO, ISO] }
    Payload (report): { entries: AuditEntry[], count: number }

  compile_request / compilation_result
    Purpose: Compile intent into agent topology
    Used by: humans initiating compilation, evolution planner
             requesting sub-topology compilation
    Payload (request): { intent: string, parent_context?: object,
                         constraints?: string[], depth_threshold?: number }
    Payload (result): { topology: Topology, workspaces: Workspace[],
                        governance: GovernanceConfig, provenance: Provenance,
                        accepted_risks: Risk[] }

**Shape 2: ASSIGN → RESULT**

  task_assignment / task_result
    Purpose: Direct work to an agent, receive outcome
    Used by: supervisors directing workers, recovery orders
    Payload (assignment): { task: string, deadline?: ISO,
                            constraints?: string[], priority?: 1-5 }
    Payload (result): { status: complete|failed|partial,
                        output?: object, issues?: string[] }

**Shape 3: SIGNAL**

  escalation
    Purpose: Agent reports issue beyond its scope
    Used by: any agent encountering something it can't handle
    Payload: { issue: string, severity: 1-5, context: object,
               recommended_action?: string }

  health_alert
    Purpose: Monitor reports detected anomaly
    Used by: monitoring agents
    Payload: { agent_id: string, anomaly: string,
               evidence: object, severity: 1-5 }

  environment_signal
    Purpose: Detected change in external environment
    Used by: evolution sensors
    Payload: { domain: string, signal: string, data: object,
               confidence: 0-1 }

  refresh_trigger
    Purpose: Knowledge needs updating
    Used by: maintenance agents
    Payload: { agent_id: string, domain: string, reason: string,
               staleness: duration }

  cost_report
    Purpose: Report resource consumption
    Used by: any agent, periodically
    Payload: { agent_id: string, period: duration,
               tokens: number, api_calls: number,
               estimated_cost: number }

**Shape 4: LIFECYCLE**

  agent_spawn
    Purpose: Create a new agent
    Payload: { agent_id: string, identity: Identity, contract: Contract,
               interface: Interface, state_init: StateInit,
               lifecycle: LifecycleConfig, supervisor: node_id }

  agent_ready
    Purpose: Agent confirms it is alive and addressable
    Payload: { agent_id: string, capabilities: string[] }

  agent_kill
    Purpose: Ordered shutdown
    Payload: { agent_id: string, reason: string, ordered_by: node_id }

  agent_dead
    Purpose: Agent confirms terminated
    Payload: { agent_id: string, final_state: object }

**Shape 5: RECORD**

  audit_entry
    Purpose: Immutable record of an observed event
    Payload: { event_type: string, source_message?: Message,
               context: object, timestamp: ISO }

  knowledge_update
    Purpose: Deliver fresh information to an agent
    Payload: { agent_id: string, domain: string,
               data: object, source: string, freshness: ISO }

**Total: 27 semantic types across 5 shapes.**

---

## Part 2: Agent Primitives

An agent is the fundamental unit. Every node in the system — domain worker,
monitor, governor, compiler, runtime, human — is an agent or behaves as one.

### The Five Primitives

An agent is exactly five things. Remove any one and it ceases to be an agent.

```
Identity {
  id:           string      — unique, immutable after creation
  name:         string      — human-readable label
  created:      ISO-8601    — birth timestamp
  lineage:      string[]    — chain of compilation/evolution that produced this
}

Contract {
  must:         string[]    — behaviors the agent MUST exhibit
  must_not:     string[]    — behaviors the agent MUST NOT exhibit
  scope:        string      — authority boundary (dot-notation: "wsb.social.*")
}

Interface {
  accepts:      MessageTypeRef[]  — message types this agent can receive
  emits:        MessageTypeRef[]  — message types this agent can produce
}

State {
  owns:         string[]    — named state domains this agent maintains
  persists:     boolean     — whether state survives restarts
  private:      true        — always true (constraint 4)
}

Lifecycle {
  status:       alive | specializing | degraded | dying | dead
  supervisor:   node_id     — who oversees this agent
  specialization_triggers:  Trigger[]   — conditions for differentiation
  death_conditions:         Condition[] — conditions for decomposition
}
```

### Recursive Type

An agent can be a leaf (primitive) or a composite (topology of agents):

```
AgentType = AgentPrimitive | Topology<AgentType>
```

A composite agent exposes the same five primitives to its parent. From the
outside, a composite is indistinguishable from a leaf. The internal topology
is an implementation detail.

### Special Nodes

These are agents with special roles, not special types:

  Runtime (openclaw-runtime)
    An agent whose job is managing other agents' lifecycles.
    Accepts: agent_spawn, agent_kill, topology updates
    Emits: agent_ready confirmations, lifecycle events
    State: topology registry, agent configurations

  Governor
    An agent whose job is evaluating verdict_requests.
    Accepts: verdict_request
    Emits: verdict
    State: governance rules, decision history
    Has highest authority scope in its domain.

  Human (alex)
    An agent with unusual transport (chat app) and highest authority.
    Accepts: escalation, verdict_request
    Emits: verdict, task_assignment
    Very slow. Very high authority. Use sparingly.

  Compiler (ada-compiler)
    An agent whose job is compiling intent into topologies.
    Accepts: compile_request
    Emits: compilation_result
    Can be invoked at build time or runtime (evolution).

---

## Part 3: Composition Constructors

Four operators. Every multi-agent topology is built from combinations of these.

```
pipe(A: AgentType, B: AgentType) → Topology
  A's output feeds B's input.
  REQUIRES: at least one of A.emits matches at least one of B.accepts
  ROUTING: messages from A of matching type are forwarded to B
  PATTERN: sequential processing, assembly line

parallel(...agents: AgentType[]) → Topology
  All agents run simultaneously.
  REQUIRES: join_condition (all_complete | any_complete | quorum(n))
  ROUTING: input is broadcast to all; outputs collected at join
  PATTERN: concurrent independent work

supervise(supervisor: AgentType, worker: AgentType) → Topology
  Supervisor monitors and directs worker.
  REQUIRES: supervisor.scope contains worker.scope
  ROUTING: supervisor receives worker's escalations and health
           supervisor can send task_assignments to worker
  PATTERN: hierarchical oversight

delegate(from: AgentType, to: AgentType, scope: Scope) → Topology
  From gives To a scoped task with bounded authority.
  REQUIRES: scope is subset of from.scope
  REQUIRES: timeout defined
  ROUTING: from sends task_assignment; to returns task_result
  PATTERN: bounded authority transfer
```

### Composition is Recursive

Constructors take AgentTypes. AgentType includes Topology. Therefore:

  pipe(A, parallel(B, C))                — valid
  supervise(X, pipe(Y, Z))               — valid
  parallel(supervise(M, N), delegate(O, P, scope)) — valid

Any nesting depth. Same rules at every level.

---

## Part 4: The Fourteen Constraints

These are the things that break. The compiler ensures none of them are true
in any compiled topology. They are also enforced at runtime.

### Validity Constraints (the type system)

These determine whether a topology is well-formed.

```
C1: IDENTITY UNIQUENESS
    No two agents in a topology share an id.
    Violation: unroutable messages, state corruption.

C2: CONTRACT COMPLETENESS
    Every agent has a non-empty contract (must + must_not).
    Violation: undefined behavior, ungovernable agent.

C3: INTERFACE COMPATIBILITY
    Every pipe(A, B) requires overlap between A.emits and B.accepts.
    Violation: messages sent to void, broken data flow.

C4: STATE ISOLATION
    No agent reads or writes another agent's state directly.
    All inter-agent data exchange via messages.
    Violation: race conditions, invisible mutations, ungovernable state.

C5: AUTHORITY MONOTONICITY
    delegate(A, B, scope) requires scope ⊆ A.contract.scope.
    No agent can delegate more authority than it possesses.
    Violation: privilege escalation.

C6: SUPERVISION COMPLETENESS
    Every agent has exactly one supervisor.
    Root agents are supervised by the Governor.
    Violation: unsupervised agent can escalate its own scope.

C7: LIFECYCLE GOVERNANCE
    agent_spawn and agent_kill require supervisor approval.
    For root agents, Governor approval.
    Violation: uncontrolled proliferation or destruction.

C8: BOUNDED DELEGATION
    Every task_assignment has a timeout.
    No infinite delegation chains (max depth enforced).
    Violation: resource exhaustion, hanging tasks.
```

### Completeness Constraints (what must exist for survival)

These determine whether a topology will survive in reality.

```
C9: UNMONITORED AGENTS DRIFT
    Every agent must have a monitor (receives heartbeat_pong from it).
    Violation: silent degradation goes undetected.

C10: UNGOVERNED ACTIONS ARE UNSAFE
     Every boundary-crossing action requires a verdict.
     Violation: irreversible harm without approval.

C11: STALE KNOWLEDGE PRODUCES WRONG OUTPUTS
     Every agent with external knowledge dependencies must have a
     refresh schedule.
     Violation: decisions based on outdated information.

C12: UNHANDLED FAILURE CASCADES
     Every agent must have a failure handler in its supervision chain.
     Violation: single failure takes down dependent agents.

C13: UNEVALUATED OUTPUTS HAVE UNKNOWN QUALITY
     Every agent producing external-facing output must have an evaluator.
     Violation: quality erosion without detection.

C14: PREVENTION MUST COST LESS THAN FAILURE (depth weight)
     Adding an infrastructure agent is justified only when:
       weight = (impact × probability) / cost > threshold
     Where:
       impact    = estimated damage if the failure occurs
       probability = likelihood of failure without prevention
       cost      = token cost + complexity + governance overhead
     When weight < threshold: stop recursing, log accepted risk.
     Violation of principle: infinite infrastructure recursion OR
       under-protected critical agents.
```

### How Constraints Interact

C1-C8 are checked at compile time. If any fails, compilation is rejected.

C9-C13 are checked after domain agents are generated. For each violation,
the compiler adds the minimal infrastructure agent that resolves it. This
may trigger new violations (the new agent itself needs monitoring), which
are resolved recursively until C14 stops the recursion.

C14 is checked on every proposed infrastructure addition. It is the only
constraint that can result in an accepted risk rather than a required fix.

---

## Part 5: The Compiler

The compiler is a constraint satisfaction loop. It takes natural language
intent and produces a topology that satisfies all fourteen constraints.

### Compiler Algorithm

```
compile(intent: string, threshold: number = 1.0): CompilationResult {

  // Phase 1: Extract domain agents
  domain_agents = llm_extract_agents(intent)
  for each agent in domain_agents:
    if agent.complexity > complexity_threshold:
      agent = compile(agent.objective, threshold)  // recurse
    else:
      agent = create_leaf(agent)

  // Phase 2: Compose topology
  topology = llm_determine_composition(domain_agents)

  // Phase 3: Validate (C1-C8)
  validity_errors = check_validity(topology)
  if validity_errors:
    topology = resolve_validity_errors(topology, validity_errors)

  // Phase 4: Complete (C9-C13, gated by C14)
  while violations = check_completeness(topology):
    for violation in violations:
      resolution = derive_minimal_resolution(violation)
      w = calculate_weight(resolution)
      if w > threshold:
        topology = add_agent(topology, resolution)
      else:
        topology = log_accepted_risk(topology, violation, w)

  // Phase 5: Final validation
  assert check_validity(topology) == []
  // (completeness violations may remain as accepted risks)

  // Phase 6: Emit
  workspaces = emit_openclaw_workspaces(topology)
  governance = emit_governance_config(topology)
  provenance = build_provenance(intent, topology, stages)

  return { topology, workspaces, governance, provenance, accepted_risks }
}
```

### Compiler Stages (for Lobster pipeline)

When wrapped as a Lobster pipeline, the compiler runs as:

```
Stage 1: intent_parse
  Input:  raw intent string
  Output: structured intent (entities, constraints, domains, scale)
  Model:  claude-sonnet-4-6
  Gate:   verdict_request to Governor — is intent unambiguous?

Stage 2: agent_extraction
  Input:  structured intent
  Output: list of domain agent specs (may flag composites for recursion)
  Model:  claude-sonnet-4-6
  Gate:   verdict_request — are all domains covered? any redundancy?

Stage 3: topology_design
  Input:  agent specs
  Output: topology using the four constructors
  Model:  claude-sonnet-4-6
  Gate:   verdict_request — are constructors valid? interfaces compatible?

Stage 4: contract_generation
  Input:  topology + intent constraints
  Output: full contract for each agent (must/must_not/scope)
  Model:  claude-opus-4-6
  Gate:   verdict_request — contracts non-contradictory? scope nesting valid?

Stage 5: recursive_compilation
  Input:  topology with composite agents flagged
  Output: expanded topology with sub-topologies compiled
  Model:  claude-sonnet-4-6 (per sub-compilation)
  Gate:   verdict_request per sub-topology

Stage 6: infrastructure_completion
  Input:  domain-complete topology
  Output: fully complete topology with all infrastructure agents
  Model:  claude-sonnet-4-6
  Gate:   verdict_request — all constraints satisfied or risk-accepted?

Stage 7: emission
  Input:  complete topology
  Output: OpenClaw workspace directories + config files
  Model:  none (deterministic template emission)
  Gate:   verdict_request — do emitted files faithfully encode contracts?

Stage 8: verification
  Input:  emitted workspaces + topology
  Output: verification report (message flow simulation)
  Model:  claude-opus-4-6
  Gate:   FINAL verdict — all 8 validity constraints pass,
          all completeness constraints satisfied or risk-accepted,
          message flow simulation finds no dead ends
```

### Model Routing

  claude-sonnet-4-6:  Stages 1, 2, 3, 5, 6 (extraction, design, infrastructure)
  claude-opus-4-6:    Stages 4, 8 (contracts, verification — highest stakes)
  none:               Stage 7 (deterministic emission, no LLM needed)

---

## Part 6: OpenClaw Integration

The Ada Seed Engine installs as an OpenClaw skill + Lobster pipeline.

### Package Structure

```
ada-seed-engine/
├── SKILL.md                    — OpenClaw skill registration
├── package.json                — npm package
├── src/
│   ├── schema/
│   │   ├── message.ts          — Message schema (Zod)
│   │   ├── shapes.ts           — Five shape definitions
│   │   ├── types.ts            — 27 message type schemas
│   │   ├── agent.ts            — AgentPrimitive schema
│   │   ├── topology.ts         — Topology + constructor schemas
│   │   └── index.ts            — unified export
│   │
│   ├── constraints/
│   │   ├── validity.ts         — C1-C8 validators
│   │   ├── completeness.ts     — C9-C13 validators
│   │   ├── depth-weight.ts     — C14 calculator
│   │   └── index.ts            — validate(topology): ValidationResult
│   │
│   ├── compiler/
│   │   ├── intent-parser.ts    — Stage 1
│   │   ├── agent-extractor.ts  — Stage 2
│   │   ├── topology-designer.ts — Stage 3
│   │   ├── contract-gen.ts     — Stage 4
│   │   ├── recursive.ts        — Stage 5
│   │   ├── infrastructure.ts   — Stage 6
│   │   ├── emitter.ts          — Stage 7
│   │   ├── verifier.ts         — Stage 8
│   │   └── compile.ts          — main compile() loop
│   │
│   ├── runtime/
│   │   ├── governor.ts         — runtime governance hooks
│   │   ├── lifecycle.ts        — spawn/kill/specialize
│   │   ├── topology-manager.ts — routing, registry
│   │   └── message-bus.ts      — typed message routing
│   │
│   └── cli/
│       └── ada.ts              — CLI entry point
│
├── workflows/
│   └── compile.lobster         — compiler as Lobster pipeline
│
├── seeds/
│   └── examples/
│       ├── barbershop.seed.md
│       ├── content-agency.seed.md
│       └── dev-pipeline.seed.md
│
└── tests/
    ├── schema/                 — message and type validation tests
    ├── constraints/            — constraint checker tests
    ├── compiler/               — compiler stage tests
    ├── simulation/             — full message flow simulations
    └── self-compile.test.ts    — compiler compiles itself
```

### SKILL.md

```yaml
---
name: ada-seed-engine
description: >
  Compile natural language intent into governed, self-monitoring,
  self-evolving multi-agent topologies. Produces complete OpenClaw
  workspaces from a single prompt.
version: 0.1.0
metadata:
  openclaw:
    requires:
      bins:
        - node
    primaryEnv: ANTHROPIC_API_KEY
---

# Ada Seed Engine

You are a seed compiler. When the user describes a system they want to run,
you compile it into a complete multi-agent topology with governance,
monitoring, quality evaluation, maintenance, resilience, evolution, and
meta-governance.

## Commands

  ada compile "<intent>"       — compile intent into OpenClaw workspaces
  ada compile --threshold <n>  — set depth weight threshold (default 1.0)
  ada validate <topology.json> — validate existing topology against constraints
  ada observe                  — show running topology health
  ada evolve                   — trigger evolution evaluation cycle

## How It Works

1. Parse your intent into structured form
2. Extract domain agents
3. Design composition topology
4. Generate behavioral contracts
5. Recursively compile composite agents
6. Add infrastructure (monitoring, governance, quality, maintenance,
   resilience, evolution, meta-governance)
7. Emit OpenClaw workspace directories
8. Verify message flow and constraint satisfaction

Every stage is gated by a Governor verdict. The output is the minimal
topology that satisfies all fourteen structural constraints.
```

### CLI

```
ada compile "Run walk-in barbershop operations for West Side Barbers in Kelowna"
ada compile --threshold 0.3 "Run full-scale content agency with 50 clients"
ada compile --threshold 3.0 "Simple daily standup bot"
ada validate ~/.openclaw/workspaces/west-side-barbers/topology.json
ada observe
ada evolve
```

---

## Part 7: Build Sequence

Each step depends only on completed previous steps. Each step has a defined
exit condition. The build can be executed by Claude Code without human
intervention between steps.

### Step 1: Message Schema (Day 1)

  Implement: src/schema/message.ts, shapes.ts, types.ts
  Content: Zod schemas for Message, the 5 shapes, all 27 type payloads
  Exit condition: all schemas parse valid examples and reject invalid ones
  Test: schema/*.test.ts — ~50 test cases

### Step 2: Agent Primitives (Day 1)

  Implement: src/schema/agent.ts
  Content: Zod schemas for Identity, Contract, Interface, State, Lifecycle,
           AgentPrimitive, AgentType (recursive)
  Exit condition: can define leaf agents and composite agents,
                  recursive type works at arbitrary depth
  Test: schema/agent.test.ts — ~30 test cases

### Step 3: Topology + Constructors (Day 2)

  Implement: src/schema/topology.ts
  Content: pipe(), parallel(), supervise(), delegate() as typed functions
           that produce Topology objects. Each validates its preconditions.
  Exit condition: all four constructors work, nesting works,
                  invalid compositions (incompatible interfaces) are rejected
  Test: schema/topology.test.ts — ~40 test cases

### Step 4: Constraint Validators (Day 2-3)

  Implement: src/constraints/validity.ts, completeness.ts, depth-weight.ts
  Content: 14 validator functions, each takes a Topology and returns
           valid or { violation, details }
  Exit condition: each validator correctly identifies violations in
                  intentionally broken topologies and passes valid ones
  Test: constraints/*.test.ts — ~100 test cases (14 constraints × ~7 cases each)

### Step 5: Emitter (Day 3-4)

  Implement: src/compiler/emitter.ts
  Content: AgentPrimitive → OpenClaw workspace directory
           (SOUL.md, AGENTS.md, IDENTITY.md, HEARTBEAT.md, MEMORY.md)
           Topology → multi-agent config, topology.json, governance.json
  Exit condition: emitted workspaces are valid OpenClaw workspace directories
                  that can be loaded by an OpenClaw agent
  Test: compiler/emitter.test.ts — ~20 test cases
  Requires: Steps 1-2

### Step 6: Single-Agent Compiler (Day 4-5)

  Implement: src/compiler/intent-parser.ts, agent-extractor.ts, contract-gen.ts
  Content: natural language → one AgentPrimitive
           Uses Anthropic API (claude-sonnet-4-6 for parsing,
           claude-opus-4-6 for contracts)
  Exit condition: compile("monitor Instagram engagement for a barbershop")
                  produces a valid AgentPrimitive that passes all C1-C8 checks,
                  and the emitted workspace loads in OpenClaw
  Test: compiler/single-agent.test.ts — ~10 test cases
  Requires: Steps 1-5

### Step 7: Multi-Agent Compiler (Day 5-6)

  Implement: src/compiler/topology-designer.ts, recursive.ts
  Content: natural language → Topology<AgentType>
           Determines agent count, roles, composition.
           Recursively compiles composite agents.
  Exit condition: compile("run barbershop operations") produces a valid
                  multi-agent topology with correct supervision, piping,
                  and interface compatibility
  Test: compiler/multi-agent.test.ts — ~10 test cases
  Requires: Steps 1-6

### Step 8: Infrastructure Completion (Day 6-7)

  Implement: src/compiler/infrastructure.ts
  Content: domain topology → complete topology
           Checks C9-C13, adds infrastructure agents,
           uses C14 to limit depth
  Exit condition: compile("run barbershop operations") produces ~25 agents
                  including monitoring, governance, quality, maintenance,
                  resilience, evolution, meta-governance layers.
                  All constraints satisfied or risk-accepted.
  Test: compiler/infrastructure.test.ts — ~15 test cases
  Requires: Steps 1-7

### Step 9: Verification (Day 7)

  Implement: src/compiler/verifier.ts
  Content: simulate message flow through complete topology.
           Check: no dead ends, no unroutable messages,
           all contracts honored, governance membrane intact.
  Exit condition: verification catches intentionally broken topologies
                  and passes valid ones
  Test: compiler/verifier.test.ts — ~20 test cases
  Requires: Steps 1-8

### Step 10: Lobster Pipeline + CLI (Day 8)

  Implement: workflows/compile.lobster, src/cli/ada.ts
  Content: wrap compiler stages as Lobster pipeline with Governor gates.
           CLI that invokes the pipeline.
  Exit condition: `ada compile "intent"` runs end-to-end and produces
                  a complete, verified set of OpenClaw workspaces
  Test: manual integration test
  Requires: Steps 1-9

### Step 11: Self-Compilation Test (Day 8)

  Implement: tests/self-compile.test.ts
  Content: ada compile "Build a system that compiles natural language
           into governed multi-agent OpenClaw topologies"
  Exit condition: produces a valid topology that structurally resembles
                  the ada-seed-engine itself. The strange loop closes.
  Requires: Steps 1-10

---

## Part 8: Invariants

These are true at all times, in all contexts, at all scales.
They are not configurable. They are not overridable.

  1. Anthropic models only.
  2. TypeScript strict mode, no `any` type.
  3. Every message has a trace (provenance chain).
  4. Every agent has exactly one supervisor.
  5. Governor can halt any agent at any time.
  6. The human (Alex) is the ultimate authority.
  7. The type system (C1-C8) is checked at compile time.
  8. The completeness model (C9-C13) is checked after domain generation.
  9. The depth weight (C14) prevents infinite recursion.
  10. Every emitted file is traceable to a seed + compilation version.

---

## Part 9: What This Document Does NOT Define

These are intentionally left unspecified because they are domain-specific
or implementation-specific and should be derived at compile time:

  - Specific agent names or roles (derived from intent)
  - Number of agents (derived from intent + constraints)
  - Topology depth (derived from intent + depth weights)
  - Specific skills (derived from agent contracts)
  - Specific Lobster workflows (derived from agent compositions)
  - Monitoring frequency (derived from domain risk profile)
  - Knowledge refresh schedules (derived from domain staleness rates)
  - Quality evaluation criteria (derived from domain objectives)

The compiler derives all of these. This document defines the geometry
within which the compiler operates.

---

## Appendix A: Verification Checklist

Before any implementation begins, verify these properties of the spec:

  [ ] Every constraint (C1-C14) is expressible as a function
      Topology → valid | { violation, details }
  [ ] Every message type has a Zod schema
  [ ] Every constructor validates its preconditions
  [ ] The compiler algorithm terminates (C14 guarantees this)
  [ ] The recursive type AgentType = Primitive | Topology<AgentType>
      is representable in TypeScript/Zod
  [ ] The emitter can produce valid OpenClaw workspace directories
      from any valid AgentPrimitive
  [ ] The five message shapes cover every interaction identified
      in the six simulation scenarios
  [ ] No interaction requires a coupling surface other than
      typed messages

## Appendix B: Simulation Scenarios (verified)

  1. Full system boot from intent          — PASS (all messages typed)
  2. Normal work cycle (content creation)   — PASS
  3. Agent failure and recovery             — PASS
  4. Evolution (specialization)             — PASS
  5. Compiler self-compilation              — PASS
  6. Human interaction (escalation)         — PASS

## Appendix C: Open Questions

  Q1: How does the depth weight threshold get communicated to the user
      in a way that maps to intuitive cost/reliability tradeoffs?
      Current: CLI flag --threshold. May need better UX.

  Q2: How does the evolution planner's compile_request interact with
      the original seed's constraints? Does the sub-compilation inherit
      all seed constraints, or can evolution relax some?
      Current assumption: full inheritance. May need refinement.

  Q3: How does the system handle OpenClaw version changes? If OpenClaw
      updates its workspace format, the emitter needs updating.
      Current: emitter is the only OpenClaw-specific component.
      Isolated by design.

  Q4: What is the maximum practical topology size before OpenClaw's
      Gateway performance degrades? This sets an upper bound on
      compilation output.
      Current: unknown. Needs empirical testing.
