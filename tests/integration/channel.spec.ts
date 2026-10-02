import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { BrokerFactory, type TestEvents } from '../helpers';
import type { EventBroker } from '../../src';

/** Attaches handlers synchronously so no rejection is ever left unhandled. */
function capture(promise: Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

describe('BrokerChannel', () => {
  const factory = new BrokerFactory();
  let broker: EventBroker<TestEvents>;

  beforeEach(() => {
    broker = factory.create<TestEvents>('app');
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('identity', () => {
    it('exposes the owning broker id and the prefix', () => {
      const channel = broker.channel('user');

      expect(channel.id).toBe('app');
      expect(channel.name).toBe('user');
    });

    it('returns the same instance for the same name', () => {
      expect(broker.channel('user')).toBe(broker.channel('user'));
      expect(broker.channel('user')).not.toBe(broker.channel('audit'));
    });

    it('nests by appending to the prefix', () => {
      const nested = broker.channel('user').channel('profile');

      expect(nested.name).toBe('user:profile');
      expect(nested.id).toBe('app');
    });

    it('caches a nested channel on the broker, like a top-level one', () => {
      const user = broker.channel('user');
      expect(user.channel('profile')).toBe(user.channel('profile'));
    });

    it('honours a custom delimiter when nesting', () => {
      const dotted = factory.create<TestEvents>('dotted', { delimiter: '.' });
      const nested = dotted.channel('user').channel('profile');

      expect(nested.name).toBe('user.profile');
    });
  });

  describe('namespacing', () => {
    it('routes a channel emit to the prefixed broker event', () => {
      const seen: unknown[] = [];
      broker.on('user:login', (payload) => seen.push(payload));

      broker.channel('user').emit('login', { id: 'u1', username: 'ada' });

      expect(seen).toEqual([{ id: 'u1', username: 'ada' }]);
    });

    it('routes a broker emit to the channel listener', () => {
      const seen: unknown[] = [];
      broker.channel('user').on('login', (payload) => seen.push(payload));

      broker.emit('user:login', { id: 'u2', username: 'linus' });

      expect(seen).toEqual([{ id: 'u2', username: 'linus' }]);
    });

    it('routes through a nested channel', () => {
      const seen: unknown[] = [];
      broker
        .channel('user')
        .channel('profile')
        .on('viewed', (payload) => seen.push(payload));

      broker.emit('user:profile:viewed', { id: 'u3' });

      expect(seen).toEqual([{ id: 'u3' }]);
    });

    it('keeps two namespaces apart', () => {
      const user: unknown[] = [];
      const audit: unknown[] = [];
      broker.channel('user').on('login', (p) => user.push(p));
      broker.channel('audit').on('write', (p) => audit.push(p));

      broker.channel('user').emit('login', { id: 'u1', username: 'a' });
      broker.channel('audit').emit('write', { message: 'tracked' });

      expect(user).toHaveLength(1);
      expect(audit).toHaveLength(1);
    });

    it('uses the configured delimiter end to end', () => {
      const dotted = factory.create<TestEvents>('dotted', { delimiter: '.' });
      const hits: unknown[] = [];
      dotted.channel('user').on('login', (payload) => hits.push(payload));

      dotted.channel('user').emit('login', { id: 'u1', username: 'ada' });

      expect(hits).toHaveLength(1);
      // The colon form is a different event entirely under this configuration.
      expect(dotted.getListener('user:login' as any)).toEqual([]);
    });
  });

  describe('off', () => {
    it('removes the listener from the prefixed event only', () => {
      const seen: string[] = [];
      const listener = () => seen.push('hit');
      broker.channel('user').on('login', listener);

      broker.channel('user').off('login', listener);
      broker.emit('user:login', { id: 'u1', username: 'a' });

      expect(seen).toEqual([]);
      expect(broker.getListener('user:login')).toEqual([]);
    });

    it('leaves other events in the same namespace alone', () => {
      const seen: string[] = [];
      broker.channel('user').on('login', () => seen.push('login'));
      broker.channel('user').on('logout', () => seen.push('logout'));

      broker.channel('user').off('login');
      broker.channel('user').emit('login', { id: 'u1', username: 'a' });
      broker.channel('user').emit('logout', { id: 'u1' });

      expect(seen).toEqual(['logout']);
    });

    it('leaves a `*` subscription in the namespace alone', () => {
      // Documented on `off`: removal is exact-name, so `off('login')` does not
      // unsubscribe a `'*'` handler that was registered through this channel.
      const hits: string[] = [];
      (broker.channel('user').on as any)('*', () => hits.push('any'));
      broker.channel('user').on('login', () => hits.push('login'));

      broker.channel('user').off('login');
      broker.channel('user').emit('login', { id: 'u1', username: 'a' });

      expect(hits).toEqual(['any']);
    });
  });

  describe('once', () => {
    it('fires for a single prefixed emit', () => {
      let count = 0;
      broker.channel('user').once('login', () => count++);

      broker.channel('user').emit('login', { id: 'u1', username: 'a' });
      broker.channel('user').emit('login', { id: 'u2', username: 'b' });

      expect(count).toBe(1);
      expect(broker.channel('user').getListener('login')).toEqual([]);
    });
  });

  describe('call', () => {
    it('returns the first listener result by default', () => {
      broker.on('user:validate', (data) => data.name.length > 0);
      broker.on('user:validate', (data) => data.age >= 18);

      expect(broker.channel('user').call('validate', { name: 'ada', age: 36 })).toBe(true);
    });

    it('returns every listener result with the all strategy', () => {
      broker.on('user:validate', (data) => data.name.length > 0);
      broker.on('user:validate', (data) => data.age >= 18);

      expect(broker.channel('user').call('validate', { name: 'ada', age: 16 }, 'all')).toEqual([true, false]);
    });

    it('returns an empty array when nothing is listening', () => {
      const channel = broker.channel('user');

      const unanswered: unknown = channel.call('validate', { name: 'ada', age: 36 });
      expect(unanswered).toEqual([]);
      expect(channel.call('validate', { name: 'ada', age: 36 }, 'all')).toEqual([]);
    });

    it('does not pick up an identically-named event from another namespace', () => {
      // `audit:write` exists; the channel asks for `user:validate`, which has no
      // listeners, so nothing from the audit namespace can answer it.
      broker.on('audit:write', () => ({ message: 'audit-answer' }));

      const unanswered: unknown = broker.channel('user').call('validate', { name: 'a', age: 1 });
      expect(unanswered).toEqual([]);
    });
  });

  describe('getListener', () => {
    it('reads through to the prefixed event', () => {
      const listener = () => {};
      broker.channel('user').on('login', listener);

      expect(broker.channel('user').getListener('login')).toEqual([listener]);
    });

    it('is empty for a name nobody registered', () => {
      expect(broker.channel('user').getListener('logout')).toEqual([]);
    });
  });

  describe('watch', () => {
    it('resolves on the prefixed event, not the bare name', async () => {
      // Regression: `watch` used to skip namespacing, so this promise settled on
      // an emit of `login` — an event the channel can never emit — and timed out.
      const pending = capture(broker.channel('user').watch('login', 300));
      broker.channel('user').emit('login', { id: 'u1', username: 'ada' });

      const outcome = await pending;
      expect(outcome.ok).toBe(true);
      expect(outcome.value).toEqual({ id: 'u1', username: 'ada' });
    });

    it('settles on a broker-level emit of the prefixed event too', async () => {
      const pending = capture(broker.channel('user').watch('login', 300));
      broker.emit('user:login', { id: 'u2', username: 'linus' });

      expect((await pending).value).toEqual({ id: 'u2', username: 'linus' });
    });

    it('does not settle on the bare, unprefixed name', async () => {
      const pending = capture(broker.channel('user').watch('login', 40));
      (broker.emit as any)('login', { id: 'stray' });

      const outcome = await pending;
      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toMatch(/'user:login'/);
    });

    it('respects a nested channel prefix', async () => {
      const pending = capture(broker.channel('user').channel('profile').watch('viewed', 300));
      broker.emit('user:profile:viewed', { id: 'u3' });

      expect((await pending).value).toEqual({ id: 'u3' });
    });

    it('rejects with the namespaced name on timeout', async () => {
      const outcome = await capture(broker.channel('user').watch('login', 25));

      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toBe("Event 'user:login' timed out after 25ms");
    });
  });

  describe('watch mode via on/once', () => {
    it('on(event, null, { watch: true }) resolves on the prefixed event', async () => {
      const pending = capture(broker.channel('user').on('login', null, { watch: true, timeout: 300 }));
      broker.channel('user').emit('login', { id: 'u1', username: 'ada' });

      expect((await pending).value).toEqual({ id: 'u1', username: 'ada' });
    });

    it('once(event, null, { watch: true }) resolves on the prefixed event', async () => {
      const pending = capture(broker.channel('user').once('login', null, { watch: true, timeout: 300 }));
      broker.channel('user').emit('login', { id: 'u1', username: 'ada' });

      expect((await pending).value).toEqual({ id: 'u1', username: 'ada' });
    });
  });

  describe('wildcards', () => {
    it('matches a `*` subscription inside the namespace', () => {
      const hits: string[] = [];
      (broker.channel('user').on as any)('*', () => hits.push('any'));

      broker.channel('user').emit('login', { id: 'u1', username: 'ada' });
      broker.channel('user').emit('logout', { id: 'u1' });

      expect(hits).toHaveLength(2);
    });

    it('stays inside the namespace', () => {
      const hits: string[] = [];
      (broker.channel('user').on as any)('*', () => hits.push('any'));

      broker.channel('audit').emit('write', { message: 'x' });

      expect(hits).toEqual([]);
    });
  });
});
