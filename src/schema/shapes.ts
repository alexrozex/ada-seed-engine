/**
 * shapes.ts — The Five Message Shapes
 *
 * Every interaction in the Ada Seed Engine is one of exactly five shapes.
 * The shape determines routing behavior. The typed payload determines semantics.
 *
 * This is the stud geometry. The universal coupling surface.
 */

import { z } from 'zod';

/**
 * Shape 1: REQUEST → RESPONSE
 * Asking for something, getting an answer.
 * Bidirectional. Caller blocks (logically) until response.
 */
export const MessageShape = z.enum([
  'request',
  'response',
  'assign',
  'result',
  'signal',
  'lifecycle',
  'record',
]);
export type MessageShape = z.infer<typeof MessageShape>;

/**
 * Shape groupings — which shapes pair together
 */
export const SHAPE_PAIRS = {
  request_response: { outbound: 'request', inbound: 'response' },
  assign_result: { outbound: 'assign', inbound: 'result' },
} as const;

export const UNIDIRECTIONAL_SHAPES = ['signal', 'lifecycle', 'record'] as const;
export const BIDIRECTIONAL_SHAPES = ['request', 'response', 'assign', 'result'] as const;

/**
 * Returns true if a shape expects a reply
 */
export function expectsReply(shape: MessageShape): boolean {
  return shape === 'request' || shape === 'assign';
}

/**
 * Returns true if a shape IS a reply
 */
export function isReply(shape: MessageShape): boolean {
  return shape === 'response' || shape === 'result';
}

/**
 * Returns the expected reply shape for a given outbound shape
 */
export function replyShape(shape: MessageShape): MessageShape | null {
  switch (shape) {
    case 'request': return 'response';
    case 'assign': return 'result';
    default: return null;
  }
}
