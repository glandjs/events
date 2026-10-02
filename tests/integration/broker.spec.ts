import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { BrokerFactory, type TestEvents } from '../helpers';
import type { BrokerOptions, EventBroker } from '../../src';

/** Attaches handlers synchronously so no rejection is ever left unhandled. */
function capture(promise: Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

describe('EventBroker', () => {
  const factory = new BrokerFactory();
  let broker: EventBroker<TestEvents>;

  beforeEach(() => {
    broker = factory.create<TestEvents>('app');
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('construction', () => {
    it('takes its id from the name', () => {
      expect(broker.id).toBe('app');
    });

    it('fills in every default option', () => {
      expect(broker.options).toEqual({
        name: 'app',
        cacheSize: 6,
        delimiter: ':',
        ignoreErrors: false,
        defaultTimeout: 1000,
        maxListeners: 5,
      });
    });

    it('keeps the options it was given', () => {
      const configured = factory.create<TestEvents>('tuned', {
        cacheSize: 64,
        delimiter: '.',
        ignoreErrors: true,
        defaultTimeout: 250,
        maxListeners: 2,
      });

      expect(configured.options).toEqual({
        name: 'tuned',
        cacheSize: 64,
        delimiter: '.',
        ignoreErrors: true,
        defaultTimeout: 250,
        maxListeners: 2,
      });
    });

    it('starts with no connections', () => {
      expect(broker.getConnections()).toEqual([]);
      expect(broker.isConnected('anything')).toBe(false);
    });
  });

  describe('emit and on', () => {
    it('delivers the payload to a listener', () => {
      const seen: unknown[] = [];
      broker.on('user:login', (payload) => seen.push(payload));

      broker.emit('user:login', { id: 'u1', username: 'ada' });

      expect(seen).toEqual([{ id: 'u1', username: 'ada' }]);
    });

    it('supports a payloadless event', () => {
      let count = 0;
      broker.on('ping', () => count++);

      broker.emit('ping', undefined);

      expect(count).toBe(1);
    });

    it('supports a non-object payload', () => {
      const seen: string[] = [];
      broker.on('message:new', (message) => seen.push(message));

      broker.emit('message:new', 'plain text');

      expect(seen).toEqual(['plain text']);
    });

    it('returns the broker for chaining', () => {
      expect(broker.emit('message:new', 'x')).toBe(broker);
      expect(broker.on('message:new', () => {})).toBe(broker);
      expect(broker.off('message:new')).toBe(broker);
    });

    it('calls listeners in registration order', () => {
      const order: string[] = [];
      broker.on('message:new', () => order.push('first'));
      broker.on('message:new', () => order.push('second'));

      broker.emit('message:new', 'x');

      expect(order).toEqual(['first', 'second']);
    });

    it('does nothing when there is no listener', () => {
      expect(() => broker.emit('message:new', 'orphan')).not.toThrow();
    });

    it('propagates a throwing listener to the caller', () => {
      broker.on('message:new', () => {
        throw new Error('listener exploded');
      });

      expect(() => broker.emit('message:new', 'x')).toThrow('listener exploded');
    });
  });

  describe('off', () => {
    it('removes one listener', () => {
      const calls: string[] = [];
      const first = () => calls.push('first');
      broker.on('message:new', first);
      broker.on('message:new', () => calls.push('second'));

      broker.off('message:new', first);
      broker.emit('message:new', 'x');

      expect(calls).toEqual(['second']);
    });

    it('removes all listeners when none is given', () => {
      let count = 0;
      broker.on('message:new', () => count++);
      broker.on('message:new', () => count++);

      broker.off('message:new');
      broker.emit('message:new', 'x');

      expect(count).toBe(0);
    });

    it('is a no-op for something never registered', () => {
      expect(() => broker.off('message:new')).not.toThrow();
    });
  });

  describe('once', () => {
    it('fires for the first emit only', () => {
      let count = 0;
      broker.once('message:new', () => count++);

      broker.emit('message:new', 'a');
      broker.emit('message:new', 'b');

      expect(count).toBe(1);
    });

    it('leaves no listener behind', () => {
      broker.once('message:new', () => {});
      broker.emit('message:new', 'a');

      expect(broker.getListener('message:new')).toEqual([]);
    });

    it('keeps an on-listener running alongside it', () => {
      const calls: string[] = [];
      broker.once('message:new', () => calls.push('once'));
      broker.on('message:new', () => calls.push('always'));

      broker.emit('message:new', 'a');
      broker.emit('message:new', 'b');

      expect(calls).toEqual(['once', 'always', 'always']);
    });
  });

  describe('call', () => {
    it('returns the first listener result by default', () => {
      broker.on('user:validate', (data) => data.name.length > 0);
      broker.on('user:validate', (data) => data.age >= 18);

      expect(broker.call('user:validate', { name: 'ada', age: 36 })).toBe(true);
    });

    it('returns every result in registration order with all', () => {
      broker.on('user:validate', (data) => data.name.length > 0);
      broker.on('user:validate', (data) => data.age >= 18);

      expect(broker.call('user:validate', { name: 'ada', age: 16 }, 'all')).toEqual([true, false]);
    });

    it('collects promises from async listeners', async () => {
      broker.on('user:validate', async (data) => data.name.length > 0);
      broker.on('user:validate', (data) => data.age >= 18);

      const results = broker.call('user:validate', { name: 'ada', age: 16 }, 'all');

      expect(results).toHaveLength(2);
      expect(await results[0]).toBe(true);
      expect(results[1]).toBe(false);
    });

    it('returns an empty array when nothing is listening', () => {
      // The declared return is `boolean`, but an unanswered request yields `[]`
      // at runtime so a caller can branch on "no handler ran". That is a
      // deliberate trade-off, and widening to `unknown` here is the price of it:
      // a `call` result used directly has to tolerate both shapes.
      const unanswered: unknown = broker.call('user:validate', { name: 'ada', age: 36 });
      expect(unanswered).toEqual([]);
      expect(broker.call('user:validate', { name: 'ada', age: 36 }, 'all')).toEqual([]);
    });

    it('runs synchronously, before emit returns', () => {
      broker.on('user:validate', (data) => data.name.length > 0);
      expect(broker.call('user:validate', { name: 'ada', age: 1 })).toBe(true);
    });

    it('does not reach wildcards, which keeps the answer predictable', () => {
      (broker.on as any)('user:*', () => 'wildcard');
      broker.on('user:validate', (data) => data.name.length > 0);

      expect(broker.call('user:validate', { name: 'ada', age: 1 }, 'all')).toEqual([true]);
    });
  });

  describe('getListener', () => {
    it('returns the listeners registered for the event', () => {
      const listener = () => {};
      broker.on('message:new', listener);

      expect(broker.getListener('message:new')).toEqual([listener]);
    });

    it('is empty for an event with no listeners', () => {
      expect(broker.getListener('message:new')).toEqual([]);
    });

    it('tracks once-listeners until they fire', () => {
      broker.once('message:new', () => {});
      expect(broker.getListener('message:new')).toHaveLength(1);

      broker.emit('message:new', 'x');
      expect(broker.getListener('message:new')).toEqual([]);
    });
  });

  describe('watch', () => {
    it('resolves with the next payload', async () => {
      const pending = capture(broker.watch('message:new', 300));
      broker.emit('message:new', 'watched');

      expect((await pending).value).toBe('watched');
    });

    it('resolves without any listener registered', async () => {
      const pending = capture(broker.watch('message:new', 300));
      broker.emit('message:new', 'unheard');

      expect((await pending).value).toBe('unheard');
    });

    it('rejects on timeout, naming the event', async () => {
      const outcome = await capture(broker.watch('message:new', 25));

      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toBe("Event 'message:new' timed out after 25ms");
    });

    it('uses the configured defaultTimeout when none is given', async () => {
      const quick = factory.create<TestEvents>('quick', { defaultTimeout: 20 });
      const outcome = await capture(quick.watch('message:new'));

      expect((outcome.error as Error).message).toBe("Event 'message:new' timed out after 20ms");
    });

    it('settles every watcher on the same event', async () => {
      const first = capture(broker.watch('message:new', 300));
      const second = capture(broker.watch('message:new', 300));

      broker.emit('message:new', 'both');

      expect((await first).value).toBe('both');
      expect((await second).value).toBe('both');
    });

    it('is one-shot', async () => {
      const first = capture(broker.watch('message:new', 300));
      broker.emit('message:new', 'one');
      await first;

      const second = capture(broker.watch('message:new', 40));
      broker.emit('message:new', 'two');

      expect((await second).value).toBe('two');
    });

    it('works through the on watch mode with a fallback', async () => {
      const outcome = await capture(broker.on('message:new', null, { watch: true, timeout: 20, defaultValue: 'none' }));

      expect(outcome.value).toBe('none');
    });
  });

  describe('wildcards', () => {
    it('delivers to a wildcard and an exact listener together', () => {
      const hits: string[] = [];
      (broker.on as any)('user:*', () => hits.push('wildcard'));
      (broker.on as any)('user:login', () => hits.push('exact'));

      (broker.emit as any)('user:login', { id: 'u1', username: 'a' });

      expect(hits.sort()).toEqual(['exact', 'wildcard']);
    });
  });

  describe('event identity', () => {
    it('drops a repeated eventId on the same broker', () => {
      let count = 0;
      broker.on('message:new', () => count++);

      // The same correlation id twice is one logical event, not two.
      broker.emit('message:new', 'first', { _eventId: 'fixed' });
      broker.emit('message:new', 'second', { _eventId: 'fixed' });

      expect(count).toBe(1);
    });

    it('treats distinct ids as distinct events', () => {
      let count = 0;
      broker.on('message:new', () => count++);

      broker.emit('message:new', 'first', { _eventId: 'a' });
      broker.emit('message:new', 'second', { _eventId: 'b' });

      expect(count).toBe(2);
    });

    it('mints an id when none is supplied, so plain emits never collide', () => {
      let count = 0;
      broker.on('message:new', () => count++);

      for (let i = 0; i < 500; i++) {
        broker.emit('message:new', `msg-${i}`);
      }

      expect(count).toBe(500);
    });

    it('is scoped per broker, not global', () => {
      const other = factory.create<TestEvents>('other');
      let onApp = 0;
      let onOther = 0;
      broker.on('message:new', () => onApp++);
      other.on('message:new', () => onOther++);

      broker.emit('message:new', 'x', { _eventId: 'shared' });
      other.emit('message:new', 'x', { _eventId: 'shared' });

      // Neither broker has seen the id before, so both process it.
      expect(onApp).toBe(1);
      expect(onOther).toBe(1);
    });
  });

  describe('type-safe options', () => {
    it('accepts a partially specified BrokerOptions', () => {
      const options: BrokerOptions = { name: 'partial' };
      const partial = factory.create<TestEvents>('partial', { maxListeners: options.name.length });

      expect(partial.options.maxListeners).toBe('partial'.length);
    });
  });
});
