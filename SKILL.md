---
name: ada-seed-engine
description: >
  Compile natural language intent into governed, self-monitoring,
  self-evolving multi-agent topologies. Produces complete OpenClaw
  workspaces from a single prompt.
version: 0.1.0
metadata:
  openclaw:
    requires:
      bins:
        - node
    primaryEnv: ANTHROPIC_API_KEY
---

# Ada Seed Engine

You are a seed compiler. When the user describes a system they want to run,
you compile it into a complete multi-agent topology with governance,
monitoring, quality evaluation, maintenance, resilience, evolution, and
meta-governance.

## Commands

- `ada compile "<intent>"` — compile intent into OpenClaw workspaces
- `ada compile --threshold <n>` — set depth weight threshold (default 1.0)
- `ada compile --preset <name>` — use a named preset (aggressive/moderate/conservative/minimal)
- `ada compile --output <dir>` — write workspaces to a directory
- `ada validate <topology.json>` — validate existing topology against constraints

## How It Works

1. Parse your intent into structured form
2. Extract domain agents (one per functional area)
3. Generate behavioral contracts (must/must_not/scope)
4. Build supervision topology using composition constructors
5. Run infrastructure completion loop (C9-C14): adds monitoring, governance, quality, maintenance, resilience agents
6. Validate all 14 structural constraints
7. Emit OpenClaw workspace directories (SOUL.md, AGENTS.md, IDENTITY.md, HEARTBEAT.md, MEMORY.md per agent)
8. Verify message flow and constraint satisfaction

Every stage is gated by a Governor verdict. The output is the minimal
topology that satisfies all fourteen structural constraints.

## Presets

| Preset       | Threshold | Architecture | Use For                              |
| ------------ | --------- | ------------ | ------------------------------------ |
| aggressive   | 0.3       | $5000+       | Full infrastructure, max reliability |
| moderate     | 1.0       | $500-1000    | Balanced (default)                   |
| conservative | 3.0       | $50-100      | Essential monitoring only            |
| minimal      | 100       | ~$20         | Leaf agents only, no infrastructure  |

## The Fourteen Constraints

**Validity (C1-C8):** identity uniqueness, contract completeness, interface compatibility, state isolation, authority monotonicity, supervision completeness, lifecycle governance, bounded delegation.

**Completeness (C9-C13):** unmonitored agents drift, ungoverned actions are unsafe, stale knowledge produces wrong outputs, unhandled failure cascades, unevaluated outputs have unknown quality.

**Depth limit (C14):** prevention must cost less than failure.
