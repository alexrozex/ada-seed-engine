/**
 * depth-weight.ts — Constraint C14: Prevention Must Cost Less Than Failure
 *
 * The depth weight determines whether adding an infrastructure agent
 * is justified. When the weight drops below threshold, recursion stops
 * and the residual risk is logged.
 *
 * weight = (impact × probability) / cost
 * If weight > threshold → add the agent
 * If weight < threshold → accept the risk
 * If weight ≈ threshold → flag for human decision
 */

import { CompletenessViolation } from './completeness.js';

// ─── Weight Calculation ────────────────────────────────────────────────

export interface WeightFactors {
  impact: number;       // 0-10: estimated damage if failure occurs
  probability: number;  // 0-1: likelihood of failure without prevention
  cost: number;         // estimated token/complexity/governance cost of prevention
}

export interface WeightResult {
  weight: number;
  justified: boolean;
  factors: WeightFactors;
  recommendation: 'add' | 'skip' | 'human_review';
}

/**
 * Calculate the depth weight for a proposed infrastructure addition.
 *
 * Severity mapping:
 *   critical → impact 9, probability 0.9
 *   high     → impact 7, probability 0.7
 *   medium   → impact 5, probability 0.5
 *   low      → impact 3, probability 0.3
 */
export function calculateWeight(
  violation: CompletenessViolation,
  depth: number,
  threshold: number = 1.0,
): WeightResult {
  // Base factors from severity
  const severityFactors: Record<string, { impact: number; probability: number }> = {
    critical: { impact: 9, probability: 0.9 },
    high:     { impact: 7, probability: 0.7 },
    medium:   { impact: 5, probability: 0.5 },
    low:      { impact: 3, probability: 0.3 },
  };

  const base = severityFactors[violation.severity] ?? { impact: 5, probability: 0.5 };

  // Cost increases with depth (deeper infrastructure costs more to maintain)
  // Base cost of an agent: ~100 tokens/heartbeat + governance overhead
  // Each depth level roughly doubles the overhead
  const depthMultiplier = Math.pow(1.5, depth);
  const baseCost = 1.0; // normalized base cost
  const cost = baseCost * depthMultiplier;

  // Impact decreases slightly with depth (deeper failures are less directly harmful)
  const adjustedImpact = base.impact * Math.pow(0.85, depth);

  // Probability stays roughly constant (failure modes don't change with depth)
  const adjustedProbability = base.probability;

  const factors: WeightFactors = {
    impact: adjustedImpact,
    probability: adjustedProbability,
    cost,
  };

  const weight = (adjustedImpact * adjustedProbability) / cost;

  // Determine recommendation
  const margin = 0.15; // 15% margin around threshold for human review
  let recommendation: 'add' | 'skip' | 'human_review';

  if (weight > threshold * (1 + margin)) {
    recommendation = 'add';
  } else if (weight < threshold * (1 - margin)) {
    recommendation = 'skip';
  } else {
    recommendation = 'human_review';
  }

  return {
    weight,
    justified: weight > threshold,
    factors,
    recommendation,
  };
}

// ─── Accepted Risk ─────────────────────────────────────────────────────

export interface AcceptedRisk {
  constraint: string;
  agent_id: string;
  description: string;
  weight: number;
  depth: number;
  mitigation: string;
}

/**
 * Create an accepted risk entry when C14 says "don't add this agent"
 */
export function createAcceptedRisk(
  violation: CompletenessViolation,
  weightResult: WeightResult,
  depth: number,
): AcceptedRisk {
  return {
    constraint: violation.constraint,
    agent_id: violation.agent_id,
    description: violation.description,
    weight: weightResult.weight,
    depth,
    mitigation: `Weight ${weightResult.weight.toFixed(2)} below threshold. ${violation.resolution_hint}. Consider human review of this risk domain.`,
  };
}

// ─── Threshold Presets ─────────────────────────────────────────────────

export const THRESHOLD_PRESETS = {
  /** Maximum infrastructure. ~$5000+ architectures. */
  aggressive: 0.3,
  /** Balanced cost/reliability. ~$500-1000 architectures. */
  moderate: 1.0,
  /** Minimal infrastructure. ~$50-100 architectures. */
  conservative: 3.0,
  /** Leaf agents only. No infrastructure. ~$20 architectures. */
  minimal: 100.0,
} as const;

export type ThresholdPreset = keyof typeof THRESHOLD_PRESETS;
