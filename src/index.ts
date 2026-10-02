/**
 * @glandjs/events
 *
 * The event layer of Gland: a named broker that carries messages between
 * decoupled components and can be wired into a mesh of other brokers.
 *
 * Three layers, each usable on its own:
 *
 * - {@link EventBroker} — naming, routing, and the connection graph
 * - {@link BrokerChannel} — a namespaced façade over a broker
 * - {@link EventEmitter} / {@link EventWatcher} — fan-out and promise observation
 *
 * @example
 * import { EventBroker, type IOEvent } from '@glandjs/events';
 *
 * interface AppEvents {
 *   'user:login': { id: string };
 *   'user:validate': IOEvent<{ name: string }, boolean>;
 * }
 *
 * const broker = new EventBroker<AppEvents>({ name: 'app' });
 *
 * broker.on('user:login', (p) => console.log(p.id));
 * broker.emit('user:login', { id: 'u1' });
 */
export * from './broker';
export * from './broker-channel';
export { EventEmitter } from './engine/event-emitter';
export { EventWatcher } from './engine/event-watcher';
export * from './common';
