export class EventWatcher<TEvents extends Record<string, any>> {
  private waitingEvents: Map<
    string,
    Array<{
      resolve: (payload: TEvents[string]) => void;
      reject: (reason: Error) => void;
      timer: NodeJS.Timeout;
    }>
  > = new Map();
  constructor(private readonly timeout: number) {}

  public watch<K extends keyof TEvents & string>(eventName: K, timeoutMs?: number): Promise<TEvents[K]> {
    const timeout = timeoutMs ?? this.timeout;

    return new Promise<TEvents[K]>((resolve, reject) => {
      if (!this.waitingEvents.has(eventName)) {
        this.waitingEvents.set(eventName, []);
      }

      const timer = setTimeout(() => {
        this.cleanupEvent(eventName, timer);
        console.warn(`Event '${eventName}' timed out after ${timeout}ms`);
        reject(new Error(`Event '${eventName}' timed out after ${timeout}ms`));
      }, timeout);

      this.waitingEvents.get(eventName)!.push({
        resolve,
        reject,
        timer,
      });
    });
  }

  public onEmit<K extends keyof TEvents & string>(eventName: K, payload: TEvents[K]): void {
    const waiters = this.waitingEvents.get(eventName);

    if (!waiters || waiters.length === 0) {
      return;
    }
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
    this.waitingEvents.delete(eventName);
  }

  private cleanupEvent<K extends keyof TEvents & string>(eventName: K, timer: NodeJS.Timeout): void {
    const waiters = this.waitingEvents.get(eventName);
    if (!waiters) return;

    const index = waiters.findIndex((w) => w.timer === timer);
    if (index !== -1) {
      waiters.splice(index, 1);
    }

    if (waiters.length === 0) {
      this.waitingEvents.delete(eventName);
    }
  }

  public dispose(): void {
    for (const waiters of this.waitingEvents.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
      }
    }

    this.waitingEvents.clear();
  }
}
