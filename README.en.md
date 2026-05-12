# Byeorim (벼림)

[![CI](https://github.com/jinikjang88/byeorim/actions/workflows/ci.yml/badge.svg)](https://github.com/jinikjang88/byeorim/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)

> Korean original: [README.md](README.md). If this translation falls out of sync, the Korean version is canonical.

Byeorim is a tool that helps people who want to build their own service with AI. Before turning a vague idea into code, it helps you see the shape of that service together. The AI asks like a careful colleague. It does not force answers. Questions you cannot answer go into a diary, and you move on together to the next step.

For the full background, see [docs/MANIFESTO.md](docs/MANIFESTO.md) (Korean).

## Who it serves

In priority order.

1. Domain experts such as cafe owners and tutoring center directors who have ideas and capital but cannot code
2. New-domain developers exploring an unfamiliar space who need a starting frame before locking in architecture
3. Senior developers who want to drive the CLI and YAML directly

Features that help group 3 while confusing groups 1 and 2 are rejected.

## Seven steps

Byeorim follows the blacksmith's seven steps. Each step rolls naturally into the next.

| Step | Korean | Command | What it does |
|------|--------|---------|---------|
| 0 | 탐광 (prospect) | `byeorim prospect` | Answer seven questions to sketch the service. The AI fetches a domain catalog (a set of blocks). |
| 1 | 제련 (smelt) | `byeorim smelt` | Pick the blocks you need from the catalog. The AI suggests fits. |
| 2 | 빚다 (shape) | `byeorim shape` | Decide four core choices: language, database, API style, code structure. |
| 3 | 단조 (forge) | `byeorim forge` | Define the API contract. The AI fills in input/output shapes. |
| 4 | 다듬 (temper) | `byeorim temper` | Decide what scenarios to verify. The AI fills in test code. |
| 5 | 세움 (set) | `byeorim set` | Generate the actual backend and frontend code. |
| 6 | 비춤 (inspect) | `byeorim inspect` | Inspect the result from six angles: security, performance, ops, scalability, legal, market. |

Aliases: `prs`, `sml`, `shp`, `frg`, `tmr`, `set`, `ins`.

Helper commands: `byeorim init`, `byeorim status`, `byeorim answer`, `byeorim run`, `byeorim verify`, and `byeorim <step> import-review` for round-tripping reviews from external AIs.

## Install

Clone the repo and install dependencies.

```bash
git clone https://github.com/jinikjang88/byeorim.git
cd byeorim
npm install
```

You can now run `node bin/byeorim.js <command>` directly.

To call `byeorim` from any directory, run a global install.

```bash
npm install -g .
```

This symlinks the cloned repo into the global path. If you move or delete the repo, `byeorim` goes with it. Publishing to the npm registry is deferred (see ADR 0059).

Verify.

```bash
byeorim --help
```

## Quick start

After install, run from your own project directory.

```bash
byeorim init
byeorim prospect
```

Prospect asks seven questions in order. Skip any question you cannot answer; it lands in `.byeorim/project/diary.md` and you can return to it later.

When prospect finishes, two artifacts appear.

- A catalog: the set of domain blocks (e.g., payment, refund, shipping)
- A reality-check report (`prospect-reality-check.md`): a six-angle market view covering saturation, entry cost, legal risk, and more

For a non-interactive single-line run.

```bash
node bin/byeorim.js prospect "neighborhood bakery loyalty ordering app"
```

## External AI review

Each step also produces a review prompt under `.byeorim/project/prompts/`. Paste the prompt into an external AI (Claude.ai, ChatGPT, Gemini, etc.) for a deeper review, then bring the response back with `import-review`.

```bash
node bin/byeorim.js smelt import-review ./response.md
node bin/byeorim.js shape import-review ./response.md
node bin/byeorim.js forge import-review ./response.md
node bin/byeorim.js temper import-review ./response.md
node bin/byeorim.js inspect import-review ./response.md
```

Each change asks "apply / skip / apply all" so a hallucinated suggestion never sneaks in.

## Running and verifying

After `set`, run both servers at once.

```bash
node bin/byeorim.js run
```

Backend and frontend logs appear with `[backend]` / `[frontend]` prefixes. Ctrl-C stops both.

For CI or pre-deploy checks.

```bash
node bin/byeorim.js verify          # install + tests
node bin/byeorim.js verify --smoke  # above + actually boot to confirm liveness
```

## AI adapter

Most steps call an AI. The default adapter is `mock`, so no network calls and no cost. Switch to Claude with environment variables.

| Variable | Value | What |
|----------|-------|------|
| `BYEORIM_AI_ADAPTER` | `mock` or `claude` | Which adapter to use |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key (direct path) |
| `ANTHROPIC_BASE_URL` | `http://localhost:3000` etc. | Route through a bridge tool instead of using a key directly |
| `BYEORIM_AI_MODEL` | `claude-opus-4-7` (default) | Override the model |

A full run typically costs less than one US dollar through the direct path. The bridge path lets users without an API key route through tools like Claude Code.

## Promises

- A free open-source prototype. No paid tiers, no gated features, no opt-out telemetry.
- Model-agnostic. The `.byeorim/` directory is readable by Claude, GPT, Gemini, or any future model.
- A global standard with Korean roots.

## Contributing and license

Byeorim is MIT-licensed. Korean is the canonical language for documentation; English versions sit alongside.

- [LICENSE](LICENSE): MIT license
- [CONTRIBUTING.en.md](CONTRIBUTING.en.md) ([Korean](CONTRIBUTING.md)): how to contribute
- [CODE_OF_CONDUCT.en.md](CODE_OF_CONDUCT.en.md) ([Korean](CODE_OF_CONDUCT.md)): code of conduct
- [SECURITY.en.md](SECURITY.en.md) ([Korean](SECURITY.md)): security policy

For decision history, see [docs/decisions/](docs/decisions/) (Korean ADRs).
