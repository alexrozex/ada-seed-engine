/**
 * agent.test.ts — Tests for agent primitives and recursive type
 */

import { describe, it, expect } from 'vitest';
import {
  Identity,
  Contract,
  AgentInterface,
  AgentState,
  Lifecycle,
  AgentPrimitive,
  isLeaf,
  isComposite,
  countAgents,
  maxDepth,
  collectIds,
} from '@ada/schema/index.js';
import type { AgentType } from '@ada/schema/index.js';

// ─── Test Fixtures ─────────────────────────────────────────────────────

function makeLeaf(id: string, scope: string = '*'): AgentType {
  return {
    kind: 'primitive' as const,
    identity: { id, name: `Agent ${id}`, created: '2026-04-07T00:00:00Z', lineage: ['seed-001'] },
    contract: { must: ['do work'], must_not: ['cause harm'], scope },
    interface: {
      accepts: [{ type: 'task_assignment' }],
      emits: [{ type: 'task_result' }],
    },
    state: { owns: [`${id}_state`], persists: true },
    lifecycle: { status: 'alive' as const, supervisor: 'governor', specialization_triggers: [], death_conditions: [] },
  };
}

function makeComposite(id: string, children: AgentType[]): AgentType {
  return {
    kind: 'composite' as const,
    identity: { id, name: `Composite ${id}`, created: '2026-04-07T00:00:00Z', lineage: ['seed-001'] },
    contract: { must: ['coordinate'], must_not: ['overstep'], scope: '*' },
    interface: {
      accepts: [{ type: 'task_assignment' }],
      emits: [{ type: 'task_result' }],
    },
    state: { owns: [`${id}_state`], persists: true },
    lifecycle: { status: 'alive' as const, supervisor: 'governor', specialization_triggers: [], death_conditions: [] },
    topology: { constructor: 'parallel' as const, agents: children },
  };
}

// ─── Identity Tests ────────────────────────────────────────────────────

describe('Identity', () => {
  it('parses valid identity', () => {
    const result = Identity.safeParse({
      id: 'wsb-ops',
      name: 'Operations Manager',
      created: '2026-04-07T00:00:00Z',
      lineage: ['seed-barbershop', 'compile-001'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    expect(Identity.safeParse({ id: '', name: 'Test', created: '2026-04-07T00:00:00Z', lineage: [] }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(Identity.safeParse({ id: 'test', name: '', created: '2026-04-07T00:00:00Z', lineage: [] }).success).toBe(false);
  });
});

// ─── Contract Tests ────────────────────────────────────────────────────

describe('Contract', () => {
  it('parses valid contract', () => {
    const result = Contract.safeParse({
      must: ['coordinate ops', 'produce daily summary'],
      must_not: ['book appointments', 'share customer data'],
      scope: 'wsb.*',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty must array', () => {
    expect(Contract.safeParse({ must: [], must_not: ['x'], scope: 'wsb' }).success).toBe(false);
  });

  it('rejects empty must_not array', () => {
    expect(Contract.safeParse({ must: ['x'], must_not: [], scope: 'wsb' }).success).toBe(false);
  });

  it('rejects empty scope', () => {
    expect(Contract.safeParse({ must: ['x'], must_not: ['y'], scope: '' }).success).toBe(false);
  });
});

// ─── Interface Tests ───────────────────────────────────────────────────

describe('AgentInterface', () => {
  it('parses valid interface', () => {
    const result = AgentInterface.safeParse({
      accepts: [{ type: 'task_assignment', description: 'Receives work from supervisor' }],
      emits: [{ type: 'task_result' }, { type: 'escalation' }],
    });
    expect(result.success).toBe(true);
  });

  it('allows empty accepts/emits', () => {
    const result = AgentInterface.safeParse({ accepts: [], emits: [] });
    expect(result.success).toBe(true);
  });
});

// ─── AgentPrimitive Tests ──────────────────────────────────────────────

describe('AgentPrimitive', () => {
  it('parses valid primitive', () => {
    const leaf = makeLeaf('test-agent', 'wsb.*');
    const result = AgentPrimitive.safeParse(leaf);
    expect(result.success).toBe(true);
  });

  it('rejects missing kind', () => {
    const bad = { ...makeLeaf('test'), kind: undefined };
    expect(AgentPrimitive.safeParse(bad).success).toBe(false);
  });
});

// ─── Leaf/Composite Detection ──────────────────────────────────────────

describe('isLeaf / isComposite', () => {
  it('identifies leaf agents', () => {
    const leaf = makeLeaf('a');
    expect(isLeaf(leaf)).toBe(true);
    expect(isComposite(leaf)).toBe(false);
  });

  it('identifies composite agents', () => {
    const comp = makeComposite('parent', [makeLeaf('child-1'), makeLeaf('child-2')]);
    expect(isComposite(comp)).toBe(true);
    expect(isLeaf(comp)).toBe(false);
  });
});

// ─── Recursive Operations ──────────────────────────────────────────────

describe('countAgents', () => {
  it('counts 1 for a leaf', () => {
    expect(countAgents(makeLeaf('a'))).toBe(1);
  });

  it('counts correctly for flat composite', () => {
    const comp = makeComposite('p', [makeLeaf('a'), makeLeaf('b')]);
    expect(countAgents(comp)).toBe(3); // parent + 2 children
  });

  it('counts correctly for nested composite', () => {
    const inner = makeComposite('inner', [makeLeaf('a'), makeLeaf('b')]);
    const outer = makeComposite('outer', [inner, makeLeaf('c')]);
    expect(countAgents(outer)).toBe(5); // outer + inner + a + b + c
  });
});

describe('maxDepth', () => {
  it('returns 0 for a leaf', () => {
    expect(maxDepth(makeLeaf('a'))).toBe(0);
  });

  it('returns 1 for flat composite', () => {
    expect(maxDepth(makeComposite('p', [makeLeaf('a')]))).toBe(1);
  });

  it('returns correct depth for nesting', () => {
    const d1 = makeComposite('d1', [makeLeaf('a')]);
    const d2 = makeComposite('d2', [d1]);
    const d3 = makeComposite('d3', [d2]);
    expect(maxDepth(d3)).toBe(3);
  });
});

describe('collectIds', () => {
  it('returns single id for leaf', () => {
    expect(collectIds(makeLeaf('solo'))).toEqual(['solo']);
  });

  it('collects all ids recursively', () => {
    const inner = makeComposite('inner', [makeLeaf('a'), makeLeaf('b')]);
    const outer = makeComposite('outer', [inner, makeLeaf('c')]);
    const ids = collectIds(outer);
    expect(ids).toContain('outer');
    expect(ids).toContain('inner');
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toHaveLength(5);
  });
});
