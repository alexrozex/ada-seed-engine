/**
 * ada.ts — CLI Entry Point
 *
 * Usage:
 *   ada compile "Run walk-in barbershop operations for West Side Barbers"
 *   ada compile --threshold 0.3 "Full-scale content agency"
 *   ada compile --output ./workspaces "intent"
 *   ada validate topology.json
 *
 * The ◈ diamond mark identifies Ada output.
 */

import { compile } from "../compiler/compile.js";
import type { LlmCaller, CompilationResult } from "../compiler/compile.js";
import { verify } from "../compiler/verifier.js";
import { THRESHOLD_PRESETS } from "../constraints/index.js";
import type { ThresholdPreset } from "../constraints/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── ANSI Colors ───────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GOLD = "\x1b[38;2;196;168;130m"; // #c4a882
const CREAM = "\x1b[38;2;232;228;223m"; // #e8e4df
const SAGE = "\x1b[38;2;120;140;93m"; // #788c5d
const CRAIL = "\x1b[38;2;217;119;87m"; // #d97757
const CLAY = "\x1b[38;2;160;64;64m"; // #a04040
const ICE = "\x1b[38;2;106;155;204m"; // #6a9bcc

// ─── Output Helpers ────────────────────────────────────────────────────

function stage(name: string, status: "running" | "pass" | "fail"): string {
  const icon =
    status === "running"
      ? `${DIM}…${RESET}`
      : status === "pass"
        ? `${SAGE}✓${RESET}`
        : `${CLAY}✗${RESET}`;
  return `  ${name.padEnd(45)} ${icon}`;
}

function header(): string {
  return `\n${GOLD}◈${RESET} ${BOLD}Ada Seed Engine${RESET} ${DIM}v0.1.0${RESET}\n`;
}

// ─── CLI Argument Parsing ──────────────────────────────────────────────

interface CliArgs {
  command: "compile" | "validate" | "help";
  intent?: string;
  threshold: number;
  preset?: ThresholdPreset;
  constraints: string[];
  file?: string;
  output?: string;
  escalationTarget?: string;
  escalationChannel?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script
  const result: CliArgs = {
    command: "help",
    threshold: 1.0,
    constraints: [],
  };

  if (args.length === 0) return result;

  const command = args[0];
  if (command === "compile") {
    result.command = "compile";
  } else if (command === "validate") {
    result.command = "validate";
  } else {
    result.command = "help";
    return result;
  }

  let i = 1;
  while (i < args.length) {
    if (args[i] === "--threshold" && args[i + 1]) {
      const val = parseFloat(args[i + 1]);
      if (!isNaN(val)) result.threshold = val;
      i += 2;
    } else if (args[i] === "--preset" && args[i + 1]) {
      const preset = args[i + 1] as ThresholdPreset;
      if (preset in THRESHOLD_PRESETS) {
        result.preset = preset;
        result.threshold = THRESHOLD_PRESETS[preset];
      }
      i += 2;
    } else if (args[i] === "--constraint" && args[i + 1]) {
      result.constraints.push(args[i + 1]);
      i += 2;
    } else if (args[i] === "--file" && args[i + 1]) {
      result.file = args[i + 1];
      i += 2;
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[i + 1];
      i += 2;
    } else if (args[i] === "--escalation-target" && args[i + 1]) {
      result.escalationTarget = args[i + 1];
      i += 2;
    } else if (args[i] === "--escalation-channel" && args[i + 1]) {
      result.escalationChannel = args[i + 1];
      i += 2;
    } else {
      // Treat as intent or file path
      if (result.command === "compile") {
        result.intent = args[i];
      } else {
        result.file = args[i];
      }
      i++;
    }
  }

  return result;
}

// ─── Help Text ─────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(header());
  console.log(
    `${CREAM}Compile natural language intent into governed multi-agent topologies.${RESET}\n`,
  );
  console.log(`${BOLD}Usage:${RESET}`);
  console.log(
    `  ada compile "your intent here"          Compile intent into OpenClaw workspaces`,
  );
  console.log(
    `  ada compile --threshold 0.3 "intent"    Set depth weight threshold`,
  );
  console.log(
    `  ada compile --preset aggressive "intent" Use a preset threshold`,
  );
  console.log(
    `  ada compile --output ./out "intent"      Write workspaces to directory`,
  );
  console.log(
    `  ada validate topology.json               Validate an existing topology\n`,
  );
  console.log(`${BOLD}Presets:${RESET}`);
  console.log(
    `  aggressive   (0.3)  — Maximum infrastructure. ~$5000+ architectures.`,
  );
  console.log(
    `  moderate     (1.0)  — Balanced. ~$500-1000 architectures. ${DIM}(default)${RESET}`,
  );
  console.log(
    `  conservative (3.0)  — Minimal infrastructure. ~$50-100 architectures.`,
  );
  console.log(
    `  minimal      (100)  — Leaf agents only. ~$20 architectures.\n`,
  );
  console.log(`${BOLD}Options:${RESET}`);
  console.log(`  --threshold <n>            Override depth weight threshold`);
  console.log(`  --preset <name>            Use a named preset`);
  console.log(
    `  --constraint <text>        Add a constraint (can be repeated)`,
  );
  console.log(`  --output <dir>             Write workspaces to directory`);
  console.log(
    `  --escalation-target <name> Set escalation target (default: operator)`,
  );
  console.log(
    `  --escalation-channel <ch>  Set escalation channel (default: chat)\n`,
  );
}

// ─── Write Workspaces to Disk ──────────────────────────────────────────

function writeSystemToDisk(result: CompilationResult, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  for (const workspace of result.system.workspaces) {
    const wsDir = join(outputDir, workspace.agent_id);
    mkdirSync(wsDir, { recursive: true });
    for (const file of workspace.files) {
      writeFileSync(join(wsDir, file.path), file.content, "utf-8");
    }
  }

  writeFileSync(
    join(outputDir, "topology.json"),
    result.system.topology_json,
    "utf-8",
  );
  writeFileSync(
    join(outputDir, "governance.json"),
    result.system.governance_json,
    "utf-8",
  );
  writeFileSync(
    join(outputDir, "provenance.json"),
    result.system.provenance_json,
    "utf-8",
  );
}

// ─── Format Compilation Output ─────────────────────────────────────────

function formatResult(
  result: CompilationResult,
  _intent: string,
  outputDir?: string,
): string {
  const lines: string[] = [];

  lines.push("");

  // Summary
  const agentCount = result.topology.agents.length;
  const depth = result.topology.metadata.max_depth;
  const cost = result.provenance.estimated_cost.toFixed(2);
  const tokens = result.provenance.total_tokens;
  const timeMs = result.provenance.compilation_time_ms;
  const timeStr =
    timeMs > 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${timeMs}ms`;

  lines.push(
    `${BOLD}Compiled:${RESET} ${agentCount} agents, ${depth} levels deep`,
  );
  lines.push(
    `${BOLD}Cost:${RESET} $${cost} | ${BOLD}Tokens:${RESET} ${tokens.toLocaleString()} | ${BOLD}Time:${RESET} ${timeStr}`,
  );
  lines.push("");

  // Agent list
  lines.push(`${BOLD}Agents:${RESET}`);
  for (const agent of result.topology.agents) {
    const isInfra = agent.identity.lineage.includes(
      "infrastructure-completion",
    );
    const color = isInfra ? DIM : CREAM;
    const tag = isInfra ? ` ${DIM}(infra)${RESET}` : "";
    lines.push(`  ${color}${agent.identity.id}${RESET}${tag}`);
  }
  lines.push("");

  // Accepted risks
  if (result.acceptedRisks.length > 0) {
    lines.push(`${CRAIL}Accepted risks:${RESET}`);
    for (const risk of result.acceptedRisks) {
      lines.push(
        `  ${DIM}${risk.constraint}:${RESET} ${risk.description} ${DIM}(weight: ${risk.weight.toFixed(2)})${RESET}`,
      );
    }
    lines.push("");
  }

  // Verification
  if (result.validation.valid) {
    lines.push(
      `${SAGE}Validation: PASS${RESET} (${result.validation.violations.length} violations)`,
    );
  } else {
    lines.push(`${CLAY}Validation: FAIL${RESET}`);
    for (const v of result.validation.violations) {
      lines.push(`  ${CLAY}${v.constraint}:${RESET} ${v.description}`);
    }
  }

  // Output location
  if (outputDir) {
    lines.push("");
    lines.push(`${ICE}Workspaces:${RESET} ${outputDir}`);
  }

  return lines.join("\n");
}

// ─── Main ──────────────────────────────────────────────────────────────

export async function main(argv: string[], llm: LlmCaller): Promise<void> {
  const args = parseArgs(argv);

  if (args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "compile") {
    if (!args.intent) {
      console.log(`${CLAY}Error: No intent provided.${RESET}`);
      console.log(`Usage: ada compile "your intent here"`);
      return;
    }

    console.log(header());
    console.log(stage("Parsing intent...", "running"));

    try {
      const result = await compile(args.intent, {
        threshold: args.threshold,
        constraints: args.constraints,
        escalationTarget: args.escalationTarget,
        escalationChannel: args.escalationChannel,
        outputDir: args.output,
        llm,
      });

      // Print stage results from provenance
      for (const s of result.provenance.stages) {
        const status = s.governor === "ACCEPT" ? "pass" : "fail";
        console.log(
          stage(s.stage, status) + ` ${DIM}Governor ${s.governor}${RESET}`,
        );
      }

      // Run verification
      const verification = verify(result.topology);
      console.log(stage("Verification", verification.passed ? "pass" : "fail"));

      // Write to disk if output dir specified
      if (args.output) {
        writeSystemToDisk(result, args.output);
        console.log(stage("Write workspaces to disk", "pass"));
      }

      console.log(formatResult(result, args.intent, args.output));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`\n${CLAY}Compilation failed:${RESET} ${message}`);
    }
  }

  if (args.command === "validate") {
    if (!args.file) {
      console.log(`${CLAY}Error: No topology file provided.${RESET}`);
      console.log(`Usage: ada validate topology.json`);
      return;
    }

    console.log(header());

    try {
      const { readFileSync } = await import("node:fs");
      const raw = readFileSync(args.file, "utf-8");
      const data = JSON.parse(raw);

      // Basic validation — check the topology has the right shape
      if (!data.root || !data.agents || !data.routes) {
        console.log(
          `${CLAY}Invalid topology file: missing root, agents, or routes.${RESET}`,
        );
        return;
      }

      console.log(
        `${SAGE}Topology loaded:${RESET} ${Object.keys(data.agents).length} agents`,
      );
      console.log(`${SAGE}Root:${RESET} ${data.root}`);
      console.log(`${SAGE}Routes:${RESET} ${data.routes.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`\n${CLAY}Validation failed:${RESET} ${message}`);
    }
  }
}

// ─── Export for testing ────────────────────────────────────────────────

export { parseArgs, formatResult, writeSystemToDisk };
