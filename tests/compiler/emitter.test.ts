/**
 * emitter.test.ts — Tests for the OpenClaw workspace emitter
 */

import { describe, it, expect } from 'vitest';
import { emitAgentWorkspace, emitTopology } from '@ada/compiler/emitter.js';
import type { AgentPrimitive, Topology, AgentType } from '@ada/schema/index.js';
import type { GovernanceConfig, ProvenanceRecord } from '@ada/compiler/emitter.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<AgentPrimitive> = {}): AgentPrimitive {
  return {
    kind: 'primitive',
    identity: {
      id,
      name: `Agent ${id}`,
      created: '2026-04-07T00:00:00Z',
      lineage: ['seed-test', 'compile-001'],
    },
    contract: {
      must: ['Produce daily summary by 6PM', 'Monitor competitive pricing weekly'],
      must_not: ['Book appointments', 'Share customer data externally'],
      scope: 'wsb.*',
    },
    interface: {
      accepts: [
        { type: 'task_assignment', description: 'Work from supervisor' },
        { type: 'heartbeat_ping' },
      ],
      emits: [
        { type: 'task_result', description: 'Reports to supervisor' },
        { type: 'escalation' },
        { type: 'heartbeat_pong' },
      ],
    },
    state: {
      owns: ['daily_log', 'barber_roster'],
      persists: true,
    },
    lifecycle: {
      status: 'alive',
      supervisor: 'governor',
      specialization_triggers: [
        { condition: 'DM volume > 20/day for 7 days', action: 'spawn dm_handler' },
      ],
      death_conditions: [
        { condition: 'Business closure' },
      ],
    },
    ...overrides,
  };
}

const testGovernance: GovernanceConfig = {
  invariants: ['No appointments', 'Anthropic models only'],
  escalation_target: 'alex',
  escalation_channel: 'whatsapp',
  governor_checks: ['All public content reviewed'],
};

const testProvenance: ProvenanceRecord = {
  seed_intent: 'Run barbershop operations',
  compiler_version: '0.1.0',
  compilation_time_ms: 5000,
  stages: [
    { stage: 'intent_parse', model: 'claude-sonnet-4-6', tokens: 500, governor: 'ACCEPT' },
  ],
  total_tokens: 500,
  estimated_cost: 0.01,
  agent_count: 1,
  max_depth: 0,
};

// ─── Single Agent Workspace Tests ──────────────────────────────────────

describe('emitAgentWorkspace', () => {
  it('produces 5 files', () => {
    const workspace = emitAgentWorkspace(makeAgent('wsb-ops'));
    expect(workspace.files).toHaveLength(5);
  });

  it('produces correct file names', () => {
    const workspace = emitAgentWorkspace(makeAgent('wsb-ops'));
    const names = workspace.files.map(f => f.path);
    expect(names).toContain('SOUL.md');
    expect(names).toContain('AGENTS.md');
    expect(names).toContain('IDENTITY.md');
    expect(names).toContain('HEARTBEAT.md');
    expect(names).toContain('MEMORY.md');
  });

  it('sets agent_id correctly', () => {
    const workspace = emitAgentWorkspace(makeAgent('my-agent'));
    expect(workspace.agent_id).toBe('my-agent');
  });

  // SOUL.md tests
  describe('SOUL.md', () => {
    it('contains agent name', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const soul = ws.files.find(f => f.path === 'SOUL.md')!;
      expect(soul.content).toContain('Agent wsb-ops');
    });

    it('contains must behaviors', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const soul = ws.files.find(f => f.path === 'SOUL.md')!;
      expect(soul.content).toContain('Produce daily summary by 6PM');
      expect(soul.content).toContain('Monitor competitive pricing weekly');
    });

    it('contains must_not behaviors', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const soul = ws.files.find(f => f.path === 'SOUL.md')!;
      expect(soul.content).toContain('Book appointments');
      expect(soul.content).toContain('Share customer data externally');
    });

    it('contains scope', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const soul = ws.files.find(f => f.path === 'SOUL.md')!;
      expect(soul.content).toContain('wsb.*');
    });
  });

  // AGENTS.md tests
  describe('AGENTS.md', () => {
    it('lists accepted message types', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const agents = ws.files.find(f => f.path === 'AGENTS.md')!;
      expect(agents.content).toContain('task_assignment');
      expect(agents.content).toContain('heartbeat_ping');
    });

    it('lists emitted message types', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const agents = ws.files.find(f => f.path === 'AGENTS.md')!;
      expect(agents.content).toContain('task_result');
      expect(agents.content).toContain('escalation');
    });

    it('shows supervisor', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const agents = ws.files.find(f => f.path === 'AGENTS.md')!;
      expect(agents.content).toContain('governor');
    });

    it('includes specialization triggers', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const agents = ws.files.find(f => f.path === 'AGENTS.md')!;
      expect(agents.content).toContain('DM volume > 20/day');
    });
  });

  // IDENTITY.md tests
  describe('IDENTITY.md', () => {
    it('contains id and created date', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const id = ws.files.find(f => f.path === 'IDENTITY.md')!;
      expect(id.content).toContain('wsb-ops');
      expect(id.content).toContain('2026-04-07');
    });

    it('contains lineage', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const id = ws.files.find(f => f.path === 'IDENTITY.md')!;
      expect(id.content).toContain('seed-test');
    });
  });

  // HEARTBEAT.md tests
  describe('HEARTBEAT.md', () => {
    it('includes default heartbeat tasks', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const hb = ws.files.find(f => f.path === 'HEARTBEAT.md')!;
      expect(hb.content).toContain('heartbeat_ping');
      expect(hb.content).toContain('health_alert');
    });

    it('extracts periodic tasks from contract', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const hb = ws.files.find(f => f.path === 'HEARTBEAT.md')!;
      // "daily summary" and "weekly" monitoring should be extracted
      expect(hb.content).toContain('daily summary');
      expect(hb.content).toContain('weekly');
    });

    it('includes specialization trigger monitoring', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const hb = ws.files.find(f => f.path === 'HEARTBEAT.md')!;
      expect(hb.content).toContain('DM volume');
    });
  });

  // MEMORY.md tests
  describe('MEMORY.md', () => {
    it('lists state domains', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const mem = ws.files.find(f => f.path === 'MEMORY.md')!;
      expect(mem.content).toContain('daily_log');
      expect(mem.content).toContain('barber_roster');
    });

    it('indicates persistence', () => {
      const ws = emitAgentWorkspace(makeAgent('wsb-ops'));
      const mem = ws.files.find(f => f.path === 'MEMORY.md')!;
      expect(mem.content).toContain('survives restarts');
    });
  });
});

// ─── Topology Emission Tests ───────────────────────────────────────────

describe('emitTopology', () => {
  it('emits workspaces for all agents in topology', () => {
    const a = makeAgent('agent-a');
    const b = makeAgent('agent-b');
    const topology: Topology = {
      root: 'agent-a',
      agents: [a, b],
      connections: [{
        from: 'agent-a',
        to: 'agent-b',
        constructor: 'pipe',
        message_types: ['task_result'],
      }],
      metadata: { agent_count: 2, max_depth: 0, constructors_used: ['pipe'] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    expect(system.workspaces).toHaveLength(2);
    expect(system.workspaces.map(w => w.agent_id)).toContain('agent-a');
    expect(system.workspaces.map(w => w.agent_id)).toContain('agent-b');
  });

  it('produces valid topology.json', () => {
    const a = makeAgent('agent-a');
    const topology: Topology = {
      root: 'agent-a',
      agents: [a],
      connections: [],
      metadata: { agent_count: 1, max_depth: 0, constructors_used: [] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    const topo = JSON.parse(system.topology_json);
    expect(topo.version).toBe('1.0.0');
    expect(topo.root).toBe('agent-a');
    expect(topo.agents['agent-a']).toBeDefined();
    expect(topo.agents['agent-a'].supervisor).toBe('governor');
  });

  it('produces valid governance.json', () => {
    const topology: Topology = {
      root: 'a',
      agents: [makeAgent('a')],
      connections: [],
      metadata: { agent_count: 1, max_depth: 0, constructors_used: [] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    const gov = JSON.parse(system.governance_json);
    expect(gov.invariants).toContain('No appointments');
    expect(gov.escalation_target).toBe('alex');
  });

  it('produces valid provenance.json', () => {
    const topology: Topology = {
      root: 'a',
      agents: [makeAgent('a')],
      connections: [],
      metadata: { agent_count: 1, max_depth: 0, constructors_used: [] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    const prov = JSON.parse(system.provenance_json);
    expect(prov.seed_intent).toBe('Run barbershop operations');
    expect(prov.compiler_version).toBe('0.1.0');
  });

  it('deduplicates agents by id', () => {
    const shared = makeAgent('shared-agent');
    const topology: Topology = {
      root: 'shared-agent',
      agents: [shared, shared], // intentional duplicate
      connections: [],
      metadata: { agent_count: 1, max_depth: 0, constructors_used: [] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    expect(system.workspaces).toHaveLength(1);
  });

  it('handles composite agents by flattening', () => {
    const child1 = makeAgent('child-1');
    const child2 = makeAgent('child-2');
    const composite: AgentType = {
      kind: 'composite',
      identity: { id: 'parent', name: 'Parent', created: '2026-04-07T00:00:00Z', lineage: [] },
      contract: { must: ['coordinate'], must_not: ['overstep'], scope: '*' },
      interface: { accepts: [{ type: 'task_assignment' }], emits: [{ type: 'task_result' }] },
      state: { owns: ['parent_state'], persists: true },
      lifecycle: { status: 'alive', supervisor: 'governor', specialization_triggers: [], death_conditions: [] },
      topology: { constructor: 'parallel', agents: [child1, child2] },
    };

    const topology: Topology = {
      root: 'parent',
      agents: [composite],
      connections: [],
      metadata: { agent_count: 3, max_depth: 1, constructors_used: ['parallel'] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    // Should have workspaces for parent + child-1 + child-2
    expect(system.workspaces).toHaveLength(3);
    const ids = system.workspaces.map(w => w.agent_id);
    expect(ids).toContain('parent');
    expect(ids).toContain('child-1');
    expect(ids).toContain('child-2');
  });

  it('includes routes in topology.json', () => {
    const a = makeAgent('a');
    const b = makeAgent('b');
    const topology: Topology = {
      root: 'a',
      agents: [a, b],
      connections: [{
        from: 'a', to: 'b', constructor: 'supervise',
        message_types: ['task_assignment'],
      }],
      metadata: { agent_count: 2, max_depth: 1, constructors_used: ['supervise'] },
    };

    const system = emitTopology(topology, testGovernance, testProvenance);
    const topo = JSON.parse(system.topology_json);
    expect(topo.routes).toHaveLength(1);
    expect(topo.routes[0].from).toBe('a');
    expect(topo.routes[0].to).toBe('b');
    expect(topo.routes[0].type).toBe('supervise');
  });
});
