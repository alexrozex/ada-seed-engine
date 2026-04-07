/**
 * topology.test.ts — Tests for constructors and topology operations
 */

import { describe, it, expect } from 'vitest';
import {
  pipe,
  parallel,
  supervise,
  delegate,
  scopeContains,
  mergeTopologies,
} from '@ada/schema/index.js';
import type { AgentType } from '@ada/schema/index.js';

// ─── Test Fixtures ─────────────────────────────────────────────────────

function makeAgent(id: string, opts: {
  scope?: string;
  accepts?: string[];
  emits?: string[];
  supervisor?: string;
} = {}): AgentType {
  return {
    kind: 'primitive' as const,
    identity: { id, name: `Agent ${id}`, created: '2026-04-07T00:00:00Z', lineage: [] },
    contract: { must: ['do work'], must_not: ['cause harm'], scope: opts.scope ?? '*' },
    interface: {
      accepts: (opts.accepts ?? ['task_assignment']).map(t => ({ type: t })),
      emits: (opts.emits ?? ['task_result']).map(t => ({ type: t })),
    },
    state: { owns: [`${id}_state`], persists: true },
    lifecycle: {
      status: 'alive' as const,
      supervisor: opts.supervisor ?? 'governor',
      specialization_triggers: [],
      death_conditions: [],
    },
  };
}

// ─── Scope Containment Tests ───────────────────────────────────────────

describe('scopeContains', () => {
  it('wildcard contains everything', () => {
    expect(scopeContains('*', 'anything')).toBe(true);
    expect(scopeContains('*', 'wsb.social.creator')).toBe(true);
  });

  it('exact match', () => {
    expect(scopeContains('wsb.social', 'wsb.social')).toBe(true);
  });

  it('parent contains child', () => {
    expect(scopeContains('wsb.*', 'wsb.social')).toBe(true);
    expect(scopeContains('wsb.*', 'wsb.social.creator')).toBe(true);
    expect(scopeContains('wsb.social.*', 'wsb.social.creator')).toBe(true);
  });

  it('child does not contain parent', () => {
    expect(scopeContains('wsb.social.*', 'wsb')).toBe(false);
    expect(scopeContains('wsb.social.creator', 'wsb.social')).toBe(false);
  });

  it('sibling does not contain sibling', () => {
    expect(scopeContains('wsb.social.*', 'wsb.competitive')).toBe(false);
  });
});

// ─── Pipe Constructor Tests ────────────────────────────────────────────

describe('pipe', () => {
  it('succeeds when interfaces overlap', () => {
    const a = makeAgent('a', { emits: ['content_draft'] });
    const b = makeAgent('b', { accepts: ['content_draft'] });
    const result = pipe(a, b);
    expect(result.success).toBe(true);
    expect(result.topology?.connections).toHaveLength(1);
    expect(result.topology?.connections[0].constructor).toBe('pipe');
    expect(result.topology?.connections[0].message_types).toContain('content_draft');
  });

  it('fails when no interface overlap', () => {
    const a = makeAgent('a', { emits: ['content_draft'] });
    const b = makeAgent('b', { accepts: ['heartbeat_ping'] });
    const result = pipe(a, b);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No overlap');
  });

  it('includes both agents in topology', () => {
    const a = makeAgent('a', { emits: ['task_result'] });
    const b = makeAgent('b', { accepts: ['task_result'] });
    const result = pipe(a, b);
    expect(result.topology?.agents).toHaveLength(2);
  });
});

// ─── Parallel Constructor Tests ────────────────────────────────────────

describe('parallel', () => {
  it('succeeds with 2+ agents', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
    const result = parallel(agents);
    expect(result.success).toBe(true);
    expect(result.topology?.agents).toHaveLength(3);
  });

  it('fails with fewer than 2 agents', () => {
    const result = parallel([makeAgent('a')]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('has no direct inter-connections', () => {
    const result = parallel([makeAgent('a'), makeAgent('b')]);
    expect(result.topology?.connections).toHaveLength(0);
  });
});

// ─── Supervise Constructor Tests ───────────────────────────────────────

describe('supervise', () => {
  it('succeeds when supervisor scope contains worker scope', () => {
    const sup = makeAgent('sup', { scope: 'wsb.*' });
    const worker = makeAgent('worker', { scope: 'wsb.social' });
    const result = supervise(sup, worker);
    expect(result.success).toBe(true);
    expect(result.topology?.connections).toHaveLength(2); // bidirectional
  });

  it('fails when scope violation', () => {
    const sup = makeAgent('sup', { scope: 'wsb.social.*' });
    const worker = makeAgent('worker', { scope: 'wsb.competitive' });
    const result = supervise(sup, worker);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Scope violation');
  });

  it('has bidirectional connections (assignments down, results/escalations up)', () => {
    const sup = makeAgent('sup', { scope: '*' });
    const worker = makeAgent('worker', { scope: 'wsb' });
    const result = supervise(sup, worker);
    const downward = result.topology?.connections.find(c => c.from === 'sup');
    const upward = result.topology?.connections.find(c => c.from === 'worker');
    expect(downward?.message_types).toContain('task_assignment');
    expect(upward?.message_types).toContain('task_result');
    expect(upward?.message_types).toContain('escalation');
  });
});

// ─── Delegate Constructor Tests ────────────────────────────────────────

describe('delegate', () => {
  it('succeeds when delegation scope within authority', () => {
    const from = makeAgent('manager', { scope: 'wsb.*' });
    const to = makeAgent('worker', { scope: 'wsb.social' });
    const result = delegate(from, to, { scope: 'wsb.social', timeout: 'PT1H' });
    expect(result.success).toBe(true);
  });

  it('fails on authority monotonicity violation', () => {
    const from = makeAgent('manager', { scope: 'wsb.social.*' });
    const to = makeAgent('worker', { scope: 'wsb.*' });
    const result = delegate(from, to, { scope: 'wsb.*', timeout: 'PT1H' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authority monotonicity');
  });

  it('includes timeout in connection config', () => {
    const from = makeAgent('from', { scope: '*' });
    const to = makeAgent('to', { scope: 'wsb' });
    const result = delegate(from, to, { scope: 'wsb', timeout: 'PT30M' });
    const delegateConn = result.topology?.connections.find(c =>
      c.from === 'from' && c.constructor === 'delegate'
    );
    expect(delegateConn?.config?.timeout).toBe('PT30M');
  });
});

// ─── Topology Merging Tests ────────────────────────────────────────────

describe('mergeTopologies', () => {
  it('merges two topologies', () => {
    const a = makeAgent('a', { emits: ['task_result'] });
    const b = makeAgent('b', { accepts: ['task_result'] });
    const c = makeAgent('c');

    const t1 = pipe(a, b).topology!;
    const t2 = parallel([b, c]).topology!;

    const merged = mergeTopologies([t1, t2], 'a');
    expect(merged.agents).toHaveLength(3); // a, b (deduped), c
    expect(merged.connections.length).toBeGreaterThan(0);
  });

  it('deduplicates agents by id', () => {
    const a = makeAgent('shared');
    const t1 = parallel([a, makeAgent('x')]).topology!;
    const t2 = parallel([a, makeAgent('y')]).topology!;

    const merged = mergeTopologies([t1, t2], 'shared');
    const sharedCount = merged.agents.filter(ag => ag.identity.id === 'shared').length;
    expect(sharedCount).toBe(1);
  });
});
