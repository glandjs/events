import { describe, expect, it } from 'bun:test';
import { EventEmitter } from '../../src/engine/event-emitter';
import type { IOEvent } from '../../src';

/** A type alias, not `interface ... extends EventRecord` — see helpers.ts. */
type Events = {
  test: string;
  num: number;
  ready: { id: string };
  answer: IOEvent<{ q: string }, string>;
  wildcardish: void;
};

/** Attaches handlers synchronously so no rejection is ever left unhandled. */
function capture(promise: Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

describe('EventEmitter', () => {
  describe('fan-out', () => {
    it('delivers the payload to a listener', () => {
      const emitter = new EventEmitter<Events>();
      let seen: string | undefined;
      emitter.on('test', (payload) => {
        seen = payload;
      });

      emitter.emit('test', 'hello');

      expect(seen).toBe('hello');
      emitter.shutdown();
    });

    it('calls listeners in registration order', () => {
      const emitter = new EventEmitter<Events>();
      const order: string[] = [];
      emitter.on('test', () => order.push('first'));
      emitter.on('test', () => order.push('second'));
      emitter.on('test', () => order.push('third'));

      emitter.emit('test', 'x');

      expect(order).toEqual(['first', 'second', 'third']);
      emitter.shutdown();
    });

    it('keeps listeners for sibling events apart', () => {
      const emitter = new EventEmitter<Events>();
      const seen: string[] = [];
      emitter.on('ready', (p) => seen.push(`ready:${p.id}`));
      emitter.on('test', (p) => seen.push(`test:${p}`));

      emitter.emit('test', 'a');
      emitter.emit('ready', { id: 'b' });

      expect(seen).toEqual(['test:a', 'ready:b']);
      emitter.shutdown();
    });

    it('does nothing when no listener matches', () => {
      const emitter = new EventEmitter<Events>();
      expect(() => emitter.emit('test', 'orphan')).not.toThrow();
      emitter.shutdown();
    });

    it('propagates a throwing listener to the caller', () => {
      const emitter = new EventEmitter<Events>();
      emitter.on('test', () => {
        throw new Error('boom');
      });

      expect(() => emitter.emit('test', 'x')).toThrow('boom');
      emitter.shutdown();
    });
  });

  describe('off', () => {
    it('removes a single listener and leaves the rest', () => {
      const emitter = new EventEmitter<Events>();
      const calls: string[] = [];
      const first = () => calls.push('first');
      emitter.on('test', first);
      emitter.on('test', () => calls.push('second'));

      emitter.off('test', first);
      emitter.emit('test', 'x');

      expect(calls).toEqual(['second']);
      emitter.shutdown();
    });

    it('removes every listener for the event when none is given', () => {
      const emitter = new EventEmitter<Events>();
      let count = 0;
      emitter.on('test', () => count++);
      emitter.on('test', () => count++);

      emitter.off('test');
      emitter.emit('test', 'x');

      expect(count).toBe(0);
      emitter.shutdown();
    });

    it('is a no-op for an unregistered event or listener', () => {
      const emitter = new EventEmitter<Events>();
      emitter.on('test', () => {});

      expect(() => emitter.off('num')).not.toThrow();
      expect(() => emitter.off('test', () => {})).not.toThrow();
      expect(emitter.getListener('test')).toHaveLength(1);
      emitter.shutdown();
    });

    it('frees the listener budget again', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.on('test', () => {});

      emitter.off('test');
      expect(() => emitter.on('test', () => {})).not.toThrow();
      emitter.shutdown();
    });

    it('leaves a wildcard subscription alone, because removal is exact-name', () => {
      // Documented on `off`: `off('user:login')` removes only the exact name. A
      // wildcard is a different subscription, reached under a different key.
      const emitter = new EventEmitter<Events>();
      const hits: string[] = [];
      (emitter.on as any)('user:*', () => hits.push('wildcard'));
      (emitter.on as any)('user:login', () => hits.push('exact'));

      emitter.off('user:login' as any);
      (emitter.emit as any)('user:login', {});

      expect(hits).toEqual(['wildcard']);
      expect(emitter.getListener('user:*' as any)).toHaveLength(1);
      emitter.shutdown();
    });

    it('removes a wildcard only when addressed by its own name', () => {
      const emitter = new EventEmitter<Events>();
      const hits: string[] = [];
      (emitter.on as any)('user:*', () => hits.push('wildcard'));

      emitter.off('user:*' as any);
      (emitter.emit as any)('user:login', {});

      expect(hits).toEqual([]);
      emitter.shutdown();
    });

    it('frees a once-listener slot when it fires', () => {
      // The wrapper removes itself through `off`, which has to reach the same
      // registry that `assertListenerBudget` counts — otherwise a once-listener
      // would leak its slot for the life of the emitter.
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.once('test', () => {});
      emitter.emit('test', 'x');

      expect(() => emitter.on('test', () => {})).not.toThrow();
      emitter.shutdown();
    });
  });

  describe('once', () => {
    it('fires for the first emit only', () => {
      const emitter = new EventEmitter<Events>();
      let count = 0;
      emitter.once('test', () => count++);

      emitter.emit('test', 'first');
      emitter.emit('test', 'second');
      emitter.emit('test', 'third');

      expect(count).toBe(1);
      emitter.shutdown();
    });

    it('releases its slot, so it can be registered again', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      let first = 0;
      emitter.once('test', () => first++);
      emitter.emit('test', 'x');

      let second = 0;
      expect(() => emitter.once('test', () => second++)).not.toThrow();
      emitter.emit('test', 'y');

      expect(first).toBe(1);
      expect(second).toBe(1);
      emitter.shutdown();
    });

    it('does not fire twice when the listener re-emits', () => {
      const emitter = new EventEmitter<Events>();
      let count = 0;
      emitter.once('test', () => {
        count++;
        emitter.emit('test', 'again');
      });

      emitter.emit('test', 'once');

      expect(count).toBe(1);
      emitter.shutdown();
    });

    it('rejects a null listener outside watch mode', () => {
      const emitter = new EventEmitter<Events>();
      expect(() => (emitter.once as any)('test', null)).toThrow(/Listener cannot be null/);
      emitter.shutdown();
    });
  });

  describe('listener budget', () => {
    it('defaults to five listeners per event', () => {
      const emitter = new EventEmitter<Events>();
      for (let i = 0; i < 5; i++) {
        expect(() => emitter.on('test', () => {})).not.toThrow();
      }

      expect(() => emitter.on('test', () => {})).toThrow("Maximum listeners (5) exceeded for event 'test'");
      emitter.shutdown();
    });

    it('honours a custom budget', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.on('test', () => {});

      expect(() => emitter.on('test', () => {})).toThrow("Maximum listeners (1) exceeded for event 'test'");
      emitter.shutdown();
    });

    it('names the event that overflowed', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 0);
      expect(() => emitter.on('num', () => {})).toThrow(/'num'/);
      emitter.shutdown();
    });

    it('counts the event independently of its siblings', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.on('test', () => {});
      emitter.on('num', () => {});

      expect(emitter.getListener('test')).toHaveLength(1);
      expect(emitter.getListener('num')).toHaveLength(1);
      emitter.shutdown();
    });

    it('applies to once as well as on', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.on('test', () => {});

      expect(() => emitter.once('test', () => {})).toThrow(/Maximum listeners/);
      emitter.shutdown();
    });
  });

  describe('getListener', () => {
    it('returns the registered listeners', () => {
      const emitter = new EventEmitter<Events>();
      const listener = () => {};
      emitter.on('test', listener);

      expect(emitter.getListener('test')).toEqual([listener]);
      emitter.shutdown();
    });

    it('returns a copy, so mutating it cannot corrupt the registry', () => {
      const emitter = new EventEmitter<Events>();
      emitter.on('test', () => {});

      const snapshot = emitter.getListener('test');
      snapshot.push(() => {});
      snapshot.length = 0;

      expect(emitter.getListener('test')).toHaveLength(1);
      emitter.shutdown();
    });

    it('returns an empty array for an unknown event', () => {
      const emitter = new EventEmitter<Events>();
      expect(emitter.getListener('ready')).toEqual([]);
      emitter.shutdown();
    });

    it('excludes wildcard subscriptions, which emit matches', () => {
      // `emit` resolves `*` segments; `getListener` is exact-match on purpose,
      // because `call` depends on it staying predictable. See docs/api/README.md.
      const emitter = new EventEmitter<Events>();
      (emitter.on as any)('user:*', () => {});

      expect(emitter.getListener('user:login' as any)).toEqual([]);
      expect(emitter.getListener('user:*' as any)).toHaveLength(1);
      emitter.shutdown();
    });
  });

  describe('watch', () => {
    it('resolves with the next payload', async () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000);
      const pending = capture(emitter.watch('num', 200));
      emitter.emit('num', 42);

      expect((await pending).value).toBe(42);
      emitter.shutdown();
    });

    it('resolves even when nothing is subscribed via on', async () => {
      const emitter = new EventEmitter<Events>();
      const pending = capture(emitter.watch('ready'));
      emitter.emit('ready', { id: 'lonely' });

      expect((await pending).value).toEqual({ id: 'lonely' });
      emitter.shutdown();
    });

    it('rejects on timeout, naming the event and budget', async () => {
      const emitter = new EventEmitter<Events>();
      const outcome = await capture(emitter.watch('num', 15));

      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toBe("Event 'num' timed out after 15ms");
      emitter.shutdown();
    });

    it('falls back to the constructor timeout', async () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 15);
      const outcome = await capture(emitter.watch('num'));

      expect((outcome.error as Error).message).toBe("Event 'num' timed out after 15ms");
      emitter.shutdown();
    });
  });

  describe('watch mode via on/once', () => {
    it('on(event, null, { watch: true }) resolves', async () => {
      const emitter = new EventEmitter<Events>();
      const pending = capture(emitter.on('test', null, { watch: true, timeout: 200 }));
      emitter.emit('test', 'watched');

      expect((await pending).value).toBe('watched');
      emitter.shutdown();
    });

    it('substitutes defaultValue on timeout', async () => {
      const emitter = new EventEmitter<Events>();
      const outcome = await capture(emitter.on('test', null, { watch: true, timeout: 15, defaultValue: 'fallback' }));

      expect(outcome.ok).toBe(true);
      expect(outcome.value).toBe('fallback');
      emitter.shutdown();
    });

    it('accepts falsy defaultValues, which a truthiness check would swallow', async () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000);

      for (const fallback of [0, '', false] as const) {
        const outcome = await capture(emitter.on('test', null, { watch: true, timeout: 15, defaultValue: fallback }));
        expect(outcome.value).toBe(fallback);
      }
      emitter.shutdown();
    });

    it('accepts null as a defaultValue', async () => {
      // `null` is documented as a usable fallback. It is also the one value that
      // reads as "nothing arrived", so it has to be distinguishable from an
      // absent defaultValue — which rejects instead.
      const emitter = new EventEmitter<Events>();

      const withNull = await capture(emitter.on('test', null, { watch: true, timeout: 15, defaultValue: null }));
      const without = await capture(emitter.on('test', null, { watch: true, timeout: 15 }));

      expect(withNull.ok).toBe(true);
      expect(withNull.value).toBeNull();
      expect(without.ok).toBe(false);
      emitter.shutdown();
    });

    it('rejects when there is no defaultValue', async () => {
      const emitter = new EventEmitter<Events>();
      const outcome = await capture(emitter.on('test', null, { watch: true, timeout: 15 }));

      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toMatch(/timed out/);
      emitter.shutdown();
    });

    it('works the same through once', async () => {
      const emitter = new EventEmitter<Events>();
      const pending = capture(emitter.once('test', null, { watch: true, timeout: 200 }));
      emitter.emit('test', 'once-watched');

      expect((await pending).value).toBe('once-watched');
      emitter.shutdown();
    });

    it('rejects a null listener with no watch flag, and says why', () => {
      const emitter = new EventEmitter<Events>();
      expect(() => (emitter.on as any)('test', null)).toThrow("Listener cannot be null unless 'watch: true' is explicitly set in options.");
      emitter.shutdown();
    });
  });

  describe('emit options', () => {
    it('opens a watcher when given { watch: true }', async () => {
      const emitter = new EventEmitter<Events>();
      emitter.emit('test', 'with-options', { watch: true, timeout: 200 });
      emitter.emit('test', 'later');

      // No assertion on the internal watcher: the contract is only that this
      // does not throw and does not leave an unhandled rejection behind.
      expect(true).toBe(true);
      emitter.shutdown();
    });

    it('leaves no unhandled rejection when that watcher times out', async () => {
      const emitter = new EventEmitter<Events>();
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        emitter.emit('test', 'nobody-listening', { watch: true, timeout: 10, defaultValue: 'ignored' });
        await new Promise((resolve) => setTimeout(resolve, 60));
      } finally {
        process.off('unhandledRejection', onUnhandled);
        emitter.shutdown();
      }

      // The promise is not handed to the caller, so its timeout must be swallowed.
      expect(rejections).toEqual([]);
    });

    it('leaves no unhandled rejection when the watcher times out with no default', async () => {
      const emitter = new EventEmitter<Events>();
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        emitter.emit('test', 'nobody-listening', { watch: true, timeout: 10 });
        await new Promise((resolve) => setTimeout(resolve, 60));
      } finally {
        process.off('unhandledRejection', onUnhandled);
        emitter.shutdown();
      }

      expect(rejections).toEqual([]);
    });
  });

  describe('wildcards', () => {
    it('delivers to a `*` subscription alongside the exact one', () => {
      const emitter = new EventEmitter<Events>();
      const hits: string[] = [];
      (emitter.on as any)('user:*', () => hits.push('wildcard'));
      (emitter.on as any)('user:login', () => hits.push('exact'));

      (emitter.emit as any)('user:login', {});

      expect(hits.sort()).toEqual(['exact', 'wildcard']);
      emitter.shutdown();
    });

    it('matches a `*` in any single segment position', () => {
      const emitter = new EventEmitter<Events>();
      let hits = 0;
      (emitter.on as any)('a:*:c', () => hits++);

      (emitter.emit as any)('a:b:c', {});
      (emitter.emit as any)('a:x:c', {});
      (emitter.emit as any)('a:b:d', {});

      expect(hits).toBe(2);
      emitter.shutdown();
    });

    it('never treats `*` as multi-segment', () => {
      const emitter = new EventEmitter<Events>();
      let hits = 0;
      (emitter.on as any)('user:*', () => hits++);

      (emitter.emit as any)('user:login:extra', {});

      expect(hits).toBe(0);
      emitter.shutdown();
    });
  });

  describe('shutdown', () => {
    it('removes every listener', () => {
      const emitter = new EventEmitter<Events>();
      let count = 0;
      emitter.on('test', () => count++);
      emitter.on('num', () => count++);

      emitter.shutdown();
      emitter.emit('test', 'x');
      emitter.emit('num', 1);

      expect(count).toBe(0);
      expect(emitter.getListener('test')).toEqual([]);
      expect(emitter.getListener('num')).toEqual([]);
    });

    it('frees the whole listener budget', () => {
      const emitter = new EventEmitter<Events>(undefined, undefined, 1000, 1);
      emitter.on('test', () => {});
      emitter.shutdown();

      expect(() => emitter.on('test', () => {})).not.toThrow();
      emitter.shutdown();
    });

    it('rejects pending watchers', async () => {
      const emitter = new EventEmitter<Events>();
      const pending = capture(emitter.watch('num'));

      emitter.shutdown();

      const outcome = await pending;
      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toMatch(/Watcher shutdown/);
    });

    it('is idempotent', () => {
      const emitter = new EventEmitter<Events>();
      emitter.on('test', () => {});

      emitter.shutdown();
      expect(() => emitter.shutdown()).not.toThrow();
    });

    it('leaves the emitter usable', () => {
      const emitter = new EventEmitter<Events>();
      let seen: string | undefined;
      emitter.shutdown();

      emitter.on('test', (payload) => {
        seen = payload;
      });
      emitter.emit('test', 'reborn');

      expect(seen).toBe('reborn');
      emitter.shutdown();
    });
  });

  describe('constructor options', () => {
    it('honours a custom separator', () => {
      const emitter = new EventEmitter<Events>('.');
      const hits: string[] = [];
      (emitter.on as any)('user.login', () => hits.push('dot'));

      (emitter.emit as any)('user:login', {});
      (emitter.emit as any)('user.login', {});

      // Only the dotted name is reachable with a dotted separator.
      expect(hits).toEqual(['dot']);
      emitter.shutdown();
    });

    it('survives a large number of distinct events', () => {
      // Exercises the underlying cache eviction: more events than the cache holds.
      const emitter = new EventEmitter<Record<string, number>>(undefined, 4);
      let seen = 0;
      for (let i = 0; i < 200; i++) {
        emitter.on(`e${i}` as any, () => seen++);
      }
      for (let i = 0; i < 200; i++) {
        emitter.emit(`e${i}` as any, i);
      }

      expect(seen).toBe(200);
      emitter.shutdown();
    });
  });
});
