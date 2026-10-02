# Contributing to @glandjs/events

Thank you for your interest in contributing to **@glandjs/events**! This package is the core event broker used by Gland and is designed to be fast, lightweight, and transport-agnostic. Your contributions help us improve performance, add new features, and ensure reliability.

---

## Table of Contents

- [Contributing to @glandjs/events](#contributing-to-glandjsevents)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Reporting Issues](#reporting-issues)
  - [Feature Requests](#feature-requests)
  - [Submitting Pull Requests](#submitting-pull-requests)
  - [Development Setup](#development-setup)
  - [Testing Guidelines](#testing-guidelines)
  - [Coding Guidelines](#coding-guidelines)
  - [Commit Message Format](#commit-message-format)
  - [Thank You](#thank-you)

---

## Code of Conduct

This project adheres to the [Contributor Covenant](https://www.contributor-covenant.org/). Please ensure you read and follow the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## Getting Started

### Prerequisites

- **Bun** v1.0 or higher — the test runner and local script runner
- **Node.js** v18 or higher — only to run against a built `dist/`; the package itself targets Node 18+, Bun, Deno and browsers
- **Git** for version control
- **TypeScript** knowledge (project is written in TS)

### Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/glandjs/events.git
   cd events
   ```
2. Install dependencies:
   ```bash
   bun install
   ```

---

## Reporting Issues

If you find a bug or unexpected behavior:

1. Search existing issues to avoid duplicates.
2. Open a new issue with:
   - A clear title and description
   - Steps to reproduce
   - Expected vs. actual behavior
   - Environment details (Node.js version, OS, etc.)

_Note:_ For general questions, use [Stack Overflow](https://stackoverflow.com) with the `glandjs` tag.

---

## Feature Requests

1. Open an issue describing the feature and its use case.
2. Discuss on the issue thread to refine the proposal.
3. If approved, implement it in a PR following the guidelines below.

---

## Submitting Pull Requests

1. Fork the repository and create a branch:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes in code and tests.
3. Run the full check — typecheck, tests and formatting — before pushing:
   ```bash
   bun run verify
   ```
4. Commit your changes with a clear message (see [Commit Message Format](#commit-message-format)).
5. Push your branch and open a PR against `main`.

_PR Checklist:_

- Tests for new behavior
- `bun run verify` passes
- Documentation updated if needed
- Code aligns with event-driven design

---

## Development Setup

| Command                    | Does                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `bun run typecheck`        | `tsc --noEmit` over `src/`                                    |
| `bun run test`             | Full suite                                                    |
| `bun run test:unit`        | Unit tests only                                               |
| `bun run test:integration` | Integration tests only                                        |
| `bun run coverage`         | Full suite with coverage                                      |
| `bun run format`           | Write formatting                                              |
| `bun run format:check`     | Check formatting                                              |
| `bun run verify`           | typecheck + test + format:check — **run this before pushing** |
| `bun run build`            | Compile to `dist/` with declarations                          |

Type-checking the tests, including the unused-variable and override rules, uses a
separate project config:

```bash
npx tsc -p tsconfig.test.json --noEmit
```

---

## Testing Guidelines

- Tests live in `tests/unit` and `tests/integration`, named `*.spec.ts`.
- Use `BrokerFactory` from `tests/helpers.ts` to create brokers. It registers each
  one for teardown, so a forgotten `shutdown()` cannot leak an armed timer and
  keep the test process alive.
- A broker holds a listener registry, a connection graph and possibly armed
  timers, so never construct one directly in a test without the factory.
- Watchers reject on timeout. Attach a rejection handler in the same tick as the
  `watch()` call — attaching one later is itself reported as an unhandled
  rejection. Use the `capture` helper the existing suites use.

---

## Coding Guidelines

- **Event-Driven First**: Ensure any new API or feature respects EDS principles.
- **Performance**: Keep overhead minimal and avoid blocking operations.
- **Minimal Dependencies**: The package has exactly one runtime dependency,
  `@glandjs/emitter`. Adding another needs a strong reason.
- **TypeScript**: Fully typed, no `any` unless absolutely necessary.
- **Tests**: Cover edge cases and error scenarios. Aim to keep line and function
  coverage of `src/` at 100% — it is currently there, and the suite is small
  enough that it should stay there.
- **Comment the why**: Comments should explain a non-obvious constraint or a
  decision, not restate the line below them.

---

## Commit Message Format

Please follow our [commit message guidelines](./COMMIT_GUIDE.md) based on Conventional Commits.

Following a consistent commit format helps with changelogs, automation, and code readability.

---

## Thank You

We appreciate your time and effort! Your contributions help make **@glandjs/events** the best it can be. Happy coding! 🚀
