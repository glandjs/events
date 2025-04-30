# Quick Start Guide for @glandjs/events

This guide will help you get started with @glandjs/events quickly. Follow these steps to set up a basic event system in your application.

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
interface AppEvents {
  'user:login': { id: string; username: string };
  'notification:new': { id: string; message: string };
}

// Create an event broker
const events = new EventBroker<AppEvents>({ name: 'app-broker' });

// Subscribe to events
events.on('user:login', (data) => {
  console.log(`User logged in: ${data.username} (${data.id})`);
});

// Emit events
events.emit('user:login', { id: 'user123', username: 'john_doe' });
```

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
    console.error('Login timeout:', error.message);
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

## Using Channels

Channels provide a way to organize events into logical groupings:

```typescript
// Create a user channel
const userChannel = events.channel('user');

// Subscribe to channel events
userChannel.on('login', (data) => {
  console.log(`Channel: User logged in: ${data.username}`);
});

// Emit channel events
userChannel.emit('login', { id: 'user789', username: 'bob_jackson' });
```

## Connecting Multiple Brokers

You can connect multiple brokers to create a mesh network:

```typescript
// Create brokers
const broker1 = new EventBroker({ name: 'broker-1' });
const broker2 = new EventBroker({ name: 'broker-2' });
const broker3 = new EventBroker({ name: 'broker-3' });

// Connect them
broker1.connectTo(broker2);
broker1.connectTo(broker3);
broker2.connectTo(broker3);

// Or use createConnections for a complete mesh
broker1.createConnections([broker2, broker3]);

// Set up event listeners on each broker
broker1.on('message:new', (message) => {
  console.log(`[${broker1.id}] Received: ${message}`);
});

broker2.on('message:new', (message) => {
  console.log(`[${broker2.id}] Received: ${message}`);
});

broker3.on('message:new', (message) => {
  console.log(`[${broker3.id}] Received: ${message}`);
});

// Broadcast a message to all connected brokers
broker1.broadcast('message:new', 'Hello from Broker 1 to everyone!');

// Send a direct message to a specific broker
broker2.emitTo(broker3.id, 'message:new', 'Direct message from Broker 2 to Broker 3');
```

## Advanced Event Handling

### One-time Listeners

Subscribe to an event for one occurrence only:

```typescript
events.once('notification:new', (data) => {
  console.log(`One-time notification: ${data.message}`);
});
```

### Using Call with Different Strategies

Execute listeners with different strategies:

```typescript
// Define multiple validators
events.on('validate:form', (data) => data.name.length > 0);
events.on('validate:form', (data) => data.email.includes('@'));
events.on('validate:form', (data) => data.age >= 18);

// Check if all validators pass
const formData = { name: 'John', email: 'john@example.com', age: 25 };
const isValid = events.call('validate:form', formData, 'every');

console.log(`Form is valid: ${isValid}`);
```

## TypeScript Integration

For full type safety, define your event types:

```typescript
interface AppEvents {
  'user:login': { id: string; username: string };
  'user:logout': { id: string; timestamp: number };
  'notification:new': { id: string; message: string; type: 'info' | 'warning' | 'error' };
  'data:loaded': { source: string; items: any[] };
}

const events = new EventBroker<AppEvents>({ name: 'typed-broker' });

// TypeScript will enforce correct event names and payload types
events.on('user:login', (data) => {
  // data is correctly typed as { id: string; username: string }
  console.log(data.username);
});

// This would cause a TypeScript error:
// events.emit('user:login', { id: 123, username: 'john' }); // Error: id should be string
```

## Next Steps

- See the [Examples](../examples) directory for more advanced usage patterns
- Learn about [Event-Driven Architecture](https://en.wikipedia.org/wiki/Event-driven_architecture) principles
