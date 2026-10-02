/**
 * @glandjs/events — shared type vocabulary.
 *
 * Every public surface in this package is parameterised by a single map that
 * describes the events a component understands. The map is the contract: event
 * names are its keys, and payload/return types are its values.
 */

/**
 * A request/response event definition.
 *
 * Only used when an event needs a *return value*. Fire-and-forget events are
 * declared with their payload type directly — `emit` has nothing to hand back.
 *
 * @example
 * interface AppEvents {
 *   'user:login': { id: string };
 *   'user:validate': IOEvent<{ name: string }, boolean>; // answerable via `call`
 * }
 */
export type IOEvent<TPayload = any, TReturn = void> = {
  /** Value handed to every listener. */
  payload: TPayload;
  /** Value produced by `call` / `callTo`. */
  return: TReturn;
};

/** An event name. Always a string; the tree in `@glandjs/emitter` splits on a delimiter. */
export type EventType = string;

/** Unique identity of a broker in a mesh. Set through `BrokerOptions.name`. */
export type BrokerId = string;

/**
 * The shape of every event map this package accepts.
 *
 * ## Do not write `interface MyEvents extends EventRecord`
 *
 * This is the constraint every generic in the package is bounded by, and it is
 * safe in that position — using it as a bound never widens the type argument.
 * It is **not** safe as a base class or interface, because `Record<string, any>`
 * contributes a string index signature:
 *
 * ```ts
 * // ✗ Every event name is now accepted, and every payload is `any`.
 * interface AppEvents extends EventRecord {
 *   'user:login': { id: string };
 * }
 *
 * // ✓ Full checking: names and payloads are both enforced.
 * type AppEvents = {
 *   'user:login': { id: string };
 * };
 *
 * // ✓ Also fine — a plain interface has no index signature.
 * interface AppEvents {
 *   'user:login': { id: string };
 * }
 * ```
 *
 * The failure is silent: no error appears at the declaration, only a sudden
 * absence of errors everywhere afterwards. This is the single easiest way to
 * believe the types are working when they are not.
 */
export type EventRecord = Record<EventType, any>;

/** Narrows an event map to the union of its event names. */
export type Events<TEvents extends EventRecord> = keyof TEvents & string;

/**
 * The payload listeners receive for event `K`.
 *
 * Unwraps `IOEvent` transparently, so `'a': {x: 1}` and `'a': IOEvent<{x: 1}>`
 * both yield `{x: 1}`.
 */
export type EventPayload<TEvents extends EventRecord, K extends Events<TEvents>> = TEvents[K] extends IOEvent<infer P, any> ? P : TEvents[K];

/**
 * The value `call` returns for event `K`.
 *
 * `void` unless the event is an `IOEvent` with a return type — that is what
 * makes `call('user:validate', data)` type-check as a `boolean`.
 */
export type EventReturn<TEvents extends EventRecord, K extends Events<TEvents>> = TEvents[K] extends IOEvent<any, infer R> ? R : void;

/** A subscriber. Return values are ignored by `emit`; `call` collects them. */
export type Listener<Payload = any, Return = void> = (payload: Payload) => Return;

/**
 * Extracts the events belonging to a namespace prefix.
 *
 * `ChannelEvents<'user', AppEvents>` keeps `'user:login'` and `'user:logout'`
 * and re-labels them as `'login'` / `'logout'`, which is exactly the surface a
 * channel exposes.
 */
export type ChannelEvents<TPrefix extends EventType, TEvents extends EventRecord> = {
  [K in keyof TEvents as K extends `${TPrefix}${EventType}${infer Event}` ? Event : never]: TEvents[K];
};

/** How `call` picks among the listeners registered for an event. */
export type CallStrategy = 'all';
