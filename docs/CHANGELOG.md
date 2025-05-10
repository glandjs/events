# Changelog

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
