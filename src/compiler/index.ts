/**
 * compiler/index.ts — Unified compiler export
 */

export { compile } from './compile.js';
export type { CompileOptions, CompilationResult, LlmCaller } from './compile.js';
export { emitAgentWorkspace, emitTopology } from './emitter.js';
export type { EmittedFile, EmittedWorkspace, EmittedSystem, GovernanceConfig, ProvenanceRecord } from './emitter.js';
export { buildIntentParsePrompt, parseIntentResponse } from './intent-parser.js';
export type { StructuredIntent } from './intent-parser.js';
export { buildAgentExtractionPrompt, parseAgentExtractionResponse } from './agent-extractor.js';
export type { AgentSpec, AgentExtractionResult } from './agent-extractor.js';
export { specToAgent, applyRefinement, buildContractRefinementPrompt, parseContractRefinement } from './contract-gen.js';
export { verify } from './verifier.js';
export type { VerificationResult, VerificationIssue } from './verifier.js';
