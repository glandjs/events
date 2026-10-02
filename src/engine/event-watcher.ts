import type { EventPayload, EventRecord, Events, ShutdownMethod, WatchMethod } from '../common';

/**
 * One pending `watch` request.
 *
 * `timer` is kept so it can be cleared the moment the promise settles — either
 * because the event arrived, or because {@link EventWatcher.shutdown} ran. A
 * leak here is a live `setTimeout` for the full timeout window.
 */
interface Waiter<TPayload> {
  resolve: (payload: TPayload) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Promise-based observer: turns "emit an event" into "await an event".
 *
 * The watcher is deliberately separate from the emitter. A listener is fire and
 * forget; a watcher is a caller blocked on a future occurrence, and the two
 * need different bookkeeping — a watcher owns a timer and a settle path, a
 * listener owns neither.
 *
 * All waiters registered for the same event are settled by the first matching
 * emit, then dropped. A watcher is one-shot: it resolves once and unsubscribes
 * itself, which is what makes `await broker.watch('ready')` safe to write at
 * the top of a function.
 *
 * @example
 * const ready = broker.watch('app:ready', 5_000);
 * await bootstrap();
 * const payload = await ready;
 */
export class EventWatcher<TEvents extends EventRecord> implements WatchMethod<TEvents>, ShutdownMethod {
  /** Event name → the waiters still blocked on it. Absent key means "nobody waiting". */
  private readonly waitingEvents = new Map<string, Array<Waiter<any>>>();

  constructor(private readonly timeout: number) {}

  /**
   * Total number of unsettled watchers across all events.
   *
   * Exposed so teardown paths (and tests) can assert that nothing was left
   * holding a timer.
   */
  public get pending(): number {
    let total = 0;
    for (const waiters of this.waitingEvents.values()) {
      total += waiters.length;
    }
    return total;
  }

  /**
   * Resolves with the payload of the next emit of `event`.
   *
   * Rejects with `Event '<name>' timed out after <ms>ms` if no emit arrives in
   * time. Pass `timeoutMs` to override the constructor default for this call.
   */
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    const timeout = timeoutMs ?? this.timeout;

    return new Promise<EventPayload<TEvents, K>>((resolve, reject) => {
      let waiters = this.waitingEvents.get(event);
      if (!waiters) {
        waiters = [];
        this.waitingEvents.set(event, waiters);
      }

      const timer = setTimeout(() => {
        this.removeWaiter(event, timer);
        reject(new Error(`Event '${event}' timed out after ${timeout}ms`));
      }, timeout);

      waiters.push({ resolve, reject, timer });
    });
  }

  /**
   * Settles every watcher registered for `event`.
   *
   * Called by the emitter on every emit, before the listeners run, so that a
   * watcher resolves even when nothing is subscribed via `on`.
   */
  public onEmit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>): void {
    const waiters = this.waitingEvents.get(event);
    if (!waiters || waiters.length === 0) {
      return;
    }

    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
    this.waitingEvents.delete(event);
  }

  /** Drops a single timed-out waiter, removing the event key once it empties. */
  private removeWaiter(event: string, timer: ReturnType<typeof setTimeout>): void {
    const waiters = this.waitingEvents.get(event);
    if (!waiters) return;

    const index = waiters.findIndex((waiter) => waiter.timer === timer);
    if (index !== -1) {
      waiters.splice(index, 1);
    }

    if (waiters.length === 0) {
      this.waitingEvents.delete(event);
    }
  }

  /**
   * Rejects every unsettled watcher and releases all timers.
   *
   * Without this a `shutdown()` in a test teardown leaves timers armed, and the
   * process stays alive until the longest timeout expires.
   */
  public shutdown(): void {
    for (const [event, waiters] of this.waitingEvents.entries()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Watcher shutdown before '${event}' was emitted`));
      }
    }
    this.waitingEvents.clear();
  }
}
