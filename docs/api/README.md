# API Reference

Complete reference for the public surface of `@glandjs/events`.

- [Quick Start](../Quick_Start.md) — a runnable tour
- [Examples](../../examples) — complete programs

---

## Contents

- [Layers](#layers)
- [Event maps](#event-maps)
- [`EventBroker`](#eventbroker)
  - [Constructor](#constructor)
  - [Subscribing](#subscribing)
  - [Emitting](#emitting)
  - [Requesting: `call`](#requesting-call)
  - [Channels](#channels)
  - [The mesh](#the-mesh)
  - [Lifecycle](#lifecycle)
- [`BrokerChannel`](#brokerchannel)
- [`EventEmitter`](#eventemitter)
- [`EventWatcher`](#eventwatcher)
- [Options](#options)
- [Types](#types)
- [Interfaces](#interfaces)
- [Guarantees](#guarantees)

---

## Layers

Three layers, each usable on its own:

| Layer                                                             | Responsibility                            |
| ----------------------------------------------------------------- | ----------------------------------------- |
| [`EventBroker`](#eventbroker)                                     | Naming, routing, and the connection graph |
| [`BrokerChannel`](#brokerchannel)                                 | A namespaced façade over a broker         |
| [`EventEmitter`](#eventemitter) / [`EventWatcher`](#eventwatcher) | Fan-out and promise observation           |

Nothing here knows about HTTP, sockets or queues. That is what lets an adapter
for any transport live outside this package and still join a mesh.

---

## Event maps

Every surface is parameterised by one map describing the events a component
understands. Keys are event names; values are payloads, or [`IOEvent`](#ioevent)
when the event needs a return value.

```ts
import { EventBroker, type IOEvent } from '@glandjs/events';

type AppEvents = {
  'user:login': { id: string; username: string };
  'user:validate': IOEvent<{ name: string }, boolean>;
  ping: void;
  'message:new': string;
};
```

> **Do not write `interface AppEvents extends EventRecord`.** > `EventRecord` is `Record<string, any>`, and an interface that extends it
> inherits a string index signature — which silently widens every event name to
> `string` and every payload to `any`. Nothing errors at the declaration; you
> just stop getting errors everywhere afterwards. Use a type alias, or a plain
> interface with no base.

---

## `EventBroker`

```ts
new EventBroker<AppEvents>({ name: 'app' });
```

### Constructor

```ts
new EventBroker<TEvents>(options: BrokerOptions)
```

| Option           | Default    | Meaning                                           |
| ---------------- | ---------- | ------------------------------------------------- |
| `name`           | _required_ | The broker's id, unique in a mesh                 |
| `cacheSize`      | `6`        | Event names the underlying emitter keeps resolved |
| `delimiter`      | `':'`      | Separator for namespaced names                    |
| `ignoreErrors`   | `false`    | Swallow errors thrown by _peers_                  |
| `defaultTimeout` | `1000`     | Default watcher timeout in ms                     |
| `maxListeners`   | `5`        | Listener budget per event name                    |

`broker.id` is the `name`. It is read-only and immutable.

### Subscribing

#### `on(event, listener, options?)`

Registers a listener. Returns `this`, so calls chain.

```ts
broker.on('user:login', (p) => audit(p)); // p is { id: string; username: string }
```

#### `on(event, null, { watch: true })`

Subscribes with a promise instead of a listener. Returns a promise that resolves
with the next payload for that event.

```ts
const next = await broker.on('user:login', null, { watch: true, timeout: 5_000 });
```

`listener` must be `null` in this mode. Passing `null` **without** `watch: true`
throws.

#### `once(event, listener, options?)`

As `on`, but fires for a single emit and then detaches. Also supports the
`{ watch: true }` mode.

A pending `once` still counts against `maxListeners`, and still runs once per
routed event — a broadcast reaches each peer, and each peer's `once` consumes its
own subscription.

#### `off(event, listener?)`

Removes one listener, or every listener for the event when `listener` is omitted.
Returns `this`.

Removal is **exact-name only**: `off('user:login')` leaves a `'user:*'`
subscription in place. To remove a wildcard, address it by its own name.

`off` never removes a connection. Auto-forwarding configured by
[`connectTo`](#connecttobroker-options) is routing state, not a listener.

#### `getListener(event)`

Returns a copy of the listeners registered for **exactly** this name. `*`
subscriptions are not included — see [`call`](#requesting-call) for why.

### Emitting

#### `emit(event, payload, options?)`

Delivers to local listeners, then routes across connections. Returns `this`.

```ts
broker.emit('user:login', { id: 'u1', username: 'ada' });
```

#### `broadcast(event, payload, options?)`

Emits locally and floods the whole reachable mesh. Every broker in the connected
component receives it **exactly once**, no matter how many paths lead there.
Brokers outside the mesh are unaffected.

```ts
broker.broadcast('config:changed', { version: 2 });
```

#### `send(event, target, payload, options?)`

Emits once on `target` directly. Takes an **instance** rather than an id, and does
not require a connection — use [`findBroker`](#findbrokerid-maxdepth) to turn an
id into an instance.

The target processes the event locally but neither relays nor echoes it.

```ts
const peer = broker.findBroker('http-adapter');
if (peer) broker.send('shutdown', peer, undefined);
```

> **Changed in 2.0.0.** `payload` is now a required parameter. In 1.x the
> argument was missing entirely and the target received a literal `null`.

### Requesting: `call`

An event can be a question rather than a notification. Declare it as
[`IOEvent`](#ioevent) and `call` returns an answer.

```ts
broker.on('user:validate', (d) => d.name.length > 0);
broker.on('user:validate', (d) => d.age >= 18);

broker.call('user:validate', data); // first listener's answer
broker.call('user:validate', data, 'all'); // [nameOk, ageOk]
```

- **default** — the **first** listener's return value
- **`'all'`** — every listener's return value, in registration order

Both return `[]` when nothing is listening. That is deliberate: an unanswered
request is a result you can branch on, rather than an `undefined` that looks like
a handler returned nothing.

`call` walks only exact-name listeners, never wildcards — which is what keeps the
answer predictable rather than depending on subscription order across a wildcard.

### Channels

#### `channel(name)`

Returns a [`BrokerChannel`](#brokerchannel) for the prefix, creating it on first
use. The same name always returns the **same instance**, so a channel can be
captured once and shared.

```ts
const user = broker.channel('user');
user.on('login', (p) => audit(p));
user.emit('login', { id: 'u1', username: 'ada' }); // reaches 'user:login'
```

A channel owns no bus of its own — it rewrites the name and delegates. These two
lines are the same call:

```ts
broker.channel('user').emit('login', payload);
broker.emit('user:login', payload);
```

`name` does not have to be an event in your map, but keep it namespace-shaped.
A prefix of `'user'` does **not** claim `'username:verify'`; that key is simply
absent from a `'user'` channel. Use `channel('username')` for it.

### The mesh

#### `connectTo(broker, options?)`

Adds a peer. Connections are **mutual** — the peer gains a link back. Connecting
the same peer twice is a no-op, and the first `options` wins.

`options.events` is a **standing forward**: every emit of those events on this
broker is also delivered to that peer, with no per-message effort from the caller.

```ts
broker.connectTo(httpAdapter, { events: ['route:registered'] });
```

Forwarding rides on the same `eventId` as the original, so it cannot loop. It is
routing state rather than a listener, so it consumes no listener slots and does
not survive a `disconnect`.

Names are matched **exactly** — a `'user:*'` entry is not a wildcard here. Use the
emitter's own `*` matching on the peer instead.

**Throws** if `broker` has no id, or is this broker.

#### `createConnections(brokers, options?)`

Connects `brokers` to this broker and to each other, forming a full mesh.

```ts
registry.createConnections([http, ws, queue]);
```

#### `disconnect(brokerId)` / `disconnectAll()`

Removes a link in both directions, stopping forwarding and propagation through it
immediately. `disconnect` returns `true` if a link was removed. Peers still
reachable by another path remain in the mesh.

#### `isConnected(brokerId)`

Whether a direct link exists.

#### `getConnections()` / `getConnection(brokerId)`

Ids of directly connected peers in connection order; and the peer instance for a
given id, or `undefined`.

#### `findBroker(brokerId, maxDepth?)`

Resolves an id to its instance, following connections up to `maxDepth` hops.
Defaults to `3`. Returns `this` for its own id, and `undefined` when the id is
unreachable within the budget.

A **direct** connection is always found, regardless of `maxDepth` — the budget
bounds the intermediaries walked, not the final link.

```ts
const peer = broker.findBroker('http-adapter');
```

#### `emitTo(brokerId, event, payload, options?)`

Emits on the peer identified by `brokerId`. Returns `false` when there is no such
link, which lets a caller distinguish "delivered" from "not connected" without a
`try`/`catch`. Does not relay onward.

#### `emitTo` family

```ts
broker.broadcastTo(['b1', 'b2'], 'message:new', 'hi'); // skips unconnected ids
```

`broadcastTo` emits on each id, one event each, skipping ids that are not
connected.

#### `callTo(brokerId, event, data, strategy?)`

Runs the event on a **peer's** listeners and returns the result, across the mesh.
`'all'` behaves identically there. Returns `[]` when `brokerId` is not directly
connected.

```ts
const valid = broker.callTo('registry', 'user:validate', data);
```

### Lifecycle

#### `watch(event, timeoutMs?)`

Resolves with the payload of the next emit of `event`. One-shot: it settles once
and unsubscribes.

```ts
const ready = broker.watch('app:ready', 5_000);
await bootstrap();
const payload = await ready;
```

Local only — `watch` never crosses a connection. To await something from another
broker, that broker's emit must reach this one first.

**Rejects** with `Event '<name>' timed out after <ms>ms` on timeout.

#### `shutdown()`

Releases all listeners, connections, channels and pending watchers.

Peers are **told**, not just forgotten, so no peer is left holding a link to a
broker that will never process anything again. Watchers are rejected rather than
left to time out, so a `shutdown()` in a test teardown cannot keep the process
alive.

Idempotent, and the broker remains usable afterwards.

---

## `BrokerChannel`

A namespaced façade. Every method rewrites `event` into
`<name><delimiter><event>` and delegates to the owning broker.

```ts
const user = broker.channel('user');
user.on('login', (p) => track(p.id));
user.emit('login', { id: 'u1', username: 'ada' }); // 'user:login'
user.once('logout', cleanup); // 'user:logout'
```

| Member                                | Behaviour                                                                |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `id`                                  | Id of the owning broker                                                  |
| `name`                                | The prefix, without a trailing delimiter                                 |
| `on` / `once`                         | Subscribe, with the same two modes as the broker                         |
| `off(event, listener?)`               | Unsubscribe; exact-name only, so a `'*'` handler survives                |
| `emit(event, payload, options?)`      | Emits `<name>:<event>`                                                   |
| `call(event, data, strategy?)`        | Runs listeners; `[]` when nothing is listening                           |
| `getListener(event)`                  | Listeners for `<name>:<event>`                                           |
| `watch(event, timeoutMs?)`            | Resolves on `<name>:<event>`                                             |
| `broadcast(event, payload, options?)` | Broadcasts `<name>:<event>` across the mesh                              |
| `channel(name)`                       | A deeper channel; `user.channel('profile')` yields prefix `user:profile` |

The type system narrows `TEvents` to the keys under the prefix and re-labels
them, so `user.on('loginn')` does not compile and the payload type is already the
right one — no annotation needed.

---

## `EventEmitter`

Single-node pub/sub, usable without a broker.

```ts
new EventEmitter<TEvents>(separator?, cacheSize?, timeout?, maxListeners?)
```

The listener tree itself comes from `@glandjs/emitter` (segment-based lookup,
`*` wildcards, a hot-path cache). `EventEmitter` adds promise observation and the
listener budget on top.

| Member                           | Behaviour                                             |
| -------------------------------- | ----------------------------------------------------- |
| `on` / `once`                    | As [`EventBroker`](#subscribing)                      |
| `emit(event, payload, options?)` | Fans out to listeners, then settles watchers          |
| `off(event, listener?)`          | Removes one or all listeners for the exact name       |
| `watch(event, timeoutMs?)`       | Resolves on the next emit                             |
| `getListener(event)`             | Exact-name listeners, as a copy                       |
| `shutdown()`                     | Removes every listener, rejects every pending watcher |

Listeners run in registration order. Watchers are settled **before** listeners
run, so a `watch` promise does not depend on any listener having been registered.

Registering past `maxListeners` throws, naming both the budget and the event:

```
Maximum listeners (5) exceeded for event 'user:login'
```

---

## `EventWatcher`

Promise-based observer — turns "emit an event" into "await an event". Separate
from the emitter because a watcher owns a timer and a settle path, and a
listener owns neither.

```ts
new EventWatcher<TEvents>(timeout);
```

| Member                     | Behaviour                                                   |
| -------------------------- | ----------------------------------------------------------- |
| `watch(event, timeoutMs?)` | Resolves on the next emit; rejects on timeout               |
| `onEmit(event, payload)`   | Settles every waiter for that event                         |
| `pending`                  | Count of unsettled watchers, for asserting a clean teardown |
| `shutdown()`               | Rejects every pending watcher and releases all timers       |

All waiters on an event are settled by the first matching emit, then dropped.

---

## Options

### `BrokerOptions`

| Field            | Type      | Default    |
| ---------------- | --------- | ---------- |
| `name`           | `string`  | _required_ |
| `cacheSize`      | `number`  | `6`        |
| `delimiter`      | `string`  | `':'`      |
| `ignoreErrors`   | `boolean` | `false`    |
| `defaultTimeout` | `number`  | `1000`     |
| `maxListeners`   | `number`  | `5`        |

### `EventOptions`

Per-call tuning. Every field is optional and defaulted, so `{}` equals nothing.

| Field          | Meaning                                        |
| -------------- | ---------------------------------------------- |
| `watch`        | Subscribe with a promise instead of a listener |
| `timeout`      | Milliseconds before a watcher rejects          |
| `defaultValue` | Value a watcher resolves with on timeout       |

`defaultValue` is tested with `!== undefined`, so `0`, `''`, `false` and `null`
are all valid fallbacks. Leaving it undefined makes the timeout a rejection.

### `EmitOptions`

Extends `EventOptions` with three underscore-prefixed routing fields. They are
transport bookkeeping rather than application input — `broadcast`, `send`,
`emitTo` and `broadcastTo` set them. Set `_eventId` yourself only to reuse a
correlation id across two emits.

| Field        | Meaning                                                   |
| ------------ | --------------------------------------------------------- |
| `_eventId`   | Correlation id. Generated per emit when omitted           |
| `_sourceId`  | Broker that originated the event. Defaults to this broker |
| `_propagate` | Keep forwarding to peers, which forward onward in turn    |

### `ConnectionOptions`

| Field    | Meaning                                     |
| -------- | ------------------------------------------- |
| `events` | Events to forward to the peer automatically |

---

## Types

### `IOEvent`

A request/response event definition. Only needed when an event has a _return
value_ — fire-and-forget events are declared with their payload directly.

```ts
type IOEvent<TPayload = any, TReturn = void> = {
  payload: TPayload;
  return: TReturn;
};
```

```ts
type AppEvents = {
  'user:login': { id: string };
  'user:validate': IOEvent<{ name: string }, boolean>; // answerable via `call`
};
```

### The rest

| Type                              | Resolves to                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| `EventRecord`                     | `Record<string, any>` — the bound every event map satisfies |
| `Events<TEvents>`                 | `keyof TEvents & string`                                    |
| `EventPayload<TEvents, K>`        | The payload listeners receive, unwrapping `IOEvent`         |
| `EventReturn<TEvents, K>`         | What `call` returns; `void` unless an `IOEvent`             |
| `ChannelEvents<TPrefix, TEvents>` | Events under a prefix, re-labelled                          |
| `CallStrategy`                    | `'all'`                                                     |
| `Listener<Payload, Return>`       | `(payload: Payload) => Return`                              |
| `EventType` / `BrokerId`          | `string`                                                    |

---

## Interfaces

Implement [`Broker`](#eventbroker) to teach the mesh a new kind of node — an HTTP
adapter, a queue consumer, a test double. `EventBroker` is the in-process
implementation; the interface exists so a remote or fake peer can satisfy the same
contract.

| Interface                                                                                                                                                   | Purpose                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Broker<TEvents>`                                                                                                                                           | Everything a broker can do, independent of any event map |
| `Channel<TEvents>`                                                                                                                                          | The channel surface                                      |
| `BrokerConnection`                                                                                                                                          | A live link to another broker, and its standing forwards |
| `BrokerOptions`                                                                                                                                             | Construction options                                     |
| `ConnectionOptions`                                                                                                                                         | Per-link options                                         |
| `EventOptions` / `EmitOptions`                                                                                                                              | Per-call options                                         |
| `OnMethod`, `OnceMethod`, `OffMethod`, `EmitMethod`, `CallMethod`, `GetListenerMethod`, `ChannelMethod`, `BroadcastMethod`, `WatchMethod`, `ShutdownMethod` | Composable slices of the above                           |

`Broker` defaults its type parameter to `EventRecord`, so an untyped `Broker` is
what a heterogeneous node looks like when the mesh cannot know its event map in
advance. A broker pinned to a specific map satisfies `Broker<its own map>`.

---

## Wildcards

The underlying emitter resolves `*` within a **single** segment.

```ts
broker.on('user:*', audit); // every 'user:…' event
broker.on('a:*:c', trace); // 'a:b:c' and 'a:x:c', not 'a:b:d'
broker.emit('user:login:extra', p); // does NOT match 'user:*'
```

Wildcards are matched by `emit`, and deliberately excluded from `getListener` —
which is what lets [`call`](#requesting-call) stay deterministic.

On a channel, `'*'` stays inside the namespace:

```ts
broker.channel('user').on('*', audit); // 'user:…' only, never 'audit:…'
```

---

## Guarantees

- **Delivery is synchronous.** Listeners run before `emit` returns; no awaiting.
- **Listeners run in registration order.**
- **Mesh delivery is exactly once per broker.** An event is processed at most once
  per `eventId` on a given broker, which is what makes a mesh terminate: the
  origin suppresses the copy that comes back around.
- **Trace memory is bounded.** Correlation ids are retained in a FIFO map capped
  at 4096 entries, so the map cannot grow for the life of the process.
- **`shutdown()` leaves nothing pending.** Timers are released, watchers
  rejected, peers disconnected. A `shutdown()` in a test teardown cannot keep the
  process alive.
- **Errors from peers** abort the remaining peers unless `ignoreErrors` is set.
  `ignoreErrors` never protects local listeners — those run first.
