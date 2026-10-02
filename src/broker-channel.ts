import type { EventBroker } from './broker';
import type { BrokerOptions, Channel, ChannelEvents, EventOptions, EventPayload, EventRecord, EventReturn, EventType, Events, Listener } from './common';

/**
 * A namespaced view over a broker's event bus.
 *
 * A channel owns no bus of its own. Every method rewrites `event` into
 * `<name><delimiter><event>` and delegates to the broker, so these two lines
 * are the same call:
 *
 * ```ts
 * broker.channel('user').emit('login', payload);
 * broker.emit('user:login', payload);
 * ```
 *
 * What the channel buys is **ownership of a prefix**. A module that owns `user`
 * emits `'login'` and never writes the prefix itself, so a namespace collision
 * is a design problem rather than a typo. The type system enforces the rest:
 * {@link ChannelEvents} narrows `TEvents` to the keys under the prefix and
 * re-labels them, so `channel.on('loginn')` does not compile and the payload
 * type is already the right one.
 *
 * @example
 * interface AppEvents {
 *   'user:login': { id: string };
 *   'user:logout': { id: string };
 *   'audit:write': { message: string };
 * }
 *
 * const user = broker.channel('user');
 * user.on('login', (p) => track(p.id)); // p: { id: string }
 * user.emit('login', { id: 'u1' });      // 'user:login'
 * user.once('logout', cleanup);          // 'user:logout'
 */
export class BrokerChannel<TEvents extends EventRecord, TPrefix extends EventType> implements Channel<TEvents> {
  constructor(
    private readonly _broker: EventBroker<any>,
    private readonly _name: string,
    private readonly _delimiter: BrokerOptions['delimiter'],
  ) {}

  /** Id of the broker that owns this channel. */
  public get id(): string {
    return this._broker.id;
  }

  /** The namespace prefix, without a trailing delimiter. */
  public get name(): string {
    return this._name;
  }

  /** Builds the fully-qualified event name this channel emits under. */
  private _createEventName<K extends Events<TEvents>>(event: K): `${TPrefix}${EventType}${K}` {
    return `${this.name}${this._delimiter}${event}` as `${TPrefix}${EventType}${K}`;
  }

  /**
   * Subscribes to `<name>:<event>`. See {@link EventEmitter.on} for the two modes.
   */
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const namespaced = this._createEventName(event);
    // Watch mode ignores `listener` entirely — the broker resolves a promise instead.
    const result = options?.watch
      ? this._broker.on(namespaced, null, options as EventOptions & { watch: true })
      : this._broker.on(namespaced, listener as Listener<EventPayload<TEvents, K>, void>, options);
    return result instanceof Promise ? result : this;
  }

  /**
   * Subscribes to `<name>:<event>` for exactly one emit.
   */
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public once<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const namespaced = this._createEventName(event);
    const result = options?.watch
      ? this._broker.once(namespaced, null, options as EventOptions & { watch: true })
      : this._broker.once(namespaced, listener as Listener<EventPayload<TEvents, K>, void>, options);
    return result instanceof Promise ? result : this;
  }

  /**
   * Unsubscribes from `<name>:<event>`.
   *
   * Exact-name only — `off('login')` does not remove a `'*'` subscription made
   * through this channel.
   */
  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    const namespaced = this._createEventName(event);
    this._broker.off(namespaced, listener);
    return this;
  }

  /**
   * Emits `<name>:<event>` on the owning broker.
   *
   * `options` may carry routing metadata, so a channel can broadcast as well as
   * emit locally.
   */
  public emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const namespaced = this._createEventName(event);
    this._broker.emit(namespaced, payload, options);
    return this;
  }

  /**
   * Runs the listeners of `<name>:<event>` and returns their result.
   *
   * Delegates to the broker, so `'all'` behaves identically. Returns `[]` when
   * nothing is listening on the namespaced name.
   */
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K> | EventReturn<TEvents, K>[] {
    const namespaced = this._createEventName(event);
    // The broker is typed `EventBroker<any>`, so its EventReturn is `unknown`;
    // the namespaced name has the same payload/return pair as TEvents[K], which
    // is what the overload promises.
    return (strategy === 'all' ? this._broker.call(namespaced, data, 'all') : this._broker.call(namespaced, data)) as EventReturn<TEvents, K> | EventReturn<TEvents, K>[];
  }

  /**
   * Listeners registered for exactly `<name>:<event>`.
   */
  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    const namespaced = this._createEventName(event);
    return this._broker.getListener(namespaced) as Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[];
  }

  /**
   * Returns a channel one level deeper: `channel('profile')` under `'user'`
   * yields the prefix `'user:profile'`.
   *
   * Delegating to the broker means nested channels are cached there too, so the
   * instance is stable across calls.
   */
  public channel<TNestedPrefix extends string, TNestedEvents extends ChannelEvents<TNestedPrefix, TEvents> = ChannelEvents<TNestedPrefix, TEvents>>(name: TNestedPrefix): Channel<TNestedEvents> {
    const nestedName = `${this.name}${this._delimiter}${name}`;
    return this._broker.channel(nestedName);
  }

  /**
   * Broadcasts `<name>:<event>` to every broker in the mesh.
   */
  public broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const namespaced = this._createEventName(event);
    this._broker.broadcast(namespaced, payload, options);
    return this;
  }

  /**
   * Resolves with the next emit of `<name>:<event>`.
   *
   * The event name is namespaced before it reaches the watcher, so
   * `user.watch('login')` settles on `user:login` — the same name the rest of
   * the channel speaks.
   */
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    const namespaced = this._createEventName(event);
    return this._broker.watch(namespaced, timeoutMs);
  }
}
