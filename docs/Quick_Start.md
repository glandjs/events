# Quick Start Guide for @glandjs/events

This guide will help you get started with @glandjs/events quickly. Follow these steps to set up a basic event system in your application.

For the complete reference, see the [API Reference](./api/README.md).

## Installation

First, install the package using your preferred package manager:

```bash
# Using npm
npm install @glandjs/events

# Using pnpm
pnpm add @glandjs/events

# Using bun
bun add @glandjs/events
```

## Basic Usage

Here's a simple example to demonstrate the core functionality:

```typescript
import { EventBroker } from '@glandjs/events';

// Define your event types (optional but recommended with TypeScript)
type AppEvents = {
  'user:login': { id: string; username: string };
  'notification:new': { id: string; message: string };
};

// Create an event broker
const events = new EventBroker<AppEvents>({ name: 'app-broker' });

// Subscribe to events
events.on('user:login', (data) => {
  console.log(`User logged in: ${data.username} (${data.id})`);
});

// Emit events
events.emit('user:login', { id: 'user123', username: 'john_doe' });
```

> **Use a `type` alias, not `interface AppEvents extends EventRecord`.** > `EventRecord` is `Record<string, any>`, and an interface extending it inherits
> a string index signature — which silently turns off all checking of event names
> and payloads. A plain `interface AppEvents { … }` with no base is fine too.

## Waiting for Events

You can wait for events to occur using the `watch` method:

```typescript
// Wait for a user login event
async function waitForLogin() {
  console.log('Waiting for user login...');
  try {
    const userData = await events.watch('user:login', 5000); // 5 second timeout
    console.log(`User ${userData.username} logged in!`);
    return userData;
  } catch (error) {
    console.error('Login timeout:', (error as Error).message);
    return null;
  }
}

// Call the function
waitForLogin().then((user) => {
  if (user) {
    // Process the logged in user
  }
});

// Later, when a user logs in, it will resolve the promise
setTimeout(() => {
  events.emit('user:login', { id: 'user456', username: 'jane_smith' });
}, 2000);
```

`watch` is one-shot: it settles on the next matching emit and unsubscribes. It
also works as an option on `on`/`once`, which is handy when you want a fallback
value instead of a rejection:

```typescript
// Resolves with `{ id: 'default', message: 'No notifications' }` if nothing arrives.
const notification = await events.on('notification:new', null, {
  watch: true,
  timeout: 1000,
  defaultValue: { id: 'default', message: 'No notifications' },
});
```

## Requesting a Value with `call`

Some events are questions, not notifications. Declare them with `IOEvent` and
`call` returns an answer:

```typescript
import { EventBroker, type IOEvent } from '@glandjs/events';

type AppEvents = {
  'user:login': { id: string; username: string };
  'validate:form': IOEvent<{ name: string; email: string; age: number }, boolean>;
};

const events = new EventBroker<AppEvents>({ name: 'app-broker' });

// Each listener is one check.
events.on('validate:form', (d) => d.name.length > 0);
events.on('validate:form', (d) => d.email.includes('@'));
events.on('validate:form', (d) => d.age >= 18);

const formData = { name: 'John', email: 'john@example.com', age: 25 };

// No strategy: the first listener's result, typed `boolean`.
const isValid = events.call('validate:form', formData);

// 'all': every result, in registration order.
const results = events.call('validate:form', formData, 'all');

console.log(isValid); // true
console.log(results); // [true, true, true]
```

Both return `[]` when nothing is listening, so an unanswered request is a result
you can branch on rather than an `undefined` that looks like a handler returned
nothing.

## Using Channels

Channels let a module own a namespace without ever writing the prefix:

```typescript
// Create a user channel
const userChannel = events.channel('user');

// Subscribe to channel events — 'login', not 'user:login'
userChannel.on('login', (data) => {
  console.log(`Channel: User logged in: ${data.username}`);
});

// Emit channel events — reaches 'user:login'
userChannel.emit('login', { id: 'user789', username: 'bob_jackson' });
```

The type system narrows the channel to the events under its prefix and re-labels
them, so `userChannel.on('loginn')` does not compile and the payload type is
already correct without an annotation.

A channel can be nested one level deeper:

```typescript
const profile = events.channel('user').channel('profile');
profile.on('viewed', (data) => track(data.id)); // 'user:profile:viewed'
```

## Connecting Multiple Brokers

You can connect multiple brokers to create a mesh network:

```typescript
// Create brokers
const broker1 = new EventBroker<AppEvents>({ name: 'broker-1' });
const broker2 = new EventBroker<AppEvents>({ name: 'broker-2' });
const broker3 = new EventBroker<AppEvents>({ name: 'broker-3' });

// Connect them
broker1.connectTo(broker2);
broker1.connectTo(broker3);
broker2.connectTo(broker3);

// Or use createConnections for a complete mesh — it also connects the entries
// to each other, so every broker reaches every other.
broker1.createConnections([broker2, broker3]);

// Set up event listeners on each broker
broker1.on('notification:new', (message) => {
  console.log(`[${broker1.id}] Received: ${message.message}`);
});

// Broadcast a message to all connected brokers.
// Every broker in the connected component receives it exactly once.
broker1.broadcast('notification:new', { id: 'n1', message: 'Hello everyone!' });

// Send a direct message to a specific connected broker
broker2.emitTo(broker3.id, 'notification:new', { id: 'n2', message: 'Just for you' });
```

Other mesh operations:

```typescript
broker1.getConnections(); // ['broker-2', 'broker-3']
broker1.isConnected('broker-2'); // true
broker1.callTo('broker-2', 'validate:form', formData); // ask a peer
broker1.disconnect('broker-3'); // removes the link both ways
```

To forward selected events to a peer automatically, without per-message work:

```typescript
broker1.connectTo(broker2, { events: ['notification:new'] });

// Every emit of 'notification:new' on broker1 now also reaches broker2.
broker1.emit('notification:new', { id: 'n3', message: 'auto-forwarded' });
```

Forwarding is routing state rather than a listener: it shares the original
correlation id so it cannot loop, and it stops on `disconnect`.

## Advanced Event Handling

### One-time Listeners

Subscribe to an event for one occurrence only:

```typescript
events.once('notification:new', (data) => {
  console.log(`One-time notification: ${data.message}`);
});
```

### Removing Listeners

```typescript
const handler = (data) => console.log(data.message);

events.on('notification:new', handler);
events.off('notification:new', handler); // one listener
events.off('notification:new'); // all of them
```

Removal is exact-name only: `off('user:login')` leaves a `'user:*'` subscription
in place.

### Wildcards

The underlying emitter resolves `*` within a single segment:

```typescript
events.on('user:*', (data) => console.log(data)); // every 'user:…' event
```

Wildcards are matched by `emit`, and deliberately excluded from `getListener` —
which is what keeps `call` deterministic.

### Listener Budget

Each event name has a listener budget, so a subscription leak fails loudly instead
of accumulating quietly:

```typescript
const events = new EventBroker<AppEvents>({ name: 'app', maxListeners: 5 });

// On the 6th listener for one event:
// Error: Maximum listeners (5) exceeded for event 'user:login'
```

`off` frees the budget again.

## Configuration

```typescript
const events = new EventBroker<AppEvents>({
  name: 'app-broker', // required — the broker's id in a mesh
  cacheSize: 6, // event names the emitter keeps resolved
  delimiter: ':', // separator for namespaced names
  ignoreErrors: false, // swallow errors thrown by *peers*
  defaultTimeout: 1000, // default watcher timeout in ms
  maxListeners: 5, // listener budget per event
});
```

## Cleaning Up

```typescript
events.shutdown();
```

`shutdown()` releases every listener, disconnects every peer (telling them, so
none is left holding a dead link), and rejects any pending watcher rather than
leaving a timer armed. It is idempotent, and the broker stays usable afterwards.

## TypeScript Integration

For full type safety, define your event types:

```typescript
import { EventBroker, type IOEvent } from '@glandjs/events';

type AppEvents = {
  'user:login': { id: string; username: string };
  'user:logout': { id: string; timestamp: number };
  'notification:new': { id: string; message: string; type: 'info' | 'warning' | 'error' };
  'data:loaded': { source: string; items: unknown[] };
  'user:validate': IOEvent<{ name: string }, boolean>;
};

const events = new EventBroker<AppEvents>({ name: 'typed-broker' });

// TypeScript enforces correct event names and payload types
events.on('user:login', (data) => {
  // data is correctly typed as { id: string; username: string }
  console.log(data.username);
});

// These would all cause a TypeScript error:
// events.emit('user:logon', { id: '1', username: 'a' });  // unknown event name
// events.emit('user:login', { id: 123, username: 'a' }); // id should be a string
// events.on('user:loginn', (d) => {});                   // misspelled event
```

## Next Steps

- Read the [API Reference](./api/README.md) for every method, option and type
- Look at the [Examples](../examples) directory for complete, runnable programs
- Learn about [Event-Driven Architecture](https://en.wikipedia.org/wiki/Event-driven_architecture) principles
