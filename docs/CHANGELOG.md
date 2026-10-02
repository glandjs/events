# Changelog

## [2.0.0] – 2026-10-02

A correctness release. Most of what changed here was already promised by the
documentation — this version makes the code match the docs, and removes a
signature that could not have worked.

The headline: **`send()` never carried a payload**, and **a channel's `watch()`
could never settle**. Both are fixed below, and both are breaking.

### Breaking changes

#### `send()` now takes a `payload`

`payload` is a required third argument. In 1.x it was absent from both the
signature and the forwarding call, so the target always received a literal
`null`.

```ts
// 1.x — payload was unreachable
broker.send('user:login', peer);

// 2.0.0
broker.send('user:login', peer, { id: 'u1' });
```

`payload` sits before `options`, so any existing three-argument call that was
passing `options` in that position must move it.

#### `BrokerChannel.watch()` now namespaces the event name

`user.watch('login')` used to watch the bare name `login` — an event a `user`
channel can never emit, because a channel only ever writes `user:login`. The
promise therefore always timed out. It now watches `user:login`, consistent with
every other method on the channel.

### Fixed

- **`EventEmitter.shutdown()` now removes listeners.** It previously shut down
  only the watcher, leaving every registration live.
- **`EventEmitter.off()` now updates the listener registry.** Removals were
  applied to the underlying emitter but not the bookkeeping, so `getListener()`
  kept reporting detached listeners and `maxListeners` never freed a slot.
- **`getListener()` no longer reaches into private fields** of
  `@glandjs/emitter` (`spliter`, `tree`). Those names are dependency-private and
  have already changed once; a dependency bump would have silently made
  `getListener` return zero listeners.
- **`defaultValue` is now tested with `!== undefined`** rather than truthiness, so
  `0`, `''`, `false` and `null` work as watcher fallbacks. Previously only a
  truthy value could be used.
- **`emit(..., { watch: true })` no longer produces an unhandled rejection** when
  the watcher it opens times out. The promise is not returned to the caller, so
  its failure is now swallowed deliberately.
- **`once(event, null)` outside watch mode now throws**, matching `on`, instead
  of silently registering nothing.
- **A `once` wrapper detaches before invoking the listener**, so a re-entrant
  emit inside the handler cannot run it a second time.
- **Event-trace dedup is now bounded.** Traces record a `visited` set per
  correlation id in a FIFO map capped at 4096 entries, so the map can no longer
  grow for the life of the process.
- **Automatic forwarding no longer loops.** `ConnectionOptions.events` is now
  routing state rather than a listener that re-emitted with a fresh id. Because
  it shares the original correlation id, the return leg is deduped away instead
  of ping-ponging between two brokers until the stack overflowed. It also no
  longer consumes listener slots — previously `connectTo` could throw on a
  broker with a tight `maxListeners` — and it correctly stops on `disconnect`.
- **`Broker.shutdown()` now clears the event-trace map**, so a reused correlation
  id is processed again after a restart.
- **`generateUUID` degrades instead of throwing.** A runtime that exposes
  `crypto.getRandomValues` but rejects the call now falls through to the
  `Math.random` tier instead of taking the broker down.
- **`EventWatcher` no longer writes a `console.warn` on timeout.** The rejection
  is the contract; a side-channel log line for an expected outcome was noise.

### Added

- **`BrokerChannel` and `EventWatcher` are now exported from the package root.**
  `BrokerChannel` was previously unreachable to consumers, despite being the
  documented way to own a namespace.
- **`BrokerConnection`** — the live link to a peer, plus the events it
  auto-forwards. Exported from the package root.
- **`CallStrategy`** — `type CallStrategy = 'all'`, extracted so the strategy
  argument is named rather than an inline literal.
- **`BrokerId`** moved into the shared type vocabulary alongside the other
  identifier types.
- **`Broker` now defaults its type parameter to `EventRecord`**, so an untyped
  `Broker` is usable where the mesh cannot know a node's event map in advance.
- **`EventWatcher.pending`** — the count of unsettled watchers, so a teardown path
  (or a test) can assert nothing is left holding a timer.
- **`tsconfig.test.json`** — type-checks `src/` _and_ `tests/` with
  `noUnusedLocals`, `noUnusedParameters` and `noImplicitOverride`. Previously only
  `src/` was checked.
- **New scripts**: `format`, `format:check`, `test:unit`, and `verify`
  (typecheck + test + format:check). `test` now runs the whole suite instead of
  only the integration tests.

### Changed

- **Tests are organised into `tests/unit` and `tests/integration`**, with shared
  fixtures in `tests/helpers.ts`. A `BrokerFactory` centralises teardown so a
  forgotten `shutdown()` cannot leak an armed timer and keep the test process
  alive.
- **Line and function coverage of `src/` is at 100%**, up from a suite that did
  not exist in this form.
- Removed every `@ts-ignore` from `src/`.
- `broadcastTo` now delegates to `emitTo` rather than duplicating the routing
  logic.
- Per-call typing tightened across `BrokerChannel`, `EventEmitter` and
  `EventWatcher` to use `EventPayload<TEvents, K>` rather than `TEvents[K]`, so an
  `IOEvent` payload is unwrapped at the boundary.

### Documentation

- **New [`docs/api/README.md`](./api/README.md)** — the full API reference. The
  source JSDoc already linked to this path, but the file did not exist.
- Corrected the `ChannelMethod` doc, which claimed a `'user'` prefix also claims
  `'username:verify'`. It does not: `ChannelEvents` **drops** that key rather than
  re-labelling it, because the match is textual and a channel only ever writes
  `<name><delimiter><event>`. Verified against the compiler, not assumed.
- **README** — added an install/usage section and repaired the documentation
  links, which pointed at `#` and `#/api`.
- **Quick Start** — rewritten against the current API. The previous version
  documented a `'every'` call strategy that was removed in 1.1.0 and never
  existed as of this release.
- **CONTRIBUTING** — corrected. It listed Node 14 (the package targets Node 18+)
  and told contributors to run `npm test` and `npm run lint`, the latter of which
  is not a script in this repository.
- **Package description** — dropped the "zero-dependency" claim. The package has
  one runtime dependency, `@glandjs/emitter`.

### Examples

- `mesh-network.ts` — removed a stray `+` that turned a subscription into a unary
  plus expression. It ran by accident; it was not valid TypeScript.
- `auth-service.ts` — replaced a `call(..., 'first')` call (a strategy removed in
  1.1.0, and a compile error) with a real `IOEvent` request/response flow.
- `basic.ts` — imported from `../dist`, which is gitignored and absent on a fresh
  clone. Now imports from `../src` like the other examples.
- `simple.ts` — annotated a parameter that was implicitly `any`.

### Migration

```ts
// send — payload is now required and sits before options
broker.send('user:login', peer, { id: 'u1' });
broker.send('user:login', peer, { id: 'u1' }, { timeout: 100 });

// channel watch — now works; previously always timed out
const payload = await broker.channel('user').watch('login', 5_000);

// call — 'first' and 'last' were removed in 1.1.0 and are not in 2.0.0 either
broker.call('user:validate', data); // first listener's result
broker.call('user:validate', data, 'all'); // every result, in order
```

Everything else in 1.x keeps working. If you do not call `send()` or a channel's
`watch()`, this is a drop-in upgrade.

## [1.1.2] – 2025-10-14

- **Chore**: version bump only. No source changes from 1.1.1.

## [1.1.1] – 2025-10-14

- **Chore**: version bump only. No source changes from 1.1.0.

## [1.0.0-beta-1] – 2025-05-01

This is the first stable release of `@glandjs/events`. It provides a fast, zero-dependency event broker and message bus designed for building scalable, event-driven applications based on a modular and protocol-agnostic architecture.

This release introduces a solid and extensible foundation for building high-performance event systems in TypeScript and JavaScript environments using Bun. All events are fully type-safe, ensuring better maintainability and fewer runtime errors. Brokers are designed with peer-to-peer (P2P) and mesh networking architecture, enabling high scalability and flexible event routing across distributed systems.

### Features

#### Core Architecture

- **EventBroker Class**

  - Implements the core logic for event propagation, namespacing, and broker-to-broker communication.
  - Supports **hierarchical event propagation** between nested brokers, making it easy to scale applications by adding more brokers without increasing complexity.
  - Brokers operate using a **P2P mesh architecture**, allowing direct communication and event routing between them, enabling low-latency, high-throughput messaging in large-scale systems.
  - **Type-safe event handling** is fully supported across brokers, ensuring that the types of events and handlers match perfectly at compile time.
  - Supports the registration of event handlers with strategies like `parallel`, `sync`, and `async`, enabling flexible event processing patterns.

- **BrokerChannel Class**
  - Acts as a bridge between event channels and brokers.
  - Handles fully **namespaced event routing**, which helps in avoiding collisions and ensuring events are handled in the correct context.
  - Scoped event listener registration allows for better modularity with dot-separated namespaces, ensuring that events are processed in the right context.
  - Supports **isolated channel-level event handling**, making it possible to separate concerns and reduce complexity in large applications.

#### Event Engine

- **EventEmitter**

  - A lightweight and efficient emitter designed for pub/sub use cases.
  - Optimized for **zero-allocation** and **fast lookup** via a Radix Tree structure, providing a significant performance boost over other event systems.
  - Fully supports **wildcards** and **event pooling**, enabling efficient handling of events in high-frequency environments.

- **EventWatcher**
  - Promise-based event observer designed for async workflows.
  - Useful for scenarios where you need to wait on specific events or implement dynamic workflows that depend on asynchronous events.

#### Typings & Interfaces

- Fully TypeScript-compatible with comprehensive type definitions for all major components:
  - **EventApi**, **EventOptions**, **BrokerOptions**, **ChannelInterface**, and other critical components.
- Type-safe methods for event handling, including `emit`, `on`, `off`, and `watch`. All events and their respective handlers are type-checked at compile time, eliminating potential runtime errors.
- Strongly-typed broker and event interfaces that ensure the correctness of event data passed between components.

#### Modular Design

- Designed with **separation of concerns** into substructures: `core`, `channel`, `engine`, and `common`.
- Easily extendable to support multiple protocols (e.g., HTTP, WebSocket) by creating custom brokers that can communicate seamlessly via the `BrokerChannel`.
- P2P and mesh architecture ensures brokers can interconnect easily, making it ideal for distributed systems where events need to flow between independent services.

#### Performance Optimizations

- **Zero-dependency emitter** optimized for performance, utilizing advanced techniques like **caching** and **pooling** to reduce overhead during event processing.
- **Radix Tree structure** for faster event lookups and memory efficiency, especially in applications that handle high-throughput events.
- The internal **caching and pooling mechanisms** minimize redundant event emissions and optimize memory usage for large-scale applications.

#### Broker Communication and Networking

- Brokers communicate in a **peer-to-peer (P2P)** manner, where each broker can directly connect to another, facilitating fast and reliable event propagation across distributed systems.
- This **mesh network** of brokers allows for **high scalability** as brokers can be added or removed without disrupting event flow, making it an ideal solution for microservices or event-driven architectures.

### Build and Tooling

- Native **ESM** support via Bun, enabling modern JavaScript/TypeScript workflows without needing a bundler.
- **TypeScript types** (`.d.ts`) included in the `dist/` directory for better IDE support and auto-completion.
- Supports **Bun** version ≥ 1.0.0 and **TypeScript** version ≥ 5.
- Optimized for bundler-free environments, which means you can work with the project directly in Bun or any modern JavaScript runtime.
- Linting, formatting, and type checking integrated with **Prettier**, **TypeScript**, and **Husky** for a seamless development experience.

### Testing and Quality Assurance

- Full test coverage with **Bun**. The engine and broker classes have been thoroughly tested with both unit and integration tests.
- Tests ensure that **P2P communication**, **event propagation**, and **type safety** are functioning as expected in different scenarios.
- **Code coverage** integrated into Bun’s testing suite, ensuring the reliability and correctness of all event-handling features.

### Migration Notes

This is the **first stable release**, so there are no breaking changes from previous versions. However, if you are upgrading from a pre-release (such as `1.0.0-alpha` or `1.0.0-beta`), please review any changes in method signatures, file organization, or type definitions, as these have been fine-tuned for better consistency and type safety.

## [1.0.0-beta] – 2025-05-03

### Chore

- **Package**: Added `exports` field to `package.json` for proper ESM resolution.
- **Version**: Bumped from `1.0.0-beta-1` to `1.0.0-beta`.

## [1.0.2-beta] – 2025-05-04

### Changed

- **package.json**
  - Added `"main": "./dist/index.js"` so that CommonJS consumers can `require()` the package.
  - Expanded `"exports"` to include both `"import"` and `"require"` targets, ensuring proper resolution in ESM and CJS contexts.
  - Removed Bun‑only build pipeline; build now runs purely via `tsc`.
  - Switched `module` to `CommonJS` and `target` to `ES2021` for broader runtime support.
  - Simplified compiler options, removing Bun‑specific and unused flags.
  - Consolidated to a single `"build": "tsc"` entry, dropping the separate `bun build` step.
  - Ensures both `.js` and `.d.ts` outputs land in `dist/`.

## [1.0.0] – 2025-05-08

### Added

- **EventEmitter**

  - Added `maxListeners` parameter to constructor and `BrokerOptions` interface to limit the maximum number of listeners per event (default: 5)
  - Implemented listener count validation in `on()` and `once()` methods to prevent potential memory leaks
  - Added error handling when listener limit is exceeded, with clear error messages indicating the event name and limit

- **Types**

  - Added `IOEvent<TPayload, TReturn>` generic type for explicit payload and return type definition
  - Added `Events<TEvents>` as an alias for `keyof TEvents & string` for better type inference
  - Added `EventPayload<TEvents, K>` and `EventReturn<TEvents, K>` helper types for improved type safety

- **CallMethod**
  - Remove `race`-`some`-`every` strategies:

### Changed

- **Broker**

  - Improved type definitions across all methods for better TypeScript inference
  - Enhanced method signatures to use new type system with `EventPayload` and `EventReturn`

- **EventEmitter**
  - Refactored internal code to use new type definitions
  - Improved error messages with more context about the failure reason

### Fixed

- Fixed potential memory leak by enforcing maximum listener count
- Improved type safety across the codebase by using more specific type definitions

## [1.1.0] - 2025-05-10

### Added

- A new **UUID generation utility** (`generateUUID`) to replace runtime‑specific APIs and ensure consistent ID creation across environments.
- Broker mesh management methods:

  - **`getConnections`** & **`getConnection`** for inspecting active connections.
  - **`disconnectAll`** to tear down all peer connections in one call.
  - **`callTo`** for invoking an action on a specific broker by ID.
  - **`broadcastTo`** for sending an event to a selected subset of brokers.
  - **`findBroker`** to locate a broker in the mesh—directly or via multi‑hop.

### Changed

- **Simplified the `call` API**:

  - The default invocation (no strategy) now returns the **first** listener’s result.
  - Passing the `'all'` strategy returns an **array** of all listener results.
  - Removed explicit support for `'first'` and `'last'` parameters.

- **Refactored method overloads** in broker and channel classes to match the new call signature.
- **Replaced** all `crypto.randomUUID()` calls with the new `generateUUID()` utility for platform‑agnostic behavior.
- **Streamlined private state** initialization and TypeScript declarations for stronger type safety.

### Removed

- Deprecated the explicit `'first'`/`'last'` call strategies.
- Eliminated obsolete API overloads and unused code paths to reduce maintenance burden.
