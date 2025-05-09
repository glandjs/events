<p align="center">
  <a href="#" target="blank"><img src="https://github.com/glandjs/glandjs.github.io/blob/main/public/logo.svg" width="200" alt="Gland Events Logo" /></a>
</p>

<p align="center">
  <a href="https://npmjs.com/package/@glandjs/events" target="_blank"><img src="https://img.shields.io/npm/v/@glandjs/events.svg" alt="NPM Version" /></a>
  <a href="https://npmjs.com/package/@glandjs/events" target="_blank"><img src="https://img.shields.io/npm/l/@glandjs/events.svg" alt="Package License" /></a>
  <a href="https://npmjs.com/package/@glandjs/events" target="_blank"><img src="https://img.shields.io/npm/dm/@glandjs/events.svg" alt="NPM Downloads" /></a>
</p>

<h1 align="center">@glandjs/events</h1>

<p align="center">The heartbeat of message-driven systems in Gland architecture.</p>

## Description

> What if communication between systems was as simple as sending a message?

**@glandjs/events** is more than just an event layer within Gland. It is the core foundation of the entire architecture. It is the invisible force that drives interactions between decoupled components, providing the means for communication without any underlying assumptions.

In an Event-Driven System (EDS) like Gland, everything is reduced to messages. These messages flow seamlessly between components, triggering actions, responding to events, and keeping everything synchronized without the need for explicit connections or protocols.

The concept is simple but powerful: **Messages in, reactions out**. The emitter does not need to know who listens, and the listener does not need to care where the message came from. This architectural freedom allows for the development of highly modular, maintainable, and scalable applications.

In this system, there is **no tight coupling**, **no predefined routes**, and **no constraints** — just a stream of events that define the system’s behavior. The essence of @glandjs/events lies in its simplicity and flexibility: an agnostic approach to communication, decoupling the components and enabling efficient interactions.

## Philosophy

> If Gland is a language for expressing modular architecture, then @glandjs/events is its grammar.

@Glandjs/events is not concerned with transport layers, protocols, or APIs. It is **protocol-agnostic** and **transport-agnostic**, designed to handle any event or message that needs to be propagated through the system, regardless of the underlying transport mechanism. Whether it’s HTTP, WebSocket, RPC, or any other protocol, **@glandjs/events** is indifferent to how messages get to their destinations. What matters is **the message** itself — the **event**.

At its core, @glandjs/events is built on the principle of **semantic decoupling**. It allows each component to **speak freely** to others without worrying about the specifics of how that message is delivered or received. This leads to a system where:

- Components are independent and can be modified or replaced without breaking the overall application.
- Communication between components is **implicit**, allowing for cleaner and more maintainable code.
- Developers are free from having to define rigid data flows, making the system more flexible as requirements evolve.

This approach fosters **true modularity**. Components become just **listeners** and **emitters**, reacting to changes in state or events. No assumptions are made about how or when these messages should be processed, and no constraints are imposed on how the system should grow.

## Design Intent

The design of @glandjs/events is centered around flexibility, simplicity, and minimalism. Its purpose is to provide an abstracted layer that facilitates communication between disparate parts of a system without constraining the design or flow of the application.

- **No hierarchies**: There are no rigid structures or predefined relationships. The system flows based on intent, not hierarchy.
- **No contracts**: Events are the contract. The system doesn’t require explicit rules for message formats or types.
- **No lifecycle**: Events don’t have lifecycles. They come and go as needed, each event simply carrying its message from one place to another.
- **Message flow** is the only focus: it does not matter where the message originates or where it is consumed; it only matters that it reaches its destination when needed.

## Events: The Building Blocks of Communication

In the world of @glandjs/events, an **event** is not a simple occurrence or trigger; it’s a **message** that contains meaning. The system does not distinguish between types of events; all events are equal in the sense that they are carriers of information, carrying meaning across the system.

An event could be a user action, a background task update, or an external API response — it doesn’t matter. What matters is that an event has occurred, and other parts of the system need to know about it. The emitter sends a message, and listeners react accordingly. It’s as simple as that.

These events are typically carried by a **broker**, which is responsible for managing the flow of messages. This broker allows components to **publish** events and **subscribe** to them, effectively acting as the intermediary between components.

### Why Events?

Events represent the simplest and most flexible form of communication. They remove the need for complex dependency management or tightly coupled components. By adopting an event-driven approach, your system becomes:

- **Decoupled**: No component is directly dependent on another, which makes it easier to change and extend your system.
- **Composable**: New events can be added easily without impacting the existing structure.
- **Scalable**: As your system grows, the communication infrastructure remains fluid and flexible.

## Documentation

For full documentation on how to use @glandjs/events, check out the following resources:

- [Official Documentation](#)
- [API Reference](#/api)
- [Contributing Guide](./docs/CONTRIBUTING.md)

## License

MIT © Mahdi — See [LICENSE](./LICENSE)
