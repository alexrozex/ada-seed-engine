/**
 * verifier.test.ts — Tests for topology verification
 */

import { describe, it, expect } from 'vitest';
import { verify } from '@ada/compiler/verifier.js';
import type { Topology, AgentPrimitive } from '@ada/schema/index.js';

function agent(id: string, opts: {
  supervisor?: string;
  accepts?: string[];
  emits?: string[];
  must?: string[];
  must_not?: string[];
  scope?: string;
} = {}): AgentPrimitive {
  return {
    kind: 'primitive',
    identity: { id, name: `Agent ${id}`, created: '2026-04-07T00:00:00Z', lineage: [] },
    contract: {
      must: opts.must ?? ['do work'],
      must_not: opts.must_not ?? ['cause harm'],
      scope: opts.scope ?? '*',
    },
    interface: {
      accepts: (opts.accepts ?? ['task_assignment']).map(t => ({ type: t })),
      emits: (opts.emits ?? ['task_result']).map(t => ({ type: t })),
    },
    state: { owns: [`${id}_state`], persists: true },
    lifecycle: {
      status: 'alive',
      supervisor: opts.supervisor ?? 'governor',
      specialization_triggers: [],
      death_conditions: [],
    },
  };
}

function topo(agents: AgentPrimitive[], connections: Topology['connections'] = []): Topology {
  return {
    root: agents[0]?.identity.id ?? 'root',
    agents,
    connections,
    metadata: { agent_count: agents.length, max_depth: 0, constructors_used: [] },
  };
}

// ─── Basic verification ────────────────────────────────────────────────

describe('verify', () => {
  it('passes for a simple valid topology', () => {
    const sup = agent('supervisor');
    const worker = agent('worker', { supervisor: 'supervisor' });
    const t = topo([sup, worker], [
      { from: 'supervisor', to: 'worker', constructor: 'supervise', message_types: ['task_assignment'] },
      { from: 'worker', to: 'supervisor', constructor: 'supervise', message_types: ['task_result'] },
    ]);

    const result = verify(t);
    expect(result.passed).toBe(true);
    expect(result.stats.total_agents).toBe(2);
  });

  it('reports stats correctly', () => {
    const a = agent('a');
    const b = agent('b', { supervisor: 'a' });
    const t = topo([a, b], [
      { from: 'a', to: 'b', constructor: 'supervise', message_types: ['task_assignment'] },
    ]);

    const result = verify(t);
    expect(result.stats.total_agents).toBe(2);
    expect(result.stats.total_connections).toBe(1);
  });
});

// ─── Reachability ──────────────────────────────────────────────────────

describe('reachability', () => {
  it('detects unreachable agents', () => {
    const a = agent('connected');
    const b = agent('isolated'); // no connection from root, no supervision link

    // Override b's supervisor to something that doesn't point to connected
    const bAgent = { ...b, lifecycle: { ...b.lifecycle, supervisor: 'nonexistent' } };
    const t = topo([a, bAgent]);

    const result = verify(t);
    const reachIssues = result.issues.filter(i => i.category === 'reachability');
    expect(reachIssues.length).toBeGreaterThan(0);
  });

  it('reaches agents through supervision', () => {
    const sup = agent('root');
    const worker = agent('worker', { supervisor: 'root' });
    const t = topo([sup, worker]); // No explicit connections but supervision links them

    const result = verify(t);
    expect(result.stats.reachable_agents).toBe(2);
  });
});

// ─── Supervision cycles ────────────────────────────────────────────────

describe('supervision cycles', () => {
  it('detects supervision cycle', () => {
    const a = agent('a', { supervisor: 'b' });
    const b = agent('b', { supervisor: 'a' });
    const t = topo([a, b]);

    const result = verify(t);
    const cycleIssues = result.issues.filter(i => i.category === 'supervision_cycle');
    expect(cycleIssues.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false); // Cycles are errors
  });

  it('passes for valid supervision chain', () => {
    const a = agent('a', { supervisor: 'governor' });
    const b = agent('b', { supervisor: 'a' });
    const c = agent('c', { supervisor: 'b' });
    const t = topo([a, b, c]);

    const result = verify(t);
    const cycleIssues = result.issues.filter(i => i.category === 'supervision_cycle');
    expect(cycleIssues).toHaveLength(0);
  });
});

// ─── Contract consistency ──────────────────────────────────────────────

describe('contract consistency', () => {
  it('detects contradiction in must/must_not', () => {
    const a = agent('a', {
      must: ['book appointments'],
      must_not: ['book appointments'],
    });
    const t = topo([a]);

    const result = verify(t);
    const contradictions = result.issues.filter(i => i.category === 'contract_contradiction');
    expect(contradictions.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('warns about empty interface', () => {
    const a: AgentPrimitive = {
      kind: 'primitive',
      identity: { id: 'empty', name: 'Empty', created: '2026-04-07T00:00:00Z', lineage: [] },
      contract: { must: ['exist'], must_not: ['fail'], scope: '*' },
      interface: { accepts: [], emits: [] },
      state: { owns: [], persists: false },
      lifecycle: { status: 'alive', supervisor: 'governor', specialization_triggers: [], death_conditions: [] },
    };
    const t = topo([a]);

    const result = verify(t);
    const emptyInterface = result.issues.filter(i => i.category === 'empty_interface');
    expect(emptyInterface.length).toBeGreaterThan(0);
  });
});

// ─── Governance coverage ───────────────────────────────────────────────

describe('governance coverage', () => {
  it('passes when verdict_request emitters have route to governor', () => {
    const gov = agent('gov', { accepts: ['verdict_request'], emits: ['verdict'] });
    const worker = agent('worker', { emits: ['verdict_request', 'task_result'], supervisor: 'gov' });
    const t = topo([gov, worker], [
      { from: 'worker', to: 'gov', constructor: 'supervise', message_types: ['verdict_request'] },
    ]);

    const result = verify(t);
    const govGaps = result.issues.filter(i => i.category === 'governance_gap');
    expect(govGaps).toHaveLength(0);
  });
});

// ─── Full pipeline verification ────────────────────────────────────────

describe('full compiled topology verification', () => {
  it('verifies a realistic barbershop topology', () => {
    const ops = agent('wsb-ops', { supervisor: 'governor', emits: ['task_assignment', 'task_result', 'escalation'] });
    const social = agent('wsb-social', { supervisor: 'wsb-ops', emits: ['task_result', 'verdict_request'] });
    const reputation = agent('wsb-reputation', { supervisor: 'wsb-ops', emits: ['task_result', 'escalation'] });
    const governor = agent('wsb-governor', { supervisor: 'governor', accepts: ['verdict_request', 'health_alert'], emits: ['verdict', 'escalation'] });
    const monitor = agent('wsb-monitor', { supervisor: 'wsb-ops', accepts: ['heartbeat_pong'], emits: ['heartbeat_ping', 'health_alert'] });

    const t = topo([ops, social, reputation, governor, monitor], [
      { from: 'wsb-ops', to: 'wsb-social', constructor: 'supervise', message_types: ['task_assignment'] },
      { from: 'wsb-social', to: 'wsb-ops', constructor: 'supervise', message_types: ['task_result'] },
      { from: 'wsb-ops', to: 'wsb-reputation', constructor: 'supervise', message_types: ['task_assignment'] },
      { from: 'wsb-reputation', to: 'wsb-ops', constructor: 'supervise', message_types: ['task_result'] },
      { from: 'wsb-social', to: 'wsb-governor', constructor: 'pipe', message_types: ['verdict_request'] },
      { from: 'wsb-governor', to: 'wsb-social', constructor: 'pipe', message_types: ['verdict'] },
    ]);

    const result = verify(t);
    expect(result.passed).toBe(true);
    expect(result.stats.total_agents).toBe(5);
    expect(result.stats.reachable_agents).toBeGreaterThanOrEqual(4);
  });
});
