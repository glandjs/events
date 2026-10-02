import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { BrokerFactory, createInbox, delay } from '../helpers';
import type { EventBroker } from '../../src';
import type { TestEvents } from '../helpers';

/** Attaches handlers synchronously so no rejection is ever left unhandled. */
function capture(promise: Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

describe('lifecycle', () => {
  const factory = new BrokerFactory();
  let broker: EventBroker<TestEvents>;

  beforeEach(() => {
    broker = factory.create<TestEvents>('app');
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('shutdown', () => {
    it('removes every listener', () => {
      let count = 0;
      broker.on('message:new', () => count++);
      broker.on('user:login', () => count++);

      broker.shutdown();
      broker.emit('message:new', 'x');
      broker.emit('user:login', { id: 'u1', username: 'a' });

      expect(count).toBe(0);
    });

    it('clears once-listeners too', () => {
      broker.once('message:new', () => {});

      broker.shutdown();

      expect(broker.getListener('message:new')).toEqual([]);
    });

    it('frees the whole listener budget', () => {
      const tight = factory.create<TestEvents>('tight', { maxListeners: 1 });
      tight.on('message:new', () => {});
      tight.on('user:login', () => {});

      expect(() => tight.on('user:login', () => {})).toThrow(/Maximum listeners/);
      tight.shutdown();
      expect(() => tight.on('message:new', () => {})).not.toThrow();
    });

    it('drops every connection, in both directions', () => {
      const peer = factory.create<TestEvents>('peer');
      broker.connectTo(peer);

      broker.shutdown();

      expect(broker.getConnections()).toEqual([]);
      // The peer is told about the link going away, not left holding a dead one.
      expect(peer.getConnections()).toEqual([]);
    });

    it('drops cached channels', () => {
      const channel = broker.channel('user');
      broker.shutdown();

      // A fresh instance, so a channel captured before shutdown is not reused
      // against a broker that no longer holds its listeners.
      expect(broker.channel('user')).not.toBe(channel);
    });

    it('rejects pending watchers instead of leaving them armed', async () => {
      const pending = capture(broker.watch('message:new'));

      broker.shutdown();

      const outcome = await pending;
      expect(outcome.ok).toBe(false);
      expect((outcome.error as Error).message).toMatch(/Watcher shutdown/);
    });

    it('rejects every pending watcher', async () => {
      const pending = [capture(broker.watch('message:new')), capture(broker.watch('user:login'))];

      broker.shutdown();

      const outcomes = await Promise.all(pending);
      expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
    });

    it('clears the event trace, so a reused id is processed again', () => {
      let count = 0;
      broker.on('message:new', () => count++);
      broker.emit('message:new', 'first', { _eventId: 'fixed' });
      expect(count).toBe(1);

      broker.shutdown();
      broker.on('message:new', () => count++);
      broker.emit('message:new', 'second', { _eventId: 'fixed' });

      expect(count).toBe(2);
    });

    it('is idempotent', () => {
      broker.on('message:new', () => {});
      broker.connectTo(factory.create<TestEvents>('peer'));

      broker.shutdown();

      expect(() => broker.shutdown()).not.toThrow();
      expect(broker.getConnections()).toEqual([]);
    });

    it('leaves the broker usable, which is what a restart needs', () => {
      let seen: unknown;
      broker.on('message:new', (payload) => (seen = payload));
      broker.shutdown();

      broker.on('message:new', (payload) => (seen = payload));
      broker.emit('message:new', 'reborn');

      expect(seen).toBe('reborn');
    });

    it('works on a broker that never did anything', () => {
      const idle = factory.create<TestEvents>('idle');

      expect(() => idle.shutdown()).not.toThrow();
    });

    it('does not leave timers holding the process open', async () => {
      // A watcher with a long timeout that shutdown never released would keep
      // the event loop alive long after the test finished.
      const pending = capture(broker.watch('message:new', 60_000));
      broker.shutdown();

      const outcome = await pending;
      expect(outcome.ok).toBe(false);
    });
  });

  describe('test isolation', () => {
    it('gives each broker an independent listener registry', () => {
      const other = factory.create<TestEvents>('other');
      let appCount = 0;
      let otherCount = 0;
      broker.on('message:new', () => appCount++);
      other.on('message:new', () => otherCount++);

      broker.emit('message:new', 'x');
      other.emit('message:new', 'x');

      expect(appCount).toBe(1);
      expect(otherCount).toBe(1);

      broker.shutdown();
      other.emit('message:new', 'x');
      expect(otherCount).toBe(2);
      expect(appCount).toBe(1);
    });

    it('does not carry connections across a shutdown', () => {
      const peers = ['p1', 'p2'].map((name) => factory.create<TestEvents>(name));
      for (const peer of peers) {
        broker.connectTo(peer);
      }
      expect(broker.getConnections()).toEqual(['p1', 'p2']);

      broker.shutdown();

      expect(broker.getConnections()).toEqual([]);
      for (const peer of peers) {
        expect(peer.getConnections()).toEqual([]);
      }
    });

    it('survives repeated setup and teardown without drift', () => {
      // The shape of a test that loops over cases: if teardown leaked anything,
      // the counts would creep and this would catch it.
      for (let round = 0; round < 5; round++) {
        const local = factory.create<TestEvents>(`round-${round}`);
        const inbox = createInbox([local], 'message:new');
        local.broadcast('message:new', `round-${round}`);
        expect(inbox.total()).toBe(1);
        local.shutdown();
        local.emit('message:new', 'after-shutdown');
        expect(inbox.total()).toBe(1);
      }
    });
  });

  describe('timers', () => {
    it('does not accumulate watchers across many waits', async () => {
      const outcomes: boolean[] = [];
      for (let i = 0; i < 25; i++) {
        const pending = capture(broker.watch('message:new', 40));
        broker.emit('message:new', `tick-${i}`);
        outcomes.push((await pending).ok);
      }

      expect(outcomes.every(Boolean)).toBe(true);
      // All settled, so nothing is still holding a timer.
      await delay(80);
    });

    it('settles a watcher created immediately before the emit', async () => {
      // The common race in application code: await a thing that already happened.
      const pending = capture(broker.watch('message:new', 200));
      broker.emit('message:new', 'now');

      expect((await pending).value).toBe('now');
    });
  });
});
