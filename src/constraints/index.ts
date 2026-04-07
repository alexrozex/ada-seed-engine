/**
 * constraints/index.ts — The Fourteen Constraints
 *
 * Validity (C1-C8): Is this well-formed?
 * Completeness (C9-C13): Will this survive?
 * Depth Weight (C14): Should we add more?
 */

export {
  checkIdentityUniqueness,
  checkContractCompleteness,
  checkInterfaceCompatibility,
  checkStateIsolation,
  checkAuthorityMonotonicity,
  checkSupervisionCompleteness,
  checkLifecycleGovernance,
  checkBoundedDelegation,
  checkValidity,
} from './validity.js';
export type { Violation, ValidationResult } from './validity.js';

export {
  checkMonitoring,
  checkGovernance,
  checkKnowledgeFreshness,
  checkFailureHandling,
  checkQualityEvaluation,
  checkCompleteness,
} from './completeness.js';
export type { CompletenessViolation, CompletenessResult } from './completeness.js';

export {
  calculateWeight,
  createAcceptedRisk,
  THRESHOLD_PRESETS,
} from './depth-weight.js';
export type { WeightFactors, WeightResult, AcceptedRisk, ThresholdPreset } from './depth-weight.js';
