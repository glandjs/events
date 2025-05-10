import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import { EventBroker, type IOEvent } from '../../src';
interface Events {
  'user:login': IOEvent<{ name: string }, string>;
  'message:new': string;
}
function createMesh(size: number): Array<EventBroker<Events>> {
  const brokers: EventBroker<Events>[] = [];
  for (let i = 1; i <= size; i++) {
    brokers.push(new EventBroker<Events>({ name: `broker-${i}` }));
  }
  brokers[0].createConnections(brokers.slice(1));
  return brokers;
}

describe('Broker', () => {
  let broker: EventBroker<Events>;
  beforeEach(() => {
    broker = new EventBroker({ name: 'broker' });
  });
  afterEach(() => {
    broker.shutdown();
  });

  it('call strategies with no listeners return defaults', async () => {
    expect(broker.call('user:login', { name: 'Z' }, 'all')).toEqual([]);
  });
  it('call strategies work with listeners', async () => {
    broker.on('user:login', (p) => 'a:' + p.name);
    broker.on('user:login', async (p) => 'b:' + p.name);
    expect(broker.call('user:login', { name: 'X' })).toBe('a:X');
    const allResults = broker.call('user:login', { name: 'X' }, 'all');
    expect(allResults).toHaveLength(2);
    expect(allResults[0]).toBe('a:X');
    await expect(allResults[1]).resolves.toBe('b:X');
  });
  it('should propagate events on broadcast to connected brokers', async () => {
    const other = new EventBroker<Events>({ name: 'other' });
    const received: string[] = [];
    other.on('user:login', (p) => {
      received.push(p.name);
    });

    broker.connectTo(other);
    broker.broadcast('user:login', { name: 'BF' });

    await new Promise((r) => setTimeout(r, 0));

    expect(received).toContain('BF');
    other.shutdown();
  });
  it('send should deliver only to target broker', () => {
    const other = new EventBroker<Events>({ name: 'other2' });
    let called = false;
    other.on('user:login', () => {
      called = true;
    });

    broker.send('user:login', other);
    expect(called).toBe(true);
    other.shutdown();
  });
  it('should manage connections correctly', () => {
    const a = new EventBroker<Events>({ name: 'A' });
    const b = new EventBroker<Events>({ name: 'B' });

    a.connectTo(b);
    expect(a.isConnected('B')).toBe(true);
    expect(b.isConnected('A')).toBe(true);

    b.disconnect('A');
    expect(b.isConnected('A')).toBe(false);
    expect(a.isConnected('B')).toBe(false);

    a.shutdown();
    b.shutdown();
  });
  it('channel should cache channel instances', () => {
    const ch1 = broker.channel('user:login');
    const ch2 = broker.channel('user:login');
    const ch3 = broker.channel('other:event');
    expect(ch1).toBe(ch2);
    expect(ch1).not.toBe(ch3);
  });
  it('should correctly handle 6 broker connections with broadcast propagation', async () => {
    const a = new EventBroker<Events>({ name: 'A' });
    const b = new EventBroker<Events>({ name: 'B' });
    const c = new EventBroker<Events>({ name: 'C' });
    const d = new EventBroker<Events>({ name: 'D' });
    const e = new EventBroker<Events>({ name: 'E' });
    const f = new EventBroker<Events>({ name: 'F' });

    const brokers = [a, b, c, d, e, f];
    const received: string[] = [];

    brokers.forEach((br) => {
      br.on('user:login', (p) => received.push(`${br.id}:${p.name}`));
    });

    broker.connectTo(a);
    broker.connectTo(b);
    broker.connectTo(c);
    broker.connectTo(d);
    broker.connectTo(e);
    broker.connectTo(f);

    broker.broadcast('user:login', { name: 'star' });

    await new Promise((r) => setTimeout(r, 0));
    expect(received.sort()).toEqual(['A:star', 'B:star', 'C:star', 'D:star', 'E:star', 'F:star']);

    brokers.forEach((br) => br.shutdown());
  });

  describe('Mesh Network Tests', () => {
    [3, 4, 5, 6].forEach((size) => {
      it(`should broadcast to all ${size} brokers`, async () => {
        const brokers = createMesh(size);
        const received: Record<string, string[]> = {};
        brokers.forEach((b) => {
          received[b.id] = [];
          b.on('message:new', (msg) => {
            received[b.id].push(msg);
          });
        });

        const origin = brokers[Math.floor(size / 2)];
        origin.broadcast('message:new', 'hello-mesh');

        await new Promise((r) => setTimeout(r));

        expect(received[origin.id]).toContain('hello-mesh');

        brokers.forEach((b) => {
          expect(received[b.id]).toEqual(['hello-mesh']);
        });

        brokers.forEach((b) => b.shutdown());
      });

      it(`should not deliver direct after disconnect in ${size}-broker mesh`, () => {
        const brokers = createMesh(size);
        const a = brokers[0];
        const b = brokers[1];
        let called = false;
        b.on('message:new', () => {
          called = true;
        });

        a.disconnect(b.id);
        expect(a.isConnected(b.id)).toBe(false);
        expect(b.isConnected(a.id)).toBe(false);

        const ok = a.emitTo(b.id, 'message:new', 'test');
        expect(ok).toBe(false);
        expect(called).toBe(false);

        let broadcastCalled = false;
        b.on('message:new', (m) => {
          if (m === 'via-mesh') broadcastCalled = true;
        });
        a.broadcast('message:new', 'via-mesh');
        setTimeout(() => {
          expect(broadcastCalled).toBe(true);
          brokers.forEach((x) => x.shutdown());
        });
      });
    });
  });
});
