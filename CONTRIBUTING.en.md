# Contributing

> Korean original: [CONTRIBUTING.md](CONTRIBUTING.md). If this translation falls out of sync, the Korean version is canonical.

Thanks for your interest in Byeorim. This document explains where to start and how to send a pull request. Everything from a typo fix to a new domain catalog is welcome.

## Read these two documents first

Byeorim is not just a pile of code. It is a set of promises. Two documents explain those promises.

- [MANIFESTO](docs/MANIFESTO.md): why Byeorim exists and who it serves
- [CLAUDE.md](CLAUDE.md): the rules to follow when touching code or docs

CLAUDE.md is named after Claude Code, the tool the maintainer pairs with, but the promises inside (red lines, testing policy, worklog/ADR requirements, writing rules) apply to every contributor. It does not matter whether you use a different AI tool or write code by hand.

A short read here saves a rejected PR later.

## Development setup

```bash
git clone https://github.com/jinikjang88/byeorim.git
cd byeorim
npm install
npm test
```

- Node.js 18 or higher
- All tests must pass before you start. If they do not, suspect your environment first. We do not merge code with broken tests on main.

Common commands.

| Command | What it does |
|---------|--------------|
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | End-to-end tests (slower) |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier auto-format |
| `npm run format:check` | Report formatting violations only (used in CI) |

## What you can contribute

Three main tracks.

### Bug reports and fixes

Found a reproducible bug? Open one at [GitHub Issues](https://github.com/jinikjang88/byeorim/issues). The following details speed up triage.

- The command you ran
- What you expected
- What you got
- Node.js version and OS

A fix PR alongside the report is welcome. Reference the issue number in the PR body.

### Feature proposals

If you want to propose a new command, a new dependency type, or a new validation track, open an issue first. PRs that arrive without prior discussion may be closed. Byeorim's first promise is "no code before design," and external contributions follow the same rule.

In the issue, describe.

- Which user (priority 1: non-technical founder, priority 2: new-domain developer, priority 3: senior developer) faces what problem
- The approach you have in mind
- Where it fits in the seven-step metaphor (prospect / smelt / shape / forge / temper / set / inspect)
- Whether the change requires an ADR (see [CLAUDE.md section 6](CLAUDE.md))

Once the maintainer agrees on the approach, then write the code.

### Catalog evolution

Adding or refining a domain catalog under `packages/templates/` (e.g., commerce, reservation) is welcome. Catalogs are data, not code, so they rarely need an ADR. The exception is introducing a new dependency type beyond `requires` / `affects`. That needs an ADR.

When you add a new domain catalog, leave an evolution note in `docs/catalog-evolution/`. Six months from now, someone should be able to trace why a particular block exists and why a particular dependency is wired the way it is.

### Documentation polish

Typo fixes, sentence cleanup, and added examples can go straight to a PR without an issue. Just follow the writing rules in [CLAUDE.md section 10](CLAUDE.md). Avoid in-line bold/italic emphasis, em dashes, arrow-style flow diagrams, and marketing-style closings.

## PR flow

1. Pick an issue to work on. Tiny fixes (typos, etc.) can skip this step.
2. Fork and branch off. Branch names are free-form but should signal intent (e.g., `fix-smelt-import-edge-case`, `add-reservation-template`).
3. Write the code. Tests live in the same PR. There is no "tests later."
4. If the change moves architecture, add an ADR at `docs/decisions/NNNN-slug.md`. See [CLAUDE.md section 6](CLAUDE.md) for what counts.
5. Add a worklog entry at `docs/worklog/YYYY-MM-DD.md`. Template is in [CLAUDE.md section 5](CLAUDE.md).
6. Open the PR. In the body, link the issue, summarize what changed, and call out anything still open.

## Merge checklist

A PR merges when all of the following are true.

- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test` passes
- [ ] New code ships with tests (unit, plus integration where applicable)
- [ ] Coverage does not drop (core/catalog 90%+, cli/ai 70%+)
- [ ] An ADR is included if the decision needs one
- [ ] A worklog entry is included
- [ ] No red line in [CLAUDE.md section 2](CLAUDE.md) is crossed
- [ ] CLI output is in Korean and readable by a non-technical user (English stack traces are not exposed raw)

The maintainer reviews directly. Reviews can take a few days. Please bear with the single-maintainer pace.

## Code style

Full rules are in [CLAUDE.md section 8](CLAUDE.md). The points external contributors hit most often.

- ESM modules only. No CommonJS.
- Domain function names come from the seven-step metaphor (`smelt()` over `extract()`)
- Match the patterns of existing functions in the same package (argument order, return shape, error handling)
- One responsibility per file when possible
- Do not hard-code catalog-specific IDs (e.g., commerce's `coupon`, `payment`) into core code. The first-priority user is not a commerce-domain person, and the code should not assume otherwise.
- Korean comments in domain logic are welcome. They sit naturally next to Korean domain terms.

## First-time contributors

Issues tagged `good first issue` are the place to start. Walking through one small contribution makes the next PR much lighter.

Asking questions is not embarrassing. It is honest. If you get stuck, comment on the issue or open a new one. "Is this the right approach?" is a far better question than committing on a wrong assumption. CLAUDE.md section 7 says the same to AI contributors.

## Code of Conduct

Every space in this repository follows the [Code of Conduct](CODE_OF_CONDUCT.en.md). Someone who has never written code and a ten-year senior engineer should both feel safe asking a question in the same issue thread.

## License

Byeorim is [MIT-licensed](LICENSE). Contributions are released under the same license.
