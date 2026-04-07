/**
 * intent-parser.ts — Stage 1: Parse natural language into structured intent
 *
 * This is the first LLM call in the compilation pipeline.
 * Raw intent in, structured extraction out.
 */

import { z } from "zod";

// ─── Structured Intent ─────────────────────────────────────────────────

export const StructuredIntent = z.object({
  objective: z
    .string()
    .describe("What the system should do, in operational terms"),
  entities: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        attributes: z.record(z.string()),
      }),
    )
    .describe("Named entities in the intent"),
  constraints: z
    .array(z.string())
    .describe("Explicit constraints from the intent"),
  implied_domains: z
    .array(z.string())
    .describe("Functional domains implied by the objective"),
  scale: z.string().optional().describe("Scale indicators if present"),
  channels: z
    .array(z.string())
    .optional()
    .describe("Communication channels mentioned"),
});
export type StructuredIntent = z.infer<typeof StructuredIntent>;

/**
 * Build the prompt for intent parsing.
 * The LLM extracts structure from natural language.
 */
export function buildIntentParsePrompt(
  intent: string,
  additionalConstraints?: string[],
): string {
  const constraintBlock = additionalConstraints?.length
    ? `\nAdditional constraints provided:\n${additionalConstraints.map((c) => `- ${c}`).join("\n")}`
    : "";

  return `You are an intent parser for an agent compilation system.

Given a natural language description of what someone wants automated, extract the following structure.

INTENT: "${intent}"${constraintBlock}

Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "objective": "string — what the system should do, in operational terms",
  "entities": [{"name": "string", "type": "string", "attributes": {"key": "value"}}],
  "constraints": ["explicit constraints from the intent"],
  "implied_domains": ["functional domains implied by the objective"],
  "scale": "scale indicators if present, or null",
  "channels": ["communication channels mentioned, or empty"]
}

Rules:
- Extract ONLY what is stated or directly implied. Do not invent.
- Constraints are things the system MUST or MUST NOT do.
- Implied domains are functional areas needed to achieve the objective.
- Be precise. Each domain should be a distinct functional area.`;
}

/**
 * Parse the LLM response into a StructuredIntent.
 */
export function parseIntentResponse(response: string): StructuredIntent {
  const cleaned = response
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error(
        `Intent parser: LLM returned invalid JSON.\nResponse: ${cleaned.slice(0, 200)}`,
      );
    parsed = JSON.parse(match[0]);
  }
  return StructuredIntent.parse(parsed);
}
