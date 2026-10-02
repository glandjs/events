import type { ChannelEvents, EventPayload, EventRecord, EventReturn, EventType, Events, Listener } from '../../types/common.types';
import type { Channel } from '../channel.interface';
import type { EmitOptions, EventOptions } from './event-options.interface';

/**
 * Subscribes to an event.
 *
 * Declared as two overloads rather than one because the two modes return
 * different things: a listener registration returns `this` for chaining, while
 * the `watch` mode returns a promise. `null` is only accepted in watch mode,
 * where there is no listener to pass.
 */
export interface OnMethod<TEvents extends EventRecord> {
  on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  on<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
}

/**
 * Subscribes for exactly one emit.
 *
 * Shares `OnMethod`'s two modes; the difference is that the registration is torn
 * down after it fires once.
 */
export interface OnceMethod<TEvents extends EventRecord> {
  once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  once<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
}

/**
 * Runs listeners synchronously and returns their result.
 *
 * The `'all'` overload collects every listener's return value in registration
 * order. Both overloads resolve to `[]` when nothing is listening.
 */
export interface CallMethod<TEvents extends EventRecord> {
  call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
}

/** Unsubscribes one listener, or all listeners for the event when none is given. */
export interface OffMethod<TEvents extends EventRecord> {
  off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this;
}

/** Delivers a payload to local listeners, and routes it per `EmitOptions`. */
export interface EmitMethod<TEvents extends EventRecord> {
  emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EmitOptions): this;
}

/**
 * Listeners registered for exactly this event name.
 *
 * Excludes `*` subscriptions — see
 * [Wildcards](../api/README.md#wildcards).
 */
export interface GetListenerMethod<TEvents extends EventRecord> {
  getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[];
}

/**
 * Returns a namespaced view over the same event bus.
 *
 * `name` is a string prefix, not an event in `TEvents` — you can open a channel
 * for a namespace that no listener has been registered for yet. It is not
 * required to line up with a delimiter boundary, but in practice it always does:
 * a channel only ever emits `<name><delimiter><event>`, so `channel('user')`
 * reaches exactly the `'user:…'` names and nothing else.
 *
 * The corollary is worth stating because it looks like it should work and does
 * not: a prefix of `'user'` does **not** claim `'username:verify'`.
 * {@link ChannelEvents} drops that key rather than re-labelling it, because the
 * match is textual and `'username:verify'` is a different namespace that merely
 * starts with the same letters. Use `channel('username')` for it.
 */
export interface ChannelMethod<TEvents extends EventRecord> {
  channel<TPrefix extends EventType, TChannelEvents extends ChannelEvents<TPrefix, TEvents> = ChannelEvents<TPrefix, TEvents>>(name: TPrefix): Channel<TChannelEvents>;
}

/**
 * Releases resources held by the implementation.
 *
 * Idempotent, and must leave nothing pending — a teardown that leaves a timer
 * armed keeps the host process alive.
 */
export interface ShutdownMethod {
  shutdown(): void;
}

/** Emits to local listeners and floods the reachable mesh. */
export interface BroadcastMethod<TEvents extends EventRecord> {
  broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this;
}

/**
 * Resolves with the payload of the next emit of the event.
 *
 * Rejects on timeout. One-shot: it settles once and unsubscribes.
 */
export interface WatchMethod<TEvents extends EventRecord> {
  watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>>;
}
