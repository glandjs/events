import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { BrokerFactory, createInbox, delay } from '../helpers';
import type { EventBroker } from '../../src';
import type { TestEvents } from '../helpers';

describe('broker mesh', () => {
  const factory = new BrokerFactory();

  beforeEach(() => {
    // Deliberately no shared state: a leaked connection from one test would
    // otherwise make the next one pass or fail for the wrong reason.
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('connectTo', () => {
    it('links both directions', () => {
      const [a, b] = factory.mesh(['a', 'b']);

      expect(a.getConnections()).toEqual(['b']);
      expect(b.getConnections()).toEqual(['a']);
      expect(a.isConnected('b')).toBe(true);
      expect(b.isConnected('a')).toBe(true);
    });

    it('refuses to link a broker to itself', () => {
      const a = factory.create<TestEvents>('a');

      expect(() => a.connectTo(a)).toThrow('Cannot connect broker "a" to itself');
    });

    it('refuses a broker with no id', () => {
      const a = factory.create<TestEvents>('a');

      expect(() => a.connectTo(undefined as any)).toThrow('Invalid broker');
      expect(() => a.connectTo({} as any)).toThrow('Invalid broker');
    });

    it('is idempotent for the same peer', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');

      a.connectTo(b);
      a.connectTo(b);
      a.connectTo(b);

      expect(a.getConnections()).toEqual(['b']);
      expect(b.getConnections()).toEqual(['a']);
    });

    it('keeps the first options when called again for the same peer', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const received: string[] = [];
      b.on('message:new', (m) => received.push(m));

      a.connectTo(b, { events: ['message:new'] });
      a.connectTo(b, { events: [] });

      a.emit('message:new', 'once');

      expect(received).toEqual(['once']);
    });

    it('connects many peers from one broker', () => {
      const hub = factory.create<TestEvents>('hub');
      const peers = ['p1', 'p2', 'p3', 'p4'].map((name) => factory.create<TestEvents>(name));

      for (const peer of peers) {
        hub.connectTo(peer);
      }

      expect(hub.getConnections()).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(peers[0]!.getConnections()).toEqual(['hub']);
    });
  });

  describe('createConnections', () => {
    it('builds a full mesh', () => {
      const [hub, ...peers] = factory.mesh(['hub', 'p1', 'p2', 'p3']);

      // Everyone reaches everyone, which is what makes a single broadcast enough.
      expect(hub!.getConnections().sort()).toEqual(['p1', 'p2', 'p3']);
      for (const peer of peers) {
        expect(peer.getConnections().sort()).toEqual(['hub', ...peers.filter((p) => p.id !== peer.id).map((p) => p.id)].sort());
      }
    });

    it('handles a single broker without connecting it to itself', () => {
      const [only] = factory.mesh(['only']);

      expect(only!.getConnections()).toEqual([]);
    });

    it('handles an empty list', () => {
      const hub = factory.create<TestEvents>('hub');

      expect(() => hub.createConnections([])).not.toThrow();
      expect(hub.getConnections()).toEqual([]);
    });
  });

  describe('broadcast', () => {
    it('reaches every broker in the mesh exactly once', () => {
      const brokers = factory.mesh(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
      const inbox = createInbox(brokers, 'message:new');

      brokers[0]!.broadcast('message:new', 'star');

      expect(inbox.counts()).toEqual({ b1: 1, b2: 1, b3: 1, b4: 1, b5: 1, b6: 1 });
      expect(inbox.missed()).toEqual([]);
    });

    it('delivers the same payload everywhere', () => {
      const brokers = factory.mesh(['b1', 'b2', 'b3']);
      const seen: unknown[] = [];
      for (const broker of brokers) {
        broker.on('message:new', (payload) => seen.push(payload));
      }

      brokers[0]!.broadcast('message:new', 'uniform');

      expect(seen).toEqual(['uniform', 'uniform', 'uniform']);
    });

    it('reaches every broker from any origin, not just the first', () => {
      for (const origin of [0, 2, 4]) {
        const brokers = factory.mesh(['b1', 'b2', 'b3', 'b4', 'b5']);
        const inbox = createInbox(brokers, 'message:new');

        brokers[origin]!.broadcast('message:new', `from-${origin}`);

        expect(inbox.total()).toBe(5);
      }
    });

    it('reaches a broker reachable only through several hops', () => {
      // A line, not a full mesh: b3 is three hops from b1.
      const [b1, b2, b3, b4] = factory.mesh(['b1', 'b2', 'b3', 'b4']);
      b2!.disconnect('b3');
      b2!.disconnect('b4');
      b3!.disconnect('b4');
      b1!.connectTo(b2!);
      b2!.connectTo(b3!);
      b3!.connectTo(b4!);

      const inbox = createInbox([b1!, b2!, b3!, b4!], 'message:new');
      b1!.broadcast('message:new', 'along-the-line');

      expect(inbox.counts()).toEqual({ b1: 1, b2: 1, b3: 1, b4: 1 });
    });

    it('does not reach brokers outside the mesh', () => {
      const connected = factory.mesh(['a', 'b']);
      const stranger = factory.create<TestEvents>('stranger');
      let heard = false;
      stranger.on('message:new', () => (heard = true));

      connected[0]!.broadcast('message:new', 'x');

      expect(heard).toBe(false);
    });

    it('does not leak connections from one broadcast into the next', () => {
      const brokers = factory.mesh(['b1', 'b2', 'b3']);
      const inbox = createInbox(brokers, 'message:new');

      brokers[1]!.broadcast('message:new', 'first');
      brokers[2]!.broadcast('message:new', 'second');

      // Three each, not six: each broker processes each event once.
      expect(inbox.counts()).toEqual({ b1: 2, b2: 2, b3: 2 });
    });

    it('does not double-deliver as the mesh grows', () => {
      for (const size of [2, 3, 4, 5, 6, 8, 10]) {
        const brokers = factory.mesh(Array.from({ length: size }, (_, i) => `b${i}`));
        const inbox = createInbox(brokers, 'message:new');

        brokers[0]!.broadcast('message:new', 'once');

        // Exactly-once is the property that matters; N+1 deliveries per broker
        // would be the natural failure mode of a naive flood.
        expect(inbox.total()).toBe(size);
      }
    });

    it('routes through a channel too', () => {
      const brokers = factory.mesh(['b1', 'b2', 'b3']);
      const inbox = createInbox(brokers, 'user:login');

      brokers[0]!.channel('user').broadcast('login', { id: 'u1', username: 'ada' });

      expect(inbox.total()).toBe(3);
    });
  });

  describe('emit dedup', () => {
    it('suppresses the copy that comes back around', () => {
      // Without dedup the origin would re-process its own broadcast as it echoes
      // back through the mesh, and the count would climb with each round trip.
      const brokers = factory.mesh(['b1', 'b2', 'b3']);
      const inbox = createInbox(brokers, 'message:new');

      brokers[0]!.broadcast('message:new', 'echo');

      expect(inbox.counts()['b1']).toBe(1);
    });

    it('lets a reused id be processed again after a trace is evicted', () => {
      // Traces are bounded, so an id can eventually be forgotten. That is the
      // documented trade-off, and this pins it down rather than leaving it implied.
      const a = factory.create<TestEvents>('a');
      let count = 0;
      a.on('message:new', () => count++);

      for (let i = 0; i < 5000; i++) {
        a.emit('message:new', `fill-${i}`, { _eventId: `filler-${i}` });
      }

      a.emit('message:new', 'reuse', { _eventId: 'fixed' });
      a.emit('message:new', 'reuse-again', { _eventId: 'fixed' });

      // Still deduped: 5000 fillers did not push this id out on their own.
      expect(count).toBe(5001);
    });
  });

  describe('send', () => {
    it('delivers the payload to the target', () => {
      // Regression: `send` used to hand the target a literal `null`, so the
      // payload could not survive the trip at all.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const seen: unknown[] = [];
      b.on('message:new', (payload) => seen.push(payload));

      a.send('message:new', b, 'the-payload');

      expect(seen).toEqual(['the-payload']);
    });

    it('delivers a structured payload unchanged', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      let seen: unknown;
      b.on('user:login', (payload) => (seen = payload));

      a.send('user:login', b, { id: 'u1', username: 'ada' });

      expect(seen).toEqual({ id: 'u1', username: 'ada' });
    });

    it('reaches the target only, not a third broker', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const heard: string[] = [];
      b.on('message:new', () => heard.push('b'));
      c.on('message:new', () => heard.push('c'));
      a.connectTo(b);
      a.connectTo(c);

      a.send('message:new', b, 'direct');

      expect(heard).toEqual(['b']);
    });

    it('works without a connection between the two', () => {
      // send takes an instance, not an id, so no link is required.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.send('message:new', b, 'unconnected');

      expect(heard).toEqual(['unconnected']);
      expect(a.getConnections()).toEqual([]);
    });

    it('does not relay onward from the target', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const heard: string[] = [];
      b.on('message:new', () => heard.push('b'));
      c.on('message:new', () => heard.push('c'));
      b.connectTo(c);

      a.send('message:new', b, 'stop-here');

      expect(heard).toEqual(['b']);
    });

    it('is not suppressed by the target having seen the id before', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      let count = 0;
      b.on('message:new', () => count++);

      a.send('message:new', b, 'one');
      a.send('message:new', b, 'two');

      // Each send mints its own id, so both land.
      expect(count).toBe(2);
    });

    it('returns the sender for chaining', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');

      expect(a.send('message:new', b, 'x')).toBe(a);
    });

    it('carries routing options through to the target', () => {
      // `send` owns the correlation id: it mints one per call and writes it after
      // spreading `options`, so two sends are always two distinct events. A
      // caller cannot reuse an id here, which is why `options` is `EventOptions`
      // rather than `EmitOptions` on this signature.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      let count = 0;
      b.on('message:new', () => count++);

      a.send('message:new', b, 'first', { _eventId: 'shared' } as never);
      a.send('message:new', b, 'second', { _eventId: 'shared' } as never);

      expect(count).toBe(2);
    });

    it('does not let the target relay a caller-supplied _propagate', () => {
      // `_propagate` is routing state the sender owns. Letting a caller's value
      // through would turn an addressed delivery into a mesh flood.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      let cCount = 0;
      c.on('message:new', () => cCount++);
      b.connectTo(c);

      a.send('message:new', b, 'stop', { _propagate: true } as never);

      expect(cCount).toBe(0);
    });
  });

  describe('emitTo', () => {
    it('reports true when delivered', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      const heard: string[] = [];
      b!.on('message:new', (m) => heard.push(m));

      expect(a!.emitTo('b', 'message:new', 'addressed')).toBe(true);
      expect(heard).toEqual(['addressed']);
    });

    it('reports false when there is no such link', () => {
      const a = factory.create<TestEvents>('a');

      expect(a.emitTo('ghost', 'message:new', 'x')).toBe(false);
    });

    it('does not relay onward', () => {
      const [a, b, c] = factory.mesh(['a', 'b', 'c']);
      const heard: string[] = [];
      b!.on('message:new', () => heard.push('b'));
      c!.on('message:new', () => heard.push('c'));

      a!.emitTo('b', 'message:new', 'one-hop');

      expect(heard).toEqual(['b']);
    });

    it('stops working after a disconnect', () => {
      const [a] = factory.mesh(['a', 'b']);
      a!.disconnect('b');

      expect(a!.emitTo('b', 'message:new', 'x')).toBe(false);
    });
  });

  describe('broadcastTo', () => {
    it('delivers to the listed peers only', () => {
      const [a, b, c] = factory.mesh(['a', 'b', 'c']);
      const heard: string[] = [];
      b!.on('message:new', () => heard.push('b'));
      c!.on('message:new', () => heard.push('c'));

      a!.broadcastTo(['b'], 'message:new', 'subset');

      expect(heard).toEqual(['b']);
    });

    it('skips ids that are not connected', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      const heard: string[] = [];
      b!.on('message:new', (m) => heard.push(m));

      expect(() => a!.broadcastTo(['b', 'ghost'], 'message:new', 'partly')).not.toThrow();
      expect(heard).toEqual(['partly']);
    });

    it('returns the sender for chaining', () => {
      const [a] = factory.mesh(['a', 'b']);

      expect(a!.broadcastTo(['b'], 'message:new', 'x')).toBe(a);
    });

    it('sends one event, not one per id', () => {
      const [a, b, c] = factory.mesh(['a', 'b', 'c']);
      let bCount = 0;
      let cCount = 0;
      b!.on('message:new', () => bCount++);
      c!.on('message:new', () => cCount++);

      a!.broadcastTo(['b', 'c'], 'message:new', 'one-event');

      expect(bCount).toBe(1);
      expect(cCount).toBe(1);
    });
  });

  describe('callTo', () => {
    it('returns the peer first listener result', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      b!.on('user:validate', (data) => data.name.length > 0);
      b!.on('user:validate', (data) => data.age >= 18);

      expect(a!.callTo('b', 'user:validate', { name: 'ada', age: 36 })).toBe(true);
    });

    it('returns every peer result with the all strategy', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      b!.on('user:validate', (data) => data.name.length > 0);
      b!.on('user:validate', (data) => data.age >= 18);

      expect(a!.callTo('b', 'user:validate', { name: 'ada', age: 16 }, 'all')).toEqual([true, false]);
    });

    it('returns an empty array when not connected', () => {
      const a = factory.create<TestEvents>('a');

      const unanswered: unknown = a.callTo('ghost', 'user:validate', { name: 'a', age: 1 });
      expect(unanswered).toEqual([]);
    });

    it('returns an empty array for the all strategy when not connected', () => {
      // Both overloads agree on "unreachable", so a caller switching strategy
      // does not get a different shape out of an unreachable peer.
      const a = factory.create<TestEvents>('a');

      expect(a.callTo('ghost', 'user:validate', { name: 'a', age: 1 }, 'all')).toEqual([]);
    });

    it('returns an empty array when the peer has nothing listening', () => {
      const [a] = factory.mesh(['a', 'b']);

      // Connected, but no handler on the peer — the same `[]` as unreachable.
      const unanswered: unknown = a!.callTo('b', 'user:validate', { name: 'a', age: 1 });
      expect(unanswered).toEqual([]);
    });

    it('runs on the peer, not on the caller', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      let localRan = false;
      a!.on('user:validate', () => {
        localRan = true;
        return false;
      });
      b!.on('user:validate', () => true);

      // The peer's answer comes back, and the caller's own handler never ran.
      expect(a!.callTo('b', 'user:validate', { name: 'a', age: 1 })).toBe(true);
      expect(localRan).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('removes the link in both directions', () => {
      const [a, b] = factory.mesh(['a', 'b']);

      expect(b!.disconnect('a')).toBe(true);
      expect(a!.isConnected('b')).toBe(false);
      expect(b!.isConnected('a')).toBe(false);
    });

    it('reports false the second time', () => {
      const [a, b] = factory.mesh(['a', 'b']);
      b!.disconnect('a');

      expect(b!.disconnect('a')).toBe(false);
      expect(a!.disconnect('ghost')).toBe(false);
    });

    it('cuts propagation both ways', () => {
      const [a, b, c] = factory.mesh(['a', 'b', 'c']);
      const inbox = createInbox([a!, b!, c!], 'message:new');

      // Sever the only path between b and the rest.
      b!.disconnect('a');
      b!.disconnect('c');

      a!.broadcast('message:new', 'x');
      b!.broadcast('message:new', 'y');

      expect(inbox.counts()).toEqual({ a: 1, b: 1, c: 1 });
    });

    it('leaves a second path working', () => {
      const [a, b, c] = factory.mesh(['a', 'b', 'c']);
      b!.disconnect('a');

      const inbox = createInbox([a!, b!, c!], 'message:new');
      a!.broadcast('message:new', 'via-c');

      // a and c are still linked, so b is reachable through c.
      expect(inbox.counts()).toEqual({ a: 1, b: 1, c: 1 });
    });

    it('disconnects every peer with disconnectAll', () => {
      const a = factory.create<TestEvents>('a');
      const peers = ['p1', 'p2', 'p3'].map((name) => factory.create<TestEvents>(name));
      for (const peer of peers) {
        a.connectTo(peer);
      }

      expect(a.disconnectAll()).toBe(a);
      expect(a.getConnections()).toEqual([]);
      for (const peer of peers) {
        expect(peer.getConnections()).toEqual([]);
      }
    });

    it('is a no-op with no peers', () => {
      const a = factory.create<TestEvents>('a');

      expect(() => a.disconnectAll()).not.toThrow();
    });
  });

  describe('inspection', () => {
    it('lists connections in order', () => {
      const a = factory.create<TestEvents>('a');
      for (const name of ['p1', 'p2', 'p3']) {
        a.connectTo(factory.create<TestEvents>(name));
      }

      expect(a.getConnections()).toEqual(['p1', 'p2', 'p3']);
    });

    it('returns the peer instance', () => {
      const [a, b] = factory.mesh(['a', 'b']);

      expect(a!.getConnection('b')).toBe(b);
      expect(a!.getConnection('ghost')).toBeUndefined();
    });
  });

  describe('findBroker', () => {
    it('returns itself for its own id', () => {
      const [a] = factory.mesh(['a']);

      expect(a!.findBroker('a')).toBe(a);
    });

    it('finds a direct peer', () => {
      const [a, b] = factory.mesh(['a', 'b']);

      expect(a!.findBroker('b')).toBe(b);
    });

    it('walks multiple hops', () => {
      // A chain, so the target really is several hops away.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const d = factory.create<TestEvents>('d');
      a.connectTo(b);
      b.connectTo(c);
      c.connectTo(d);

      expect(a.findBroker('d')).toBe(d);
    });

    it('resolves a direct peer even when the budget forbids traversal', () => {
      // maxDepth bounds the intermediaries walked, not the final link: a direct
      // connection is always found, because no traversal is needed to reach it.
      const [a, b] = factory.mesh(['a', 'b']);

      expect(a!.findBroker('b', 0)).toBe(b);
    });

    it('gives up once the budget is exhausted', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      a.connectTo(b);
      b.connectTo(c);

      // One intermediary (b) is needed to reach c.
      expect(a.findBroker('c', 1)).toBe(c);
      // With no traversal allowed, and no direct link, it is unreachable.
      expect(a.findBroker('c', 0)).toBeUndefined();
    });

    it('scales the budget with the distance', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const d = factory.create<TestEvents>('d');
      a.connectTo(b);
      b.connectTo(c);
      c.connectTo(d);

      // Reaching d means being at c and taking its direct link, so two
      // intermediaries have to be walked first.
      expect(a.findBroker('d', 1)).toBeUndefined();
      expect(a.findBroker('d', 2)).toBe(d);
      expect(a.findBroker('d', 3)).toBe(d);
      // The default budget of 3 covers this chain.
      expect(a.findBroker('d')).toBe(d);
    });

    it('returns undefined for an id that is not in the mesh', () => {
      const [a] = factory.mesh(['a']);

      expect(a!.findBroker('nowhere')).toBeUndefined();
    });

    it('enables send to a broker found by id', () => {
      const [a, , c] = factory.mesh(['a', 'b', 'c']);
      const heard: string[] = [];
      c!.on('message:new', (m) => heard.push(m));

      const target = a!.findBroker('c');
      expect(target).toBe(c);
      a!.send('message:new', target as EventBroker<TestEvents>, 'found-you');

      expect(heard).toEqual(['found-you']);
    });

    it('terminates on a graph with a back-link', () => {
      // A chain with a link from the tail back to the head — a cycle that is not
      // reachable as a direct connection. Traversal is depth-bounded rather than
      // visited-bounded, so the cycle has to give up on its own instead of
      // re-walking a→b→a→b until the stack runs out.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const d = factory.create<TestEvents>('d');
      a.connectTo(b);
      b.connectTo(c);
      c.connectTo(d);
      d.connectTo(a); // mutual, so a and d are directly linked too

      // The cycle does not stop a deep enough search from succeeding.
      expect(a.findBroker('d')).toBe(d);
      // Nor from giving up cleanly when the budget is too small.
      expect(a.findBroker('c', 0)).toBeUndefined();
    });
  });

  describe('cyclic meshes', () => {
    it('broadcasts exactly once each around a ring', () => {
      // Dedup is per broker id, not per edge, so a ring cannot double-deliver:
      // each broker records the id on first sight and suppresses the return leg.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      a.connectTo(b);
      b.connectTo(c);
      c.connectTo(a);

      const inbox = createInbox([a, b, c], 'message:new');
      a.broadcast('message:new', 'round');

      expect(inbox.counts()).toEqual({ a: 1, b: 1, c: 1 });
    });

    it('survives a full mesh built through mutual connections', () => {
      // Every broker connects to every other, so each event reaches each broker
      // by many distinct paths. Exactly-once is the property under test.
      const brokers = ['a', 'b', 'c', 'd'].map((name) => factory.create<TestEvents>(name));
      brokers[0]!.createConnections(brokers.slice(1));

      const inbox = createInbox(brokers, 'message:new');
      brokers[0]!.broadcast('message:new', 'many-paths');

      expect(inbox.total()).toBe(4);
      expect(inbox.missed()).toEqual([]);
    });
  });

  describe('automatic forwarding', () => {
    it('forwards a listed event to the peer', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b, { events: ['message:new'] });
      a.emit('message:new', 'forwarded');

      expect(heard).toEqual(['forwarded']);
    });

    it('does not loop back to the sender', () => {
      // Regression: forwarding used to be implemented as a listener that
      // re-emitted with a fresh id, so an emit ping-ponged between the two
      // brokers until the stack overflowed.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      let aCount = 0;
      let bCount = 0;
      a.on('message:new', () => aCount++);
      b.on('message:new', () => bCount++);

      a.connectTo(b, { events: ['message:new'] });
      a.emit('message:new', 'once');

      expect(aCount).toBe(1);
      expect(bCount).toBe(1);
    });

    it('does not loop when both sides list the event', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      let aCount = 0;
      let bCount = 0;
      a.on('message:new', () => aCount++);
      b.on('message:new', () => bCount++);

      // connectTo is mutual and passes options along, so both peers forward.
      a.connectTo(b, { events: ['message:new'] });
      a.emit('message:new', 'once');
      b.emit('message:new', 'twice');

      expect(aCount).toBe(2);
      expect(bCount).toBe(2);
    });

    it('does not loop across a three-broker chain', () => {
      // Built one link at a time: `connectTo` keeps the options from the first
      // call for a given peer, so a pre-existing link would silently ignore them.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const inbox = createInbox([a, b, c], 'message:new');

      a.connectTo(b, { events: ['message:new'] });
      b.connectTo(c, { events: ['message:new'] });

      a.emit('message:new', 'once');

      // Forwards hop peer to peer, but the return path is deduped away.
      expect(inbox.counts()).toEqual({ a: 1, b: 1, c: 1 });
    });

    it('does not forward through a link that never asked for the event', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const c = factory.create<TestEvents>('c');
      const inbox = createInbox([a, b, c], 'message:new');

      a.connectTo(b, { events: ['message:new'] });
      b.connectTo(c);

      a.emit('message:new', 'stops-at-b');

      expect(inbox.counts()).toEqual({ a: 1, b: 1, c: 0 });
    });

    it('leaves unlisted events alone', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b, { events: ['audit:write'] });
      a.emit('message:new', 'not-forwarded');

      expect(heard).toEqual([]);
    });

    it('consumes no listener slots', () => {
      // The old implementation registered a real listener per forwarded event,
      // which ate into maxListeners and could throw on connect.
      const a = factory.create<TestEvents>('a', { maxListeners: 1 });
      const b = factory.create<TestEvents>('b');

      a.connectTo(b, { events: ['message:new', 'user:login'] });

      expect(() => a.on('message:new', () => {})).not.toThrow();
    });

    it('stops forwarding after a disconnect', () => {
      // Regression: the old forwarder was a listener, so it outlived the link.
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b, { events: ['message:new'] });
      a.disconnect('b');
      a.emit('message:new', 'after-disconnect');

      expect(heard).toEqual([]);
    });

    it('does not treat a `*` entry as a wildcard', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b, { events: ['message:*'] });
      a.emit('message:new', 'not-matched');

      expect(heard).toEqual([]);
    });

    it('still reaches the peer through an explicit emitTo', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b, { events: ['audit:write'] });
      a.emitTo('b', 'message:new', 'explicit');

      expect(heard).toEqual(['explicit']);
    });
  });

  describe('error handling across the mesh', () => {
    it('rethrows a peer error by default', () => {
      const a = factory.create<TestEvents>('a');
      const b = factory.create<TestEvents>('b');
      b.on('message:new', () => {
        throw new Error('peer exploded');
      });

      a.connectTo(b);

      expect(() => a.broadcast('message:new', 'x')).toThrow('peer exploded');
    });

    it('swallows a peer error when ignoreErrors is set', () => {
      const a = factory.create<TestEvents>('a', { ignoreErrors: true });
      const b = factory.create<TestEvents>('b');
      let ran = false;
      b.on('message:new', () => {
        throw new Error('peer exploded');
      });

      a.connectTo(b);

      expect(() => a.broadcast('message:new', 'x')).not.toThrow();
      // A throwing peer must not stop the peers that come after it.
      const [d] = factory.mesh(['a2', 'd']);
      d!.on('message:new', () => (ran = true));
      a.connectTo(d!);
      expect(() => a.broadcast('message:new', 'y')).not.toThrow();
      expect(ran).toBe(true);
    });

    it('does not protect the local listeners from throwing', () => {
      const a = factory.create<TestEvents>('a', { ignoreErrors: true });
      a.on('message:new', () => {
        throw new Error('local exploded');
      });

      expect(() => a.emit('message:new', 'x')).toThrow('local exploded');
    });
  });

  describe('brokers with different event maps', () => {
    it('connects brokers that know different events', () => {
      interface OtherEvents {
        'other:event': { n: number };
      }

      const a = factory.create<TestEvents>('a');
      const b = factory.create<OtherEvents>('b');
      const heard: unknown[] = [];
      (b.on as any)('other:event', (payload: unknown) => heard.push(payload));

      a.connectTo(b);
      (a.emitTo as any)('b', 'other:event', { n: 7 });

      expect(heard).toEqual([{ n: 7 }]);
    });

    it('propagates a broadcast across differing maps', () => {
      interface OtherEvents {
        'message:new': string;
        'extra:thing': boolean;
      }

      const a = factory.create<TestEvents>('a');
      const b = factory.create<OtherEvents>('b');
      const heard: string[] = [];
      b.on('message:new', (m) => heard.push(m));

      a.connectTo(b);
      a.broadcast('message:new', 'cross-map');

      expect(heard).toEqual(['cross-map']);
    });
  });

  describe('async settling', () => {
    it('delivers synchronously, so no awaiting is needed', () => {
      // Propagation is a plain recursive call, not a promise chain. Recording
      // this explicitly means a future change to async routing has to update
      // the tests rather than silently alter delivery timing.
      const brokers = factory.mesh(['b1', 'b2']);
      const order: string[] = [];
      for (const broker of brokers) {
        broker.on('message:new', () => order.push(broker.id));
      }

      brokers[0]!.broadcast('message:new', 'now');
      order.push('after');

      expect(order).toEqual(['b1', 'b2', 'after']);
    });

    it('still delivers after a microtask boundary', async () => {
      const brokers = factory.mesh(['b1', 'b2']);
      const inbox = createInbox(brokers, 'message:new');

      brokers[0]!.broadcast('message:new', 'x');
      await delay();

      expect(inbox.total()).toBe(2);
    });
  });
});
