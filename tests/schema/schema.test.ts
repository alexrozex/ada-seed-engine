/**
 * schema.test.ts — Tests for the universal coupling surface
 *
 * Verifies: message shapes, message schema, all 27 type payloads,
 * type registry, and payload validation.
 */

import { describe, it, expect } from 'vitest';
import {
  MessageShape,
  expectsReply,
  isReply,
  replyShape,
  Message,
  Trace,
  Decision,
  AgentStatus,
  VerdictRequestPayload,
  VerdictPayload,
  TaskAssignmentPayload,
  TaskResultPayload,
  EscalationPayload,
  HeartbeatPingPayload,
  HeartbeatPongPayload,
  AgentSpawnPayload,
  AgentReadyPayload,
  AuditEntryPayload,
  KnowledgeUpdatePayload,
  CompileRequestPayload,
  CostReportPayload,
  MESSAGE_TYPE_REGISTRY,
  validatePayload,
  shapeForType,
} from '@ada/schema/index.js';

// ─── Shape Tests ───────────────────────────────────────────────────────

describe('Message Shapes', () => {
  it('has exactly 7 shape values', () => {
    const shapes = MessageShape.options;
    expect(shapes).toHaveLength(7);
  });

  it('request and assign expect replies', () => {
    expect(expectsReply('request')).toBe(true);
    expect(expectsReply('assign')).toBe(true);
    expect(expectsReply('signal')).toBe(false);
    expect(expectsReply('lifecycle')).toBe(false);
    expect(expectsReply('record')).toBe(false);
  });

  it('response and result are replies', () => {
    expect(isReply('response')).toBe(true);
    expect(isReply('result')).toBe(true);
    expect(isReply('request')).toBe(false);
    expect(isReply('signal')).toBe(false);
  });

  it('reply shapes map correctly', () => {
    expect(replyShape('request')).toBe('response');
    expect(replyShape('assign')).toBe('result');
    expect(replyShape('signal')).toBeNull();
    expect(replyShape('lifecycle')).toBeNull();
    expect(replyShape('record')).toBeNull();
  });
});

// ─── Trace Tests ───────────────────────────────────────────────────────

describe('Trace', () => {
  it('parses valid trace', () => {
    const result = Trace.safeParse({
      seed_id: 'seed-001',
      compilation_id: 'comp-001',
      depth: 0,
      chain: ['agent-a', 'agent-b'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative depth', () => {
    const result = Trace.safeParse({
      seed_id: 'seed-001',
      compilation_id: 'comp-001',
      depth: -1,
      chain: [],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Message Tests ─────────────────────────────────────────────────────

describe('Message', () => {
  const validMessage = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    shape: 'request',
    from: 'agent-a',
    to: 'agent-b',
    type: 'verdict_request',
    payload: { scope: 'wsb.*', action: 'publish', evidence: {} },
    timestamp: '2026-04-07T12:00:00Z',
    trace: {
      seed_id: 'seed-001',
      compilation_id: 'comp-001',
      depth: 0,
      chain: ['agent-a'],
    },
  };

  it('parses valid message', () => {
    const result = Message.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it('accepts optional reply_to', () => {
    const result = Message.safeParse({
      ...validMessage,
      shape: 'response',
      reply_to: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for id', () => {
    const result = Message.safeParse({ ...validMessage, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shape', () => {
    const result = Message.safeParse({ ...validMessage, shape: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    const result = Message.safeParse({ ...validMessage, timestamp: 'yesterday' });
    expect(result.success).toBe(false);
  });
});

// ─── Decision Tests ────────────────────────────────────────────────────

describe('Decision', () => {
  it('accepts ACCEPT, REJECT, ITERATE', () => {
    expect(Decision.safeParse('ACCEPT').success).toBe(true);
    expect(Decision.safeParse('REJECT').success).toBe(true);
    expect(Decision.safeParse('ITERATE').success).toBe(true);
  });

  it('rejects invalid decisions', () => {
    expect(Decision.safeParse('MAYBE').success).toBe(false);
    expect(Decision.safeParse('').success).toBe(false);
  });
});

// ─── Shape 1: REQUEST/RESPONSE Payload Tests ───────────────────────────

describe('Verdict payloads', () => {
  it('parses valid verdict request', () => {
    const result = VerdictRequestPayload.safeParse({
      scope: 'wsb.social.*',
      action: 'publish_to_instagram',
      evidence: { content_id: 'post-123', quality_score: 0.85 },
    });
    expect(result.success).toBe(true);
  });

  it('parses valid verdict response', () => {
    const result = VerdictPayload.safeParse({
      decision: 'ACCEPT',
      reason: 'Content meets brand guidelines',
    });
    expect(result.success).toBe(true);
  });

  it('parses verdict with feedback', () => {
    const result = VerdictPayload.safeParse({
      decision: 'ITERATE',
      reason: 'Caption too long',
      feedback: 'Shorten to under 150 characters',
    });
    expect(result.success).toBe(true);
  });
});

describe('Heartbeat payloads', () => {
  it('parses empty ping', () => {
    expect(HeartbeatPingPayload.safeParse({}).success).toBe(true);
  });

  it('parses pong with status', () => {
    const result = HeartbeatPongPayload.safeParse({
      status: 'alive',
      metrics: { uptime_seconds: 3600, pending_tasks: 2 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(HeartbeatPongPayload.safeParse({ status: 'unknown' }).success).toBe(false);
  });
});

describe('Compile payloads', () => {
  it('parses minimal compile request', () => {
    const result = CompileRequestPayload.safeParse({
      intent: 'Run walk-in barbershop operations',
    });
    expect(result.success).toBe(true);
  });

  it('parses compile request with constraints', () => {
    const result = CompileRequestPayload.safeParse({
      intent: 'Run barbershop ops',
      constraints: ['walk-in only', 'no appointments'],
      depth_threshold: 0.5,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Shape 2: ASSIGN/RESULT Payload Tests ──────────────────────────────

describe('Task payloads', () => {
  it('parses task assignment', () => {
    const result = TaskAssignmentPayload.safeParse({
      task: 'Draft Instagram post for Tuesday walk-in vibes',
      priority: 3,
    });
    expect(result.success).toBe(true);
  });

  it('parses task result', () => {
    const result = TaskResultPayload.safeParse({
      status: 'complete',
      output: { caption: 'Walk-ins welcome all day', image_notes: 'Shop interior shot' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid priority', () => {
    expect(TaskAssignmentPayload.safeParse({ task: 'test', priority: 0 }).success).toBe(false);
    expect(TaskAssignmentPayload.safeParse({ task: 'test', priority: 6 }).success).toBe(false);
  });
});

// ─── Shape 3: SIGNAL Payload Tests ─────────────────────────────────────

describe('Signal payloads', () => {
  it('parses escalation', () => {
    const result = EscalationPayload.safeParse({
      issue: 'Barber called in sick',
      severity: 3,
      context: { barber: 'Mike', date: '2026-04-08' },
      recommended_action: 'Post reduced hours story',
    });
    expect(result.success).toBe(true);
  });

  it('parses cost report', () => {
    const result = CostReportPayload.safeParse({
      agent_id: 'wsb-social-creator',
      period: 'PT24H',
      tokens: 15000,
      api_calls: 12,
      estimated_cost: 0.35,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Shape 4: LIFECYCLE Payload Tests ──────────────────────────────────

describe('Lifecycle payloads', () => {
  it('parses agent spawn', () => {
    const result = AgentSpawnPayload.safeParse({
      agent_id: 'wsb-ops',
      identity: { id: 'wsb-ops', name: 'Ops Manager' },
      contract: { must: ['coordinate'], must_not: ['book appointments'] },
      interface: { accepts: [], emits: [] },
      state_init: {},
      lifecycle: { status: 'alive', supervisor: 'governor' },
      supervisor: 'governor',
    });
    expect(result.success).toBe(true);
  });

  it('parses agent ready', () => {
    const result = AgentReadyPayload.safeParse({
      agent_id: 'wsb-ops',
      capabilities: ['coordinate', 'escalate', 'summarize'],
    });
    expect(result.success).toBe(true);
  });
});

// ─── Shape 5: RECORD Payload Tests ─────────────────────────────────────

describe('Record payloads', () => {
  it('parses audit entry', () => {
    const result = AuditEntryPayload.safeParse({
      event_type: 'verdict_issued',
      source_message_id: '550e8400-e29b-41d4-a716-446655440000',
      context: { decision: 'ACCEPT', agent: 'wsb-social-creator' },
      recorded_at: '2026-04-07T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses knowledge update', () => {
    const result = KnowledgeUpdatePayload.safeParse({
      agent_id: 'wsb-comp-scanner',
      domain: 'competitor_pricing',
      data: { tommy_guns: { haircut: 35, beard_trim: 20 } },
      source: 'web_scrape',
      freshness: '2026-04-07T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

// ─── Type Registry Tests ───────────────────────────────────────────────

describe('Message Type Registry', () => {
  it('has 23 registered types', () => {
    const count = Object.keys(MESSAGE_TYPE_REGISTRY).length;
    expect(count).toBe(23);
  });

  it('validates payload against registered schema', () => {
    expect(validatePayload('verdict_request', {
      scope: 'wsb.*', action: 'publish', evidence: {},
    })).toBe(true);
  });

  it('rejects invalid payload for registered type', () => {
    expect(validatePayload('verdict_request', {
      bad: 'data',
    })).toBe(false);
  });

  it('rejects unknown type names', () => {
    expect(validatePayload('nonexistent_type', {})).toBe(false);
  });

  it('returns correct shape for each type', () => {
    expect(shapeForType('verdict_request')).toBe('request');
    expect(shapeForType('verdict')).toBe('response');
    expect(shapeForType('task_assignment')).toBe('assign');
    expect(shapeForType('task_result')).toBe('result');
    expect(shapeForType('escalation')).toBe('signal');
    expect(shapeForType('agent_spawn')).toBe('lifecycle');
    expect(shapeForType('audit_entry')).toBe('record');
  });

  it('returns null for unknown type', () => {
    expect(shapeForType('nonexistent')).toBeNull();
  });
});
