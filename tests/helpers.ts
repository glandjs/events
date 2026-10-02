import { EventBroker } from '../src';
import type { BrokerOptions, EventRecord, IOEvent } from '../src';

/**
 * The event map most tests share.
 *
 * It is deliberately varied, because a single-shape map hides type bugs that a
 * real application hits immediately:
 *
 * - `'user:login'` — plain object payload, no return value
 * - `'user:validate'` — an {@link IOEvent}, so `call` has something to return
 * - `'message:new'` — a bare string, to prove payloads are not assumed to be objects
 * - `'ping'` — `void`, to prove a payloadless event still typechecks
 * - `'audit:write'` — a second namespace, for channel isolation tests
 */
/**
 * The event map most tests share.
 *
 * A **type alias**, deliberately. Extending `EventRecord` instead would add a
 * string index signature and silently widen every event name to `string`,
 * turning off the type checking the rest of this suite relies on. See the
 * warning on {@link EventRecord}.
 *
 * It is also deliberately varied, because a single-shape map hides type bugs a
 * real application hits immediately:
 *
 * - `'user:login'` — plain object payload, no return value
 * - `'user:validate'` — an {@link IOEvent}, so `call` has something to return
 * - `'message:new'` — a bare string, to prove payloads are not assumed to be objects
 * - `'ping'` — `void`, to prove a payloadless event still typechecks
 * - `'audit:write'` — a second namespace, for channel isolation tests
 * - `'user:profile:viewed'` — a nested namespace, for channel nesting tests
 */
export type TestEvents = {
  'user:login': { id: string; username: string };
  'user:logout': { id: string };
  'user:validate': IOEvent<{ name: string; age: number }, boolean>;
  'user:profile:viewed': { id: string };
  'message:new': string;
  'audit:write': { message: string };
  ping: void;
};

/**
 * Creates brokers and guarantees they are torn down.
 *
 * Every test in this suite creates at least one broker, and a broker holds a
 * listener registry, a connection graph and possibly armed timers. Forgetting a
 * `shutdown()` leaks a timer that can keep the run alive, so cleanup is
 * centralised here instead of being repeated — and forgotten — per test.
 *
 * @example
 * const factory = new BrokerFactory();
 * afterEach(() => factory.cleanup());
 *
 * const broker = factory.create<TestEvents>('app');
 */
export class BrokerFactory {
  private readonly created: Array<EventBroker<any>> = [];

  /** Creates a broker and registers it for cleanup. */
  public create<TEvents extends EventRecord>(name: string, options: Omit<BrokerOptions, 'name'> = {}): EventBroker<TEvents> {
    const broker = new EventBroker<TEvents>({ name, ...options });
    this.created.push(broker);
    return broker;
  }

  /**
   * Creates `names.length` brokers wired into a full mesh, returned in order.
   *
   * `broker[0]` is the natural origin for a broadcast, and every other broker is
   * reachable from it — which is the precondition for the mesh tests.
   */
  public mesh(names: string[], options: Omit<BrokerOptions, 'name'> = {}): Array<EventBroker<TestEvents>> {
    const brokers = names.map((name) => this.create<TestEvents>(name, options));
    if (brokers.length > 1) {
      brokers[0]!.createConnections(brokers.slice(1));
    }
    return brokers;
  }

  /** Shuts down every broker created by this factory. Safe to call twice. */
  public cleanup(): void {
    for (const broker of this.created) {
      broker.shutdown();
    }
    this.created.length = 0;
  }
}

/** Resolves after `ms`, for tests that need to let a timeout settle. */
export function delay(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collects what reached a listener, without asserting.
 *
 * Most mesh tests want to assert on *which* brokers received an event and how
 * many times, so this is the shape they all reduce to.
 *
 * @example
 * const inbox = createInbox(mesh);
 * mesh[0].broadcast('message:new', 'hi');
 * expect(inbox.counts()).toEqual({ 'broker-1': 1, 'broker-2': 1 });
 */
export function createInbox<TEvents extends EventRecord>(brokers: Array<EventBroker<TEvents>>, event: keyof TEvents & string) {
  const received = new Map<string, unknown[]>();

  for (const broker of brokers) {
    const entries: unknown[] = [];
    received.set(broker.id, entries);
    broker.on(event as any, ((payload: unknown) => entries.push(payload)) as any);
  }

  return {
    /** Payloads seen by each broker id. */
    payloads(): Record<string, unknown[]> {
      return Object.fromEntries(received);
    },
    /** How many times each broker saw the event. */
    counts(): Record<string, number> {
      return Object.fromEntries([...received].map(([id, entries]) => [id, entries.length]));
    },
    /** Total deliveries across the mesh — the exactly-once assertion. */
    total(): number {
      let sum = 0;
      for (const entries of received.values()) sum += entries.length;
      return sum;
    },
    /** Ids that never received the event. */
    missed(): string[] {
      return [...received].filter(([, entries]) => entries.length === 0).map(([id]) => id);
    },
  };
}
