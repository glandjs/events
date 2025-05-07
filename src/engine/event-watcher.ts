import { WatchMethod, type EventPayload, type Events, type EventType, type ShutdownMethod } from '../common';
export class EventWatcher<TEvents extends Record<string, any>> implements WatchMethod<TEvents>, ShutdownMethod {
  private waitingEvents: Map<
    string,
    Array<{
      resolve: (payload: TEvents[string]) => void;
      reject: (reason: Error) => void;
      timer: NodeJS.Timeout;
    }>
  > = new Map();
  constructor(private readonly timeout: number) {}

  watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    const timeout = timeoutMs ?? this.timeout;

    return new Promise<TEvents[K]>((resolve, reject) => {
      if (!this.waitingEvents.has(event)) {
        this.waitingEvents.set(event, []);
      }

      const timer = setTimeout(() => {
        this.cleanupEvent(event, timer);
        console.warn(`Event '${event}' timed out after ${timeout}ms`);
        reject(new Error(`Event '${event}' timed out after ${timeout}ms`));
      }, timeout);

      this.waitingEvents.get(event)!.push({
        resolve,
        reject,
        timer,
      });
    });
  }

  public onEmit<K extends Events<TEvents>>(event: K, payload: TEvents[K]): void {
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

  private cleanupEvent<K extends keyof TEvents & string>(event: K, timer: NodeJS.Timeout): void {
    const waiters = this.waitingEvents.get(event);
    if (!waiters) return;

    const index = waiters.findIndex((w) => w.timer === timer);
    if (index !== -1) {
      waiters.splice(index, 1);
    }

    if (waiters.length === 0) {
      this.waitingEvents.delete(event);
    }
  }

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
