<p align="center">
  <img src="logo.svg" width="120" alt="Motherlabs" />
</p>

<h1 align="center">Ada Seed Engine</h1>

<p align="center">
Compile natural language intent into governed, self-monitoring multi-agent topologies for OpenClaw.<br/>
One prompt in. Running agent city out.
</p>

<p align="center">
  <a href="https://github.com/alexrozex/ada-seed-engine">GitHub</a> &middot; by <a href="https://motherlabs.ai">Motherlabs</a>
</p>

## What It Does

```
"Run walk-in barbershop operations for West Side Barbers in Kelowna"
                                    |
                            Ada Seed Engine
                                    |
                    9 governed agents, 2 levels deep
                    SOUL.md + AGENTS.md per agent
                    topology.json + governance.json
                    $0.47 compilation cost
```

The compiler takes natural language intent and produces a complete OpenClaw multi-agent workspace:

- **Domain agents** derived from your intent (one agent per functional area)
- **Infrastructure agents** derived from 14 structural constraints (monitoring, governance, quality, maintenance, resilience)
- **Behavioral contracts** for every agent (must/must_not/scope)
- **Supervision topology** using four composition constructors (pipe, parallel, supervise, delegate)
- **Governance membrane** with invariants, escalation targets, and governor checks

## Install

```bash
npm install ada-seed-engine
```

## Usage

### As a library

```typescript
import { compile } from "ada-seed-engine";

const result = await compile("Run walk-in barbershop operations", {
  threshold: 1.0,
  llm: async (prompt, model) => {
    // Your Anthropic API call here
    return response;
  },
});

// result.topology — the agent graph
// result.system.workspaces — emitted OpenClaw files
// result.acceptedRisks — violations the compiler chose not to resolve
// result.provenance — full compilation trace
```

### As CLI

```bash
ada compile "Run walk-in barbershop operations for West Side Barbers"
ada compile --preset aggressive "Full-scale content agency with 50 clients"
ada compile --output ./workspaces "Simple daily standup bot"
ada validate topology.json
```

### Presets

| Preset         | Threshold | Architecture                     |
| -------------- | --------- | -------------------------------- |
| `aggressive`   | 0.3       | Maximum infrastructure (~$5000+) |
| `moderate`     | 1.0       | Balanced (default, ~$500-1000)   |
| `conservative` | 3.0       | Essential monitoring (~$50-100)  |
| `minimal`      | 100       | Leaf agents only (~$20)          |

## Architecture

Built on GEOMETRY.md — a formal specification derived from first principles.

### The Universal Coupling Surface

Every interaction in the system flows through **typed messages** with five shapes:

1. **Request/Response** — asking, getting answers (verdict, state query, heartbeat, compilation)
2. **Assign/Result** — directing work, receiving outcomes
3. **Signal** — one-way notifications (escalation, health alert, environment change)
4. **Lifecycle** — agent existence changes (spawn, ready, kill, dead)
5. **Record** — append-only storage (audit entries, knowledge updates)

### Agent Primitives

Every agent has exactly five components:

- **Identity** — who it is (unique, immutable)
- **Contract** — what it must/must not do (behavioral bounds)
- **Interface** — what messages it accepts/emits
- **State** — what it remembers (private, owned)
- **Lifecycle** — how it's born, changes, and dies

### Composition Constructors

Four operators build every topology:

- `pipe(A, B)` — A's output feeds B's input
- `parallel(A, B)` — concurrent, sync at join
- `supervise(A, B)` — A monitors and directs B
- `delegate(A, B, scope)` — bounded authority transfer

### The Fourteen Constraints

**Validity (compile-time, C1-C8):**
C1: Identity uniqueness. C2: Contract completeness. C3: Interface compatibility. C4: State isolation. C5: Authority monotonicity. C6: Supervision completeness. C7: Lifecycle governance. C8: Bounded delegation.

**Completeness (post-domain, C9-C13):**
C9: Unmonitored agents drift. C10: Ungoverned actions are unsafe. C11: Stale knowledge produces wrong outputs. C12: Unhandled failure cascades. C13: Unevaluated outputs have unknown quality.

**Depth limit (C14):**
Prevention must cost less than failure. This constraint makes the compiler self-limiting — it stops adding infrastructure when the cost exceeds the benefit.

## Output

For each agent:

- `SOUL.md` — identity + behavioral contract
- `AGENTS.md` — operating instructions, message interface, supervision
- `IDENTITY.md` — creation metadata and lineage
- `HEARTBEAT.md` — periodic tasks and specialization monitoring
- `MEMORY.md` — state domains and persistence config

System-level:

- `topology.json` — agent graph with routes
- `governance.json` — invariants, escalation config, governor checks
- `provenance.json` — full compilation trace (stages, tokens, cost, decisions)

## Development

```bash
npm install
npm test          # 158 tests
npm run build     # TypeScript compilation
npm run check     # Type checking
```

## License

MIT — Motherlabs
