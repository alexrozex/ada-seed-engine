/**
 * constraints.test.ts — Tests for all 14 constraints
 */

import { describe, it, expect } from 'vitest';
import {
  checkIdentityUniqueness,
  checkContractCompleteness,
  checkInterfaceCompatibility,
  checkStateIsolation,
  checkAuthorityMonotonicity,
  checkSupervisionCompleteness,
  checkLifecycleGovernance,
  checkBoundedDelegation,
  checkValidity,
  checkMonitoring,
  checkGovernance,
  checkFailureHandling,
  checkCompleteness,
  calculateWeight,
  THRESHOLD_PRESETS,
} from '@ada/constraints/index.js';
import type { Topology, AgentPrimitive } from '@ada/schema/index.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

function agent(id: string, opts: Partial<AgentPrimitive> = {}): AgentPrimitive {
  return {
    kind: 'primitive',
    identity: { id, name: `Agent ${id}`, created: '2026-04-07T00:00:00Z', lineage: [] },
    contract: { must: ['do work'], must_not: ['cause harm'], scope: opts.contract?.scope ?? '*' },
    interface: {
      accepts: opts.interface?.accepts ?? [{ type: 'task_assignment' }],
      emits: opts.interface?.emits ?? [{ type: 'task_result' }],
    },
    state: { owns: opts.state?.owns ?? [`${id}_state`], persists: true },
    lifecycle: {
      status: 'alive',
      supervisor: opts.lifecycle?.supervisor ?? 'governor',
      specialization_triggers: [],
      death_conditions: [],
    },
    ...opts,
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

// ─── C1: Identity Uniqueness ───────────────────────────────────────────

describe('C1: Identity Uniqueness', () => {
  it('passes when all IDs unique', () => {
    expect(checkIdentityUniqueness(topo([agent('a'), agent('b')]))).toHaveLength(0);
  });

  it('fails on duplicate IDs', () => {
    const violations = checkIdentityUniqueness(topo([agent('a'), agent('a')]));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C1_IDENTITY_UNIQUENESS');
  });
});

// ─── C2: Contract Completeness ─────────────────────────────────────────

describe('C2: Contract Completeness', () => {
  it('passes with valid contracts', () => {
    expect(checkContractCompleteness(topo([agent('a')]))).toHaveLength(0);
  });

  it('fails on empty must', () => {
    const a = agent('a');
    a.contract.must = [];
    const violations = checkContractCompleteness(topo([a]));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C2_CONTRACT_COMPLETENESS');
  });

  it('fails on empty must_not', () => {
    const a = agent('a');
    a.contract.must_not = [];
    const violations = checkContractCompleteness(topo([a]));
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ─── C3: Interface Compatibility ───────────────────────────────────────

describe('C3: Interface Compatibility', () => {
  it('passes when pipe interfaces overlap', () => {
    const a = agent('a', { interface: { accepts: [], emits: [{ type: 'content_draft' }] } });
    const b = agent('b', { interface: { accepts: [{ type: 'content_draft' }], emits: [] } });
    const t = topo([a, b], [{ from: 'a', to: 'b', constructor: 'pipe', message_types: ['content_draft'] }]);
    expect(checkInterfaceCompatibility(t)).toHaveLength(0);
  });

  it('fails when pipe interfaces have no overlap', () => {
    const a = agent('a', { interface: { accepts: [], emits: [{ type: 'content_draft' }] } });
    const b = agent('b', { interface: { accepts: [{ type: 'heartbeat_ping' }], emits: [] } });
    const t = topo([a, b], [{ from: 'a', to: 'b', constructor: 'pipe', message_types: [] }]);
    const violations = checkInterfaceCompatibility(t);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C3_INTERFACE_COMPATIBILITY');
  });

  it('ignores non-pipe connections', () => {
    const a = agent('a', { interface: { accepts: [], emits: [{ type: 'x' }] } });
    const b = agent('b', { interface: { accepts: [{ type: 'y' }], emits: [] } });
    const t = topo([a, b], [{ from: 'a', to: 'b', constructor: 'supervise', message_types: ['task_assignment'] }]);
    expect(checkInterfaceCompatibility(t)).toHaveLength(0);
  });
});

// ─── C4: State Isolation ───────────────────────────────────────────────

describe('C4: State Isolation', () => {
  it('passes when state domains are unique', () => {
    const a = agent('a', { state: { owns: ['domain_a'], persists: true } });
    const b = agent('b', { state: { owns: ['domain_b'], persists: true } });
    expect(checkStateIsolation(topo([a, b]))).toHaveLength(0);
  });

  it('fails when state domains overlap', () => {
    const a = agent('a', { state: { owns: ['shared_state'], persists: true } });
    const b = agent('b', { state: { owns: ['shared_state'], persists: true } });
    const violations = checkStateIsolation(topo([a, b]));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C4_STATE_ISOLATION');
  });
});

// ─── C5: Authority Monotonicity ────────────────────────────────────────

describe('C5: Authority Monotonicity', () => {
  it('passes when delegate scope within authority', () => {
    const a = agent('a', { contract: { must: ['x'], must_not: ['y'], scope: 'wsb.*' } });
    const b = agent('b');
    const t = topo([a, b], [{
      from: 'a', to: 'b', constructor: 'delegate',
      message_types: ['task_assignment'],
      config: { scope: 'wsb.social', timeout: 'PT1H' },
    }]);
    expect(checkAuthorityMonotonicity(t)).toHaveLength(0);
  });

  it('fails when delegate scope exceeds authority', () => {
    const a = agent('a', { contract: { must: ['x'], must_not: ['y'], scope: 'wsb.social.*' } });
    const b = agent('b');
    const t = topo([a, b], [{
      from: 'a', to: 'b', constructor: 'delegate',
      message_types: ['task_assignment'],
      config: { scope: 'wsb.*', timeout: 'PT1H' },
    }]);
    const violations = checkAuthorityMonotonicity(t);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C5_AUTHORITY_MONOTONICITY');
  });
});

// ─── C6: Supervision Completeness ──────────────────────────────────────

describe('C6: Supervision Completeness', () => {
  it('passes when every agent has a supervisor', () => {
    const a = agent('a', { lifecycle: { status: 'alive', supervisor: 'governor', specialization_triggers: [], death_conditions: [] } });
    expect(checkSupervisionCompleteness(topo([a]))).toHaveLength(0);
  });

  it('fails when agent has no supervisor', () => {
    const a = agent('a', { lifecycle: { status: 'alive', supervisor: '', specialization_triggers: [], death_conditions: [] } });
    const violations = checkSupervisionCompleteness(topo([a]));
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ─── C7: Lifecycle Governance ──────────────────────────────────────────

describe('C7: Lifecycle Governance', () => {
  it('passes when supervisor exists in topology or is governor', () => {
    const a = agent('a', { lifecycle: { status: 'alive', supervisor: 'governor', specialization_triggers: [], death_conditions: [] } });
    const b = agent('b', { lifecycle: { status: 'alive', supervisor: 'a', specialization_triggers: [], death_conditions: [] } });
    expect(checkLifecycleGovernance(topo([a, b]))).toHaveLength(0);
  });

  it('fails when supervisor references nonexistent agent', () => {
    const a = agent('a', { lifecycle: { status: 'alive', supervisor: 'nonexistent', specialization_triggers: [], death_conditions: [] } });
    const violations = checkLifecycleGovernance(topo([a]));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C7_LIFECYCLE_GOVERNANCE');
  });
});

// ─── C8: Bounded Delegation ───────────────────────────────────────────

describe('C8: Bounded Delegation', () => {
  it('passes when delegation has timeout', () => {
    const t = topo([agent('a'), agent('b')], [{
      from: 'a', to: 'b', constructor: 'delegate',
      message_types: ['task_assignment'],
      config: { scope: 'wsb', timeout: 'PT1H' },
    }]);
    expect(checkBoundedDelegation(t)).toHaveLength(0);
  });

  it('fails when delegation has no timeout', () => {
    const t = topo([agent('a'), agent('b')], [{
      from: 'a', to: 'b', constructor: 'delegate',
      message_types: ['task_assignment'],
      config: { scope: 'wsb' },
    }]);
    const violations = checkBoundedDelegation(t);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].constraint).toBe('C8_BOUNDED_DELEGATION');
  });

  it('detects delegation cycles', () => {
    const t = topo([agent('a'), agent('b')], [
      { from: 'a', to: 'b', constructor: 'delegate', message_types: ['task_assignment'], config: { scope: 'x', timeout: 'PT1H' } },
      { from: 'b', to: 'a', constructor: 'delegate', message_types: ['task_assignment'], config: { scope: 'x', timeout: 'PT1H' } },
    ]);
    const violations = checkBoundedDelegation(t);
    const cycleViolation = violations.find(v => v.description.includes('cycle'));
    expect(cycleViolation).toBeDefined();
  });
});

// ─── Combined Validity ─────────────────────────────────────────────────

describe('checkValidity (combined)', () => {
  it('passes for a well-formed topology', () => {
    const a = agent('supervisor', { contract: { must: ['coordinate'], must_not: ['overstep'], scope: '*' } });
    const b = agent('worker', {
      contract: { must: ['work'], must_not: ['slack'], scope: 'wsb' },
      lifecycle: { status: 'alive', supervisor: 'supervisor', specialization_triggers: [], death_conditions: [] },
    });
    const t = topo([a, b], [{
      from: 'supervisor', to: 'worker', constructor: 'supervise',
      message_types: ['task_assignment'],
    }]);

    const result = checkValidity(t);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ─── C14: Depth Weight ─────────────────────────────────────────────────

describe('C14: Depth Weight', () => {
  it('justifies critical violations at depth 0', () => {
    const result = calculateWeight(
      { constraint: 'C10', description: 'No governor', agent_id: 'a', resolution_hint: 'add governor', severity: 'critical' },
      0, 1.0,
    );
    expect(result.justified).toBe(true);
    expect(result.recommendation).toBe('add');
  });

  it('rejects low-severity violations at high depth', () => {
    const result = calculateWeight(
      { constraint: 'C13', description: 'No evaluator', agent_id: 'a', resolution_hint: 'add evaluator', severity: 'low' },
      4, 1.0,
    );
    expect(result.justified).toBe(false);
    expect(result.recommendation).toBe('skip');
  });

  it('threshold presets are ordered correctly', () => {
    expect(THRESHOLD_PRESETS.aggressive).toBeLessThan(THRESHOLD_PRESETS.moderate);
    expect(THRESHOLD_PRESETS.moderate).toBeLessThan(THRESHOLD_PRESETS.conservative);
    expect(THRESHOLD_PRESETS.conservative).toBeLessThan(THRESHOLD_PRESETS.minimal);
  });
});
