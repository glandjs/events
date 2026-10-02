import { generateUUID } from './utils';
import { BrokerChannel } from './broker-channel';
import type {
  Broker,
  BrokerId,
  BrokerOptions,
  BrokerConnection,
  Channel,
  ChannelEvents,
  ConnectionOptions,
  EventOptions,
  EventPayload,
  EventRecord,
  EventReturn,
  EmitOptions,
  Events,
  EventType,
  Listener,
} from './common';
import { EventEmitter } from './engine/event-emitter';

/**
 * Bookkeeping for one event id as it travels the mesh.
 *
 * `visited` exists to make the dedup rule explicit and assertable: a broker
 * records itself the first time it processes an id, and from then on treats that
 * id as spent.
 */
export interface EventTrace {
  /** Correlation id threaded through every hop of one logical event. */
  eventId: EventType;
  /** Broker that started the event, or the last one to re-emit it. */
  sourceId: BrokerId;
  /** Ids of the brokers that have processed this event. */
  visited: Set<BrokerId>;
  /** Wall-clock time of first processing. */
  timestamp: number;
}

/**
 * Upper bound on retained traces.
 *
 * Every emit mints a fresh id, so the trace map would otherwise grow for the
 * life of the process. Eviction is FIFO — a `Map` preserves insertion order, so
 * dropping the first key drops the oldest trace. Sized well above the number of
 * concurrently in-flight events so that dedup is never the reason a trace is
 * lost on a live path.
 */
const MAX_TRACES = 4096;

/**
 * A broker: a named event bus that can be wired to other brokers.
 *
 * Two things sit on top of {@link EventEmitter}:
 *
 * - **Channels** — a namespaced façade, so `'user:login'` can be owned by the
 *   `user` part of the system without anyone agreeing on a prefix constant.
 * - **Connections** — an explicit graph of brokers, plus the rules for moving an
 *   event across it.
 *
 * The broker owns routing; the emitter owns fan-out. Nothing here knows about
 * HTTP, sockets or queues, which is what lets an adapter live outside this
 * package.
 *
 * @example
 * interface AppEvents {
 *   'user:login': { id: string };
 *   'user:validate': IOEvent<{ name: string }, boolean>;
 * }
 *
 * const broker = new EventBroker<AppEvents>({ name: 'app' });
 * broker.on('user:login', (p) => audit(p));
 * broker.emit('user:login', { id: 'u1' });
 */
export class EventBroker<TEvents extends EventRecord> implements Broker<TEvents> {
  /** Unique identity in the mesh. Immutable for the broker's lifetime. */
  private readonly _id: BrokerId;
  private readonly _emitter: EventEmitter<TEvents>;

  /** Peer id → that peer plus the events it asked to receive automatically. */
  private readonly _connections = new Map<BrokerId, BrokerConnection>();

  /** Channel name → channel. Cached so `broker.channel('user')` is referentially stable. */
  private readonly _channels = new Map<EventType, Channel<EventRecord>>();

  /** Correlation id → what we already did with it. Bounded by {@link MAX_TRACES}. */
  private readonly _eventTraces = new Map<EventType, EventTrace>();

  constructor(public options: BrokerOptions) {
    this.options = this.normalizeOptions(options);
    this._id = this.options.name;
    this._emitter = new EventEmitter<TEvents>(this.options.delimiter, this.options.cacheSize, this.options.defaultTimeout, this.options.maxListeners);
  }

  /** This broker's id, as supplied by `BrokerOptions.name`. */
  public get id(): BrokerId {
    return this._id;
  }

  /**
   * Subscribes to an event.
   *
   * See {@link EventEmitter.on} for the two modes. Listener budget, `null`
   * rejection and `{ watch: true }` all behave exactly as they do on the
   * emitter — the broker only adds routing on top.
   *
   * @example
   * broker.on('user:login', (p) => audit(p));
   * const next = await broker.on('user:login', null, { watch: true, timeout: 5_000 });
   */
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    // Watch mode ignores `listener` entirely — the emitter resolves a promise instead.
    const result = options?.watch ? this._emitter.on(event, null, options as EventOptions & { watch: true }) : this._emitter.on(event, listener as Listener<EventPayload<TEvents, K>, void>, options);
    return result instanceof Promise ? result : this;
  }

  /**
   * Removes a listener, or all listeners for the event when `listener` is omitted.
   *
   * Removing a listener never removes a connection. Auto-forwarding configured
   * by {@link EventBroker.connectTo} is routing state, not a listener, so it is
   * unaffected by `off`.
   */
  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    this._emitter.off(event, listener);
    return this;
  }

  /**
   * Delivers `payload` to local listeners, then routes it across connections.
   *
   * **Dedup.** An event is processed at most once per `eventId` on a given
   * broker. `emit` with an `_eventId` this broker has already seen is dropped
   * before the listeners run. This is what makes a mesh terminate: the origin
   * suppresses the copy that comes back around.
   *
   * **Routing.** A connection receives the event when either
   *
   * - `options._propagate` is set — mesh broadcast, hops peer to peer; or
   * - the event is in that connection's `ConnectionOptions.events` — a
   *   single, targeted forward.
   *
   * Either way the same `eventId` travels with it, so a targeted forward cannot
   * echo back into the sender.
   *
   * **Errors.** A peer that throws aborts the remaining peers unless
   * `ignoreErrors` is set. It never protects the local listeners — those run
   * before any peer is contacted.
   *
   * @example
   * broker.emit('user:login', { id: 'u1' });          // local only
   * broker.emit('user:login', { id: 'u1' }, { _propagate: true }); // one hop
   */
  public emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EmitOptions): this {
    const eventId = options?._eventId || generateUUID();
    const sourceId = options?._sourceId || this._id;
    const propagate = options?._propagate ?? false;

    if (this.hasProcessedEvent(eventId)) {
      return this;
    }

    this.trackEvent(eventId, sourceId);
    this._emitter.emit(event, payload, options);

    for (const connection of this._connections.values()) {
      const forwardedBySubscription = connection.forward?.has(event) === true;
      if (!propagate && !forwardedBySubscription) {
        continue;
      }

      try {
        connection.broker.emit(event, payload, {
          ...options,
          _eventId: eventId,
          _sourceId: sourceId,
          _propagate: propagate,
        });
      } catch (error) {
        if (!this.options.ignoreErrors) {
          throw error;
        }
      }
    }

    return this;
  }

  /**
   * Subscribes for exactly one emit, then unsubscribes.
   *
   * A `once` handler still counts against `maxListeners` while it is pending,
   * and still runs once per routed event — a broadcast reaches each peer, and
   * each peer's `once` consumes its own subscription.
   */
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public once<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const result = options?.watch
      ? this._emitter.once(event, null, options as EventOptions & { watch: true })
      : this._emitter.once(event, listener as Listener<EventPayload<TEvents, K>, void>, options);
    return result instanceof Promise ? result : this;
  }

  /**
   * Resolves with the payload of the next emit of `event`.
   *
   * Local only — `watch` never crosses a connection. To await something from
   * another broker, that broker's emit must reach this one first (via
   * `broadcast`, `emitTo`, or a `ConnectionOptions.events` forward), and only
   * then does this watcher fire.
   *
   * @throws rejects with `Event '<name>' timed out after <ms>ms` on timeout.
   */
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    return this._emitter.watch(event, timeoutMs);
  }

  /**
   * Listeners registered for **exactly** this event name. See
   * {@link EventEmitter.getListener} for why wildcards are excluded.
   */
  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    return this._emitter.getListener(event);
  }

  /**
   * Invokes listeners synchronously and returns their result — a request, not a
   * notification.
   *
   * This is what makes {@link IOEvent} return types meaningful, and it is why an
   * event that should be answerable is declared as one.
   *
   * - default — the **first** listener's return value
   * - `'all'` — every listener's return value, in registration order
   *
   * Returns `[]` when nothing is listening, in both modes. That is deliberate:
   * an unanswered request is a result the caller can branch on, rather than an
   * `undefined` that looks like a handler returned nothing.
   *
   * @example
   * broker.on('user:validate', (d) => d.name.length > 0);
   * broker.on('user:validate', (d) => d.age >= 18);
   *
   * broker.call('user:validate', data);        // first handler's answer
   * broker.call('user:validate', data, 'all'); // [nameOk, ageOk]
   *
   * const results = broker.call('user:validate', data, 'all');
   * const valid = results.length > 0 && results.every(Boolean);
   */
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K> | EventReturn<TEvents, K>[] {
    const listeners = this.getListener(event);

    if (!listeners.length) {
      return [];
    }

    if (strategy === 'all') {
      return listeners.map((listener) => listener(data));
    }
    return listeners[0]!(data);
  }

  /**
   * Returns the cached channel for `name`, creating it on first use.
   *
   * Every call with the same name returns the **same instance**, so a channel
   * can be captured once and shared. A channel is a naming convenience, not a
   * separate bus: `broker.channel('user').emit('login', p)` and
   * `broker.emit('user:login', p)` are the same call.
   *
   * @example
   * const user = broker.channel('user');
   * user.on('login', (p) => audit(p));
   * user.emit('login', { id: 'u1' }); // reaches 'user:login'
   */
  public channel<TPrefix extends EventType, TChannelEvents extends ChannelEvents<TPrefix, TEvents> = ChannelEvents<TPrefix, TEvents>>(name: TPrefix): Channel<TChannelEvents> {
    const existing = this._channels.get(name);
    if (existing) {
      // Safe: a channel cached under `name` was built with this same TPrefix.
      return existing as Channel<TChannelEvents>;
    }

    const channel = new BrokerChannel<TChannelEvents, TPrefix>(this, name, this.options.delimiter);
    this._channels.set(name, channel as unknown as Channel<EventRecord>);
    return channel;
  }

  /**
   * Emits to local listeners and floods the whole reachable mesh.
   *
   * Every broker in the connected component receives it exactly once, no matter
   * how many paths lead there. Unreachable brokers are unaffected.
   *
   * @example
   * broker.broadcast('config:changed', { version: 2 });
   */
  public broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    this.emit(event, payload, {
      ...options,
      _eventId: generateUUID(),
      _sourceId: this._id,
      _propagate: true,
    });
    return this;
  }

  /**
   * Emits once on `target` directly, bypassing this broker's connections.
   *
   * A single, addressed delivery — the target processes the event locally but
   * does not relay it onward, and does not echo it back.
   *
   * @example
   * broker.send('user:login', { id: 'u1' }, peer);
   */
  public send<K extends Events<TEvents>>(event: K, target: EventBroker<TEvents>, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    target.emit(event, payload, {
      ...options,
      _eventId: generateUUID(),
      _sourceId: this._id,
      _propagate: false,
    });
    return this;
  }

  /**
   * Adds a peer to the mesh. Connections are mutual.
   *
   * `options.events` is a standing forward: every emit of those events on this
   * broker is also delivered to that peer, with no per-message effort from the
   * caller. Forwarding rides on the same `eventId` as the original, so it
   * cannot loop — a peer that re-emits the event is suppressed by dedup.
   *
   * Connecting the same peer twice is a no-op; the first `options` wins.
   *
   * @throws if `broker` is missing an id, or is this broker.
   *
   * @example
   * broker.connectTo(httpAdapter, { events: ['route:registered'] });
   */
  public connectTo<TOtherEvents extends EventRecord>(broker: EventBroker<TOtherEvents>, options?: ConnectionOptions): this {
    if (!broker || !broker.id) {
      throw new Error('Invalid broker');
    }
    if (broker.id === this._id) {
      throw new Error(`Cannot connect broker "${this._id}" to itself`);
    }
    if (this._connections.has(broker.id)) {
      return this;
    }

    const forward = options?.events?.length ? new Set<EventType>(options.events) : undefined;
    this._connections.set(broker.id, { broker, forward });

    if (typeof broker.connectTo === 'function' && !broker.isConnected(this._id)) {
      broker.connectTo(this, options);
    }

    return this;
  }

  /**
   * Removes a peer, both directions.
   *
   * Stops forwarding and propagation through that link immediately. Returns
   * `true` if a link was removed.
   *
   * Peers still reachable by another path remain in the mesh.
   */
  public disconnect(brokerId: BrokerId): boolean {
    const connection = this._connections.get(brokerId);
    const removed = this._connections.delete(brokerId);

    if (removed && connection && typeof connection.broker.disconnect === 'function') {
      connection.broker.disconnect(this._id);
    }

    return removed;
  }

  /** Whether a direct link to `brokerId` exists. */
  public isConnected(brokerId: BrokerId): boolean {
    return this._connections.has(brokerId);
  }

  /**
   * Emits on the peer identified by `brokerId`.
   *
   * Unlike {@link EventBroker.broadcast}, this only works across an existing
   * connection. Returns `false` when there is no such link, which lets a caller
   * distinguish "delivered" from "not connected" without a try/catch.
   */
  public emitTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): boolean {
    const connection = this._connections.get(brokerId);
    if (!connection) {
      return false;
    }

    connection.broker.emit(event, payload, {
      ...options,
      _eventId: generateUUID(),
      _sourceId: this._id,
      _propagate: false,
    });
    return true;
  }

  /**
   * Wires `brokers` into a fully connected mesh and includes this broker in it.
   *
   * Connects this broker to each entry, then connects the entries to each other,
   * so every broker reaches every other. That is the point: any broker can then
   * `broadcast`, and every other broker receives it exactly once.
   *
   * @example
   * registry.createConnections([http, ws, queue]);
   */
  public createConnections<TOtherEvents extends EventRecord>(brokers: Array<EventBroker<TOtherEvents>>, options?: ConnectionOptions): this {
    for (const broker of brokers) {
      this.connectTo(broker, options);
    }
    for (let i = 0; i < brokers.length; i++) {
      for (let j = i + 1; j < brokers.length; j++) {
        brokers[i]!.connectTo(brokers[j]!, options);
      }
    }
    return this;
  }

  /** Ids of all directly connected peers, in connection order. */
  public getConnections(): BrokerId[] {
    return Array.from(this._connections.keys());
  }

  /** The peer object for `brokerId`, or `undefined` if not directly connected. */
  public getConnection(brokerId: BrokerId): EventBroker<any> | undefined {
    return this._connections.get(brokerId)?.broker;
  }

  /** Disconnects every peer. Returns `this`. */
  public disconnectAll(): this {
    for (const brokerId of Array.from(this._connections.keys())) {
      this.disconnect(brokerId);
    }
    return this;
  }

  /**
   * Runs `event` on a peer's listeners and returns the result, across the mesh.
   *
   * Delegates to {@link EventBroker.call} on the peer, so `'all'` behaves
   * identically there. Returns `[]` when `brokerId` is not directly connected.
   */
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K> | EventReturn<TEvents, K>[] {
    const connection = this._connections.get(brokerId);
    if (!connection) {
      return [];
    }

    return connection.broker.call(event, data, strategy!) as EventReturn<TEvents, K> | EventReturn<TEvents, K>[];
  }

  /**
   * Emits on each of `brokerIds`.
   *
   * Ids with no connection are skipped silently — use
   * {@link EventBroker.getConnections} first if the caller needs to know.
   */
  public broadcastTo<K extends Events<TEvents>>(brokerIds: BrokerId[], event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    for (const brokerId of brokerIds) {
      this.emitTo(brokerId, event, payload, options);
    }
    return this;
  }

  /**
   * Resolves a broker id to its instance, following connections up to `maxDepth` hops.
   *
   * Useful before reaching for `send`, which takes an instance rather than an id.
   * Returns `this` when asked for its own id, and `undefined` when the id is
   * unreachable within the depth budget.
   *
   * @param maxDepth  Hops allowed. Defaults to `3`.
   *
   * @example
   * const peer = broker.findBroker('http-adapter');
   * if (peer) broker.send('shutdown', peer, undefined);
   */
  public findBroker(brokerId: BrokerId, maxDepth: number = 3): EventBroker<any> | undefined {
    if (this._id === brokerId) {
      return this;
    }

    const direct = this._connections.get(brokerId);
    if (direct) {
      return direct.broker;
    }

    if (maxDepth <= 0) {
      return undefined;
    }

    for (const [, connection] of this._connections) {
      const found = connection.broker.findBroker(brokerId, maxDepth - 1);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  /**
   * Releases all listeners, connections, channels and pending watchers.
   *
   * Peers are told, not just forgotten: the local connection map is cleared the
   * same way {@link EventBroker.disconnect} clears it, so no peer is left holding
   * a link to a broker that will never process anything again.
   *
   * Idempotent, and leaves nothing pending — watchers are rejected rather than
   * left to time out, so a `shutdown()` in a test teardown cannot keep the
   * process alive. The broker may be reused afterwards.
   */
  public shutdown(): void {
    this._emitter.shutdown();
    this.disconnectAll();
    this._channels.clear();
    this._eventTraces.clear();
  }

  /** Starts or refreshes the trace for `eventId`, evicting the oldest if full. */
  private trackEvent(eventId: EventType, sourceId: BrokerId): EventTrace {
    const existing = this._eventTraces.get(eventId);
    if (existing) {
      existing.visited.add(this._id);
      return existing;
    }

    if (this._eventTraces.size >= MAX_TRACES) {
      const oldest = this._eventTraces.keys().next().value;
      if (oldest !== undefined) {
        this._eventTraces.delete(oldest);
      }
    }

    const trace: EventTrace = {
      eventId,
      sourceId,
      visited: new Set([this._id]),
      timestamp: Date.now(),
    };
    this._eventTraces.set(eventId, trace);
    return trace;
  }

  /** True once this broker has processed `eventId`. */
  private hasProcessedEvent(eventId: EventType): boolean {
    return this._eventTraces.get(eventId)?.visited.has(this._id) === true;
  }

  /** Fills in every optional option so the rest of the class reads no `??`. */
  private normalizeOptions(options: BrokerOptions): BrokerOptions {
    return {
      name: options.name,
      cacheSize: options.cacheSize ?? 6,
      delimiter: options.delimiter ?? ':',
      ignoreErrors: options.ignoreErrors ?? false,
      defaultTimeout: options.defaultTimeout ?? 1000,
      maxListeners: options.maxListeners ?? 5,
    };
  }
}
