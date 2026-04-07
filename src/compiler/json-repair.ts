/**
 * json-repair.ts — Robust JSON extraction from LLM responses
 *
 * LLMs (especially non-Claude models) sometimes return:
 * - JSON wrapped in markdown code fences
 * - JSON with trailing commas
 * - JSON with comments
 * - JSON preceded/followed by explanation text
 * - JSON with unescaped control characters in strings
 */

/**
 * Extract and parse JSON from an LLM response string.
 * Tries multiple strategies in order of strictness.
 */
export function extractJson<T>(
  response: string,
  validator: (data: unknown) => T,
  context: string,
): T {
  // Strategy 1: Clean and parse directly
  const cleaned = response
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const parsed =
    tryParse(cleaned) ?? tryExtractObject(cleaned) ?? tryRepair(cleaned);

  if (parsed === null) {
    throw new Error(
      `${context}: Could not extract valid JSON from LLM response.\n` +
        `First 300 chars: ${cleaned.slice(0, 300)}`,
    );
  }

  return validator(parsed);
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryExtractObject(text: string): unknown | null {
  // Find the outermost { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = text.slice(start, end + 1);
  return tryParse(candidate) ?? tryRepair(candidate);
}

function tryRepair(text: string): unknown | null {
  let repaired = text;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([\]}])/g, "$1");

  // Remove single-line comments
  repaired = repaired.replace(/\/\/[^\n]*/g, "");

  // Remove multi-line comments
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, "");

  // Replace single quotes with double quotes (only outside existing double-quoted strings)
  // This is a rough heuristic — works for simple cases
  repaired = repaired.replace(/(?<![\\"])'([^']*)'(?![\\"])/g, '"$1"');

  // Remove control characters that break JSON (except \n \r \t)
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  return tryParse(repaired);
}
