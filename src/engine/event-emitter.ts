import { EventEmitter as GlandEventEmitter } from '@glandjs/emitter';
import { EventWatcher } from './event-watcher';
import type { EventOptions, EventPayload, EventRecord, EventReturn, EventType, GetListenerMethod, Listener, OffMethod, OnMethod, ShutdownMethod, WatchMethod, OnceMethod, Events } from '../common';

/**
 * Single-node pub/sub: listener registry, watcher registry, and the `maxListeners`
 * guard that keeps a subscription leak from turning into a slow memory leak.
 *
 * The listener tree itself lives in `@glandjs/emitter` (segment-based lookup,
 * `*` wildcards, and a hot-path cache). This class adds the two things a broker
 * needs on top of it and a raw emitter cannot provide:
 *
 * 1. **Promise observation** via {@link EventWatcher}.
 * 2. **A listener budget**, so registering the 6th handler on a hot event fails
 *    loudly instead of quietly accumulating.
 *
 * It also keeps its own record of registrations. `getListener` could walk the
 * underlying tree directly, but the tree's field names are private to
 * `@glandjs/emitter` and have already changed once — reaching into them would
 * make this class silently return zero listeners on a dependency bump.
 *
 * @example
 * const emitter = new EventEmitter<{ ping: number }>();
 *
 * emitter.on('ping', (n) => console.log(n));
 * emitter.emit('ping', 1);
 *
 * const first = await emitter.watch('ping', 1000);
 */
export class EventEmitter<TEvents extends EventRecord> implements OnMethod<TEvents>, OnceMethod<TEvents>, OffMethod<TEvents>, GetListenerMethod<TEvents>, ShutdownMethod, WatchMethod<TEvents> {
  private readonly emitter: GlandEventEmitter;
  private readonly watcher: EventWatcher<TEvents>;

  /** Exact event name → the listeners this class registered for it. */
  private readonly listeners = new Map<EventType, Array<Listener<any, any>>>();

  private readonly maxListeners: number;
  private readonly defaultTimeout: number;
  private readonly defaultOptions: EventOptions;

  /**
   * @param separator  Segment delimiter for event names. `':'` matches the default in `@glandjs/emitter`.
   * @param cacheSize  How many event names the underlying emitter keeps resolved. `6` matches its own default.
   * @param timeout    Default timeout in ms for {@link EventEmitter.watch}.
   * @param maxListeners  Listener budget per event name.
   */
  constructor(separator?: string, cacheSize?: number, timeout = 1000, maxListeners = 5) {
    this.emitter = new GlandEventEmitter(separator, cacheSize);
    this.watcher = new EventWatcher<TEvents>(timeout);
    this.maxListeners = maxListeners;
    this.defaultTimeout = timeout;
    this.defaultOptions = {
      watch: false,
      timeout,
      defaultValue: undefined,
    };
  }

  /**
   * Subscribes to `event`.
   *
   * Two modes, chosen by the `watch` option:
   *
   * - `on(event, listener)` — registers a listener and returns `this`.
   * - `on(event, null, { watch: true })` — resolves with the next payload for
   *   `event`, as a promise. `listener` must be omitted in this mode.
   *
   * @throws if `listener` is null/absent without `watch: true`.
   * @throws if the event already holds `maxListeners` listeners.
   *
   * @example
   * broker.on('user:login', (p) => audit(p));
   * const payload = await broker.on('user:login', null, { watch: true, timeout: 5_000 });
   */
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    if (mergedOptions.watch) {
      return this.watchWithFallback(event, mergedOptions);
    }

    if (!listener) {
      throw new Error(`Listener cannot be null unless 'watch: true' is explicitly set in options.`);
    }

    this.assertListenerBudget(event);
    this.register(event, listener);
    return this;
  }

  /**
   * Resolves with the payload of the next emit of `event`.
   *
   * @param timeoutMs Overrides the constructor default.
   * @throws rejects with `Event '<name>' timed out after <ms>ms` if nothing arrives in time.
   */
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    return this.watcher.watch(event, timeoutMs ?? this.defaultTimeout);
  }

  /**
   * Removes one listener, or every listener for `event` when `listener` is omitted.
   *
   * Removal is exact-name only: `off('user:login')` leaves a `'user:*'`
   * subscription in place.
   */
  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    this.emitter.off(event, listener);

    const registered = this.listeners.get(event);
    if (!registered) return this;

    if (listener) {
      const index = registered.indexOf(listener);
      if (index !== -1) registered.splice(index, 1);
    } else {
      registered.length = 0;
    }

    if (registered.length === 0) {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * Delivers `payload` to every listener of `event`, then settles watchers.
   *
   * Watchers are settled **before** listeners run, so a `watch` promise does not
   * depend on any listener having been registered.
   *
   * With `{ watch: true }` the emitter also opens a fresh watcher for the event.
   * Its rejection is swallowed: the promise is not handed to the caller, so a
   * timeout there is not an unhandled rejection — it just means nothing
   * listened.
   *
   * @example
   * emitter.emit('user:login', { id: 'u1' });
   * emitter.emit('app:tick', Date.now(), { watch: true, timeout: 250 });
   */
  public emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): void {
    this.watcher.onEmit(event, payload);

    this.emitter.emit(event, payload);

    if (options?.watch) {
      // Nothing to hand the promise to; see the note above.
      this.watchWithFallback(event, { timeout: options.timeout, defaultValue: options.defaultValue }).catch(() => {});
    }
  }

  /**
   * Subscribes for exactly one emit, then unsubscribes itself.
   *
   * Honours the same `maxListeners` budget as {@link EventEmitter.on}, and the
   * same `{ watch: true }` mode.
   */
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public once<K extends Events<TEvents>>(event: K, listener: null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    if (mergedOptions.watch) {
      return this.watchWithFallback(event, mergedOptions);
    }

    if (!listener) {
      throw new Error(`Listener cannot be null unless 'watch: true' is explicitly set in options.`);
    }

    this.assertListenerBudget(event);

    const wrapper: Listener<EventPayload<TEvents, K>> = (payload) => {
      // Detach before invoking, so a re-entrant emit inside the listener does
      // not run this handler a second time.
      this.off(event, wrapper as Listener<EventPayload<TEvents, K>, void>);
      listener(payload);
    };

    this.register(event, wrapper);
    return this;
  }

  /**
   * Listeners registered for **exactly** this event name.
   *
   * `*` subscriptions are not included — see
   * [Wildcards](docs/api/README.md#wildcards). This is also the list `call`
   * walks, which is what makes `call` deterministic: it never has to guess
   * whether a wildcard handler should answer a request.
   *
   * @example
   * emitter.on('user:login', audit);
   * emitter.getListener('user:login'); // [audit]
   * emitter.getListener('user:logout'); // []
   */
  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    const registered = this.listeners.get(event);
    return registered ? (registered.slice() as Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[]) : [];
  }

  /**
   * Releases every listener and rejects every pending watcher.
   *
   * Idempotent. The instance stays usable afterwards — registering again simply
   * starts from an empty registry, which is what a test teardown wants and what
   * a broker restart wants.
   */
  public shutdown(): void {
    for (const event of this.listeners.keys()) {
      this.emitter.off(event);
    }
    this.listeners.clear();
    this.watcher.shutdown();
  }

  /**
   * Runs a watcher, substituting `defaultValue` for a timeout.
   *
   * `defaultValue` is tested with `!== undefined` rather than truthiness, so
   * `0`, `''`, `false` and `null` are all usable as fallbacks.
   */
  private watchWithFallback<K extends Events<TEvents>>(event: K, options: { timeout?: number; defaultValue?: unknown }): Promise<EventPayload<TEvents, K>> {
    return this.watcher.watch(event, options.timeout ?? this.defaultTimeout).then(
      (payload) => payload,
      (error: unknown) => {
        if (options.defaultValue !== undefined) {
          return options.defaultValue as EventPayload<TEvents, K>;
        }
        throw error;
      },
    );
  }

  /** Records a registration and hands the listener to the underlying emitter. */
  private register(event: EventType, listener: Listener<any, any>): void {
    const registered = this.listeners.get(event);
    if (registered) {
      registered.push(listener);
    } else {
      this.listeners.set(event, [listener]);
    }
    this.emitter.on(event, listener);
  }

  /** @throws when the event has no room left, naming the budget and the event. */
  private assertListenerBudget(event: EventType): void {
    const current = this.listeners.get(event)?.length ?? 0;
    if (current >= this.maxListeners) {
      throw new Error(`Maximum listeners (${this.maxListeners}) exceeded for event '${event}'`);
    }
  }
}
