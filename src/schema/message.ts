/**
 * message.ts — The Universal Message Schema
 *
 * Every interaction in the system — compilation, execution, governance,
 * monitoring, evolution, human escalation — is an instance of this structure.
 *
 * Two pieces can connect if and only if the sender's output message type
 * matches the receiver's input message type.
 */

import { z } from 'zod';
import { MessageShape } from './shapes.js';

// ─── Trace: Provenance Chain ───────────────────────────────────────────

export const Trace = z.object({
  seed_id: z.string().describe('Which seed this traces to'),
  compilation_id: z.string().describe('Which compilation produced this context'),
  depth: z.number().int().min(0).describe('Topology depth at point of emission'),
  chain: z.array(z.string()).describe('Ordered list of node_ids this message passed through'),
});
export type Trace = z.infer<typeof Trace>;

// ─── Message: The Universal Stud ───────────────────────────────────────

export const Message = z.object({
  id: z.string().uuid().describe('Unique message identifier'),
  shape: MessageShape,
  from: z.string().describe('Sender node_id'),
  to: z.string().describe('Receiver node_id'),
  type: z.string().describe('Semantic type name'),
  payload: z.record(z.unknown()).describe('Typed data conforming to type schema'),
  timestamp: z.string().datetime().describe('ISO-8601 creation time'),
  trace: Trace,
  reply_to: z.string().uuid().optional().describe('ID of message this responds to'),
});
export type Message = z.infer<typeof Message>;

// ─── Decision enum (used across governance, quality, review) ───────────

export const Decision = z.enum(['ACCEPT', 'REJECT', 'ITERATE']);
export type Decision = z.infer<typeof Decision>;

// ─── Agent Status ──────────────────────────────────────────────────────

export const AgentStatus = z.enum(['alive', 'busy', 'degraded', 'specializing', 'dying', 'dead']);
export type AgentStatus = z.infer<typeof AgentStatus>;

// ─── Task Status ───────────────────────────────────────────────────────

export const TaskStatus = z.enum(['complete', 'failed', 'partial']);
export type TaskStatus = z.infer<typeof TaskStatus>;

// ─── Severity (1-5 scale) ──────────────────────────────────────────────

export const Severity = z.number().int().min(1).max(5);

// ─── Priority (1-5 scale) ──────────────────────────────────────────────

export const Priority = z.number().int().min(1).max(5);

// ─── Confidence (0-1 scale) ────────────────────────────────────────────

export const Confidence = z.number().min(0).max(1);
