# Repository Guidelines

## Project Structure & Module Organization
- `docs/`: core design docs and SOPs (`docs/sops/*.md`) that define operational workflow.
- `decisions/`: ADR-style decision records (`0001-*.md` onward).
- `projects/`: active project workspaces (for example `projects/akari/`), with `README.md`, `TASKS.md`, and patterns/plans.
- `infra/scheduler/`: TypeScript scheduler and local control API (`src/*.ts`, tests in colocated `*.test.ts`).
- `infra/budget-verify/`, `infra/experiment-validator/`, `infra/experiment-runner/`: Python tooling for budget checks, validation, and experiment execution.
- `examples/`: starter project scaffold.

## Build, Test, and Development Commands
- Scheduler (TypeScript):
  - `cd infra/scheduler && npm install && npm run build` - install deps and compile to `dist/`.
  - `cd infra/scheduler && npm test` - run Vitest suite.
  - `cd infra/scheduler && npm run test:watch` - watch mode for local development.
- Experiment validator:
  - `cd infra/experiment-validator && pixi run validate ../../projects/<project>` - validate project records.
  - `cd infra/experiment-validator && pixi run test` - run validator tests.
- Budget tools:
  - `cd infra/budget-verify && pixi run budget-status` - show budget dashboard.
  - `cd infra/budget-verify && pixi run verify -- ../../projects/<project>` - reconcile ledger vs evidence.
- Experiment runner tests:
  - `cd infra/experiment-runner && python -m pytest -v`.

## Coding Style & Naming Conventions
- TypeScript uses ESM, double quotes, semicolons, and 2-space indentation (match `infra/scheduler/src/*.ts`).
- Python uses 4-space indentation and snake_case; keep modules focused and script-friendly.
- Test files are colocated and named by target: `foo.ts` -> `foo.test.ts`; Python tests use `test_*.py`.
- Keep docs and records in Markdown, with explicit paths and reproducible command examples.

## Testing Guidelines
- Follow TDD for `infra/` changes (`docs/sops/tdd-workflow.md`): write/confirm failing test, implement, then run full suite.
- Minimum expectation before commit:
  - `pixi run validate`
  - `cd infra/scheduler && npm test` for scheduler changes
  - Relevant Python test command when touching Python infra.

## Commit & Pull Request Guidelines
- Repo history is currently sparse (`Initial commit`), so use the enforced SOP convention in `docs/sops/commit-workflow.md`.
- Commit format: `type: imperative summary` (e.g., `feat: add budget precheck`), with types such as `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- Keep subject lines under 72 chars and combine task work + task-marking/log updates in one logical commit.
- For PRs, include: purpose, touched paths, validation commands/results, and linked issue/task. If change affects governance/resource gates, add/update `APPROVAL_QUEUE.md` first.
