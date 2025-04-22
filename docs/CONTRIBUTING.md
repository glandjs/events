# Contributing to @glandjs/events

Thank you for your interest in contributing to **@glandjs/events**! This package is the core event broker used by Gland and is designed to be fast, lightweight, and dependency‑free. Your contributions help us improve performance, add new features, and ensure reliability.

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
  - [Coding Guidelines](#coding-guidelines)
  - [Commit Message Format](#commit-message-format)
  - [Thank You](#thank-you)

---

## Code of Conduct

This project adheres to the [Contributor Covenant](https://www.contributor-covenant.org/). Please ensure you read and follow the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## Getting Started

### Prerequisites

- **Node.js** v14 or higher
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
   npm install
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
3. Run all tests and ensure they pass:
   ```bash
   npm test
   ```
4. Commit your changes with a clear message (see [Commit Message Format](#commit-message-format)).
5. Push your branch and open a PR against `main`.

_PR Checklist:_

- Tests for new behavior
- Linting passes (`npm run lint`)
- Documentation updated if needed
- Code aligns with event-driven design

---

## Development Setup

- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Test:** `npm test`
- **Type-check:** `npm run typecheck`

---

## Coding Guidelines

- **Event-Driven First**: Ensure any new API or feature respects EDS principles.
- **Performance**: Keep overhead minimal and avoid blocking operations.
- **No External Dependencies**: The package must remain dependency-free.
- **TypeScript**: Fully typed, no `any` unless absolutely necessary.
- **Tests**: Cover edge cases and error scenarios.

---

## Commit Message Format

Use conventional commits:

```
<type>(<scope>): <short summary>

<body>

<footer>
```

**Types:**

- `feat`: new feature
- `fix`: bug fix
- `perf`: performance improvement
- `refactor`: code change without feature or fix
- `test`: adding or updating tests
- `docs`: documentation only
- `chore`: maintenance tasks

**Example:**

```
perf(broker): reduce listener lookup overhead
```

---

## Thank You

We appreciate your time and effort! Your contributions help make **@glandjs/events** the best it can be. Happy coding! 🚀
