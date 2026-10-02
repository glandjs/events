import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { EventBroker } from '../../src';
import type { Broker, Channel, ChannelEvents, EventPayload, EventRecord, EventReturn, Events, IOEvent, Listener } from '../../src';

/**
 * A type alias, not `interface AppEvents extends EventRecord` — see
 * {@link EventRecord} for why the `extends` form silently disables all checking.
 */
type AppEvents = {
  'user:login': { id: string; username: string };
  'user:logout': { id: string };
  'user:validate': IOEvent<{ name: string; age: number }, boolean>;
  'user:profile:viewed': { id: string };
  'message:new': string;
  'audit:write': { message: string };
  ping: void;
};

/**
 * Compile-time assertions.
 *
 * These earn their place because every failure they guard is silent. A payload
 * that quietly widens to `any`, a channel that stops narrowing its namespace, a
 * `call` that loses its return type — none of these throw at runtime. They only
 * show up in an editor, months later, as a bug somewhere else.
 *
 * `Exact` uses the conditional-type identity trick rather than `extends`, so it
 * catches `any` and `never` as well: `{a: string}` and `{}` are not the same
 * type, and neither is `{a: string}` and `any`.
 */
type Exact<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2 ? true : never;

/**
 * Asserts that the argument's type is exactly `Expected`.
 *
 * A mismatch is a compile error at the call site, which is the whole point —
 * the returned function's parameter is what carries the constraint.
 */
function expectType<Expected>() {
  return function assert<Actual>(_value: Exact<Actual, Expected> extends true ? Actual : never): void {
    /* compile-time only */
  };
}

describe('types', () => {
  // A fresh broker per test: these assertions emit real events, and a shared
  // broker would let one test's listener fire inside another test's emit.
  let broker: EventBroker<AppEvents>;

  beforeEach(() => {
    broker = new EventBroker<AppEvents>({ name: 'typed' });
  });

  afterEach(() => {
    broker.shutdown();
  });

  describe('EventPayload', () => {
    it('unwraps a plain payload', () => {
      expectType<{ id: string; username: string }>()<EventPayload<AppEvents, 'user:login'>>(null as unknown as EventPayload<AppEvents, 'user:login'>);
    });

    it('unwraps an IOEvent payload', () => {
      expectType<{ name: string; age: number }>()<EventPayload<AppEvents, 'user:validate'>>(null as unknown as EventPayload<AppEvents, 'user:validate'>);
    });

    it('keeps a non-object payload intact', () => {
      expectType<string>()<EventPayload<AppEvents, 'message:new'>>(null as unknown as EventPayload<AppEvents, 'message:new'>);
    });

    it('resolves a void payload to void', () => {
      expectType<void>()<EventPayload<AppEvents, 'ping'>>(undefined);
    });
  });

  describe('EventReturn', () => {
    it('is the declared return of an IOEvent', () => {
      expectType<boolean>()<EventReturn<AppEvents, 'user:validate'>>(null as unknown as EventReturn<AppEvents, 'user:validate'>);
    });

    it('is void for an event with no declared return', () => {
      expectType<void>()<EventReturn<AppEvents, 'user:login'>>(undefined);
    });
  });

  describe('Events', () => {
    it('is the union of event names', () => {
      const name = 'user:login' as Events<AppEvents>;
      expectType<'user:login' | 'user:logout' | 'user:validate' | 'message:new' | 'audit:write' | 'ping'>()(name);
    });
  });

  describe('ChannelEvents', () => {
    it('keeps only the names under the prefix, and strips it', () => {
      // Indexed as a type, never dereferenced: the value here is `null`, and
      // reading `.login` off it would fail at runtime while proving nothing.
      type UserChannel = ChannelEvents<'user', AppEvents>;

      expectType<{ id: string; username: string }>()<UserChannel['login']>(null as unknown as UserChannel['login']);
      expectType<{ id: string }>()<UserChannel['logout']>(null as unknown as UserChannel['logout']);
      expectType<IOEvent<{ name: string; age: number }, boolean>>()<UserChannel['validate']>(null as unknown as UserChannel['validate']);
    });

    it('relabels a nested namespace to a compound name', () => {
      // The prefix matches by text, not by segment, so 'user:profile:viewed'
      // lands on the user channel as 'profile:viewed' — still namespaced, and
      // still addressable through a nested channel.
      type UserChannel = ChannelEvents<'user', AppEvents>;

      expectType<{ id: string }>()<UserChannel['profile:viewed']>(null as unknown as UserChannel['profile:viewed']);
    });

    it('omits events from other namespaces', () => {
      type UserChannel = ChannelEvents<'user', AppEvents>;
      // 'write' lives under audit, so a user channel has no such key at all.
      // @ts-expect-error indexing a user channel with an audit event.
      const missing: UserChannel['write'] = 'unreachable';
      expect(missing).toBeDefined();
    });

    it('is empty for a prefix that matches nothing', () => {
      expectType<{}>()<ChannelEvents<'nothing', AppEvents>>({});
    });
  });

  describe('call', () => {
    it('returns the declared type for an answerable event', () => {
      broker.on('user:validate', (data) => data.name.length > 0);

      const answer = broker.call('user:validate', { name: 'ada', age: 36 });
      expectType<boolean>()(answer);
      expect(answer).toBe(true);
    });

    it('returns an array under the all strategy', () => {
      broker.on('user:validate', (data) => data.age >= 18);
      const answers = broker.call('user:validate', { name: 'ada', age: 36 }, 'all');

      expectType<boolean[]>()(answers);
      expect(answers).toEqual([true]);
    });

    it('is typed boolean but yields an array when nobody answers', () => {
      // Worth pinning down rather than leaving to surprise someone: the declared
      // return is `boolean`, and an unanswered request yields `[]` at runtime so
      // a caller can branch on "no handler ran". A `call` result used directly
      // therefore has to tolerate both shapes.
      const silent = new EventBroker<AppEvents>({ name: 'silent' });
      const answer: unknown = silent.call('user:validate', { name: 'ada', age: 36 });

      expect(Array.isArray(answer)).toBe(true);
      expect(answer).toEqual([]);
      silent.shutdown();
    });

    it('returns void for a fire-and-forget event', () => {
      const nothing = broker.call('message:new', 'x');
      expectType<void>()(nothing);
    });
  });

  describe('channel', () => {
    it('narrows the payload to the namespace, with no annotation needed', () => {
      const user = broker.channel('user');

      user.on('login', (payload) => {
        // Known to be { id, username } — no cast, no type annotation.
        expectType<{ id: string; username: string }>()(payload);
        expect(payload.username).toBe('ada');
      });

      user.emit('login', { id: 'u1', username: 'ada' });
    });

    it('rejects an event that is not in the namespace', () => {
      const user = broker.channel('user');
      // @ts-expect-error 'notanevent' is not in the user namespace.
      expect(() => user.on('notanevent', () => {})).not.toThrow();
    });

    it('rejects an event from another namespace', () => {
      const user = broker.channel('user');
      // @ts-expect-error 'write' belongs to audit, not user.
      expect(() => user.on('write', () => {})).not.toThrow();
    });

    it('rejects a payload of the wrong shape', () => {
      const user = broker.channel('user');
      // @ts-expect-error id is declared as a string, not a number.
      expect(() => user.emit('login', { id: 1, username: 'ada' })).not.toThrow();
    });

    it('rejects a missing required payload field', () => {
      const user = broker.channel('user');
      // @ts-expect-error username is required.
      expect(() => user.emit('login', { id: 'u1' })).not.toThrow();
    });

    it('keeps the return type through a channel call', () => {
      const user = broker.channel('user');
      user.on('validate', (data) => data.age >= 18);

      const answer = user.call('validate', { name: 'ada', age: 36 });
      expectType<boolean>()(answer);
      expect(answer).toBe(true);
    });

    it('narrows a nested channel to the deeper namespace', () => {
      const profile = broker.channel('user').channel('profile');

      profile.on('viewed', (payload) => {
        expectType<{ id: string }>()(payload);
        expect(payload.id).toBe('u1');
      });

      profile.emit('viewed', { id: 'u1' });
    });

    it('rejects a shallower event on a nested channel', () => {
      const profile = broker.channel('user').channel('profile');
      // @ts-expect-error 'login' belongs to the user channel, not user:profile.
      expect(() => profile.on('login', () => {})).not.toThrow();
    });
  });

  describe('broker', () => {
    it('rejects an unknown event name', () => {
      // @ts-expect-error 'user:explode' is not declared.
      expect(() => broker.on('user:explode', () => {})).not.toThrow();
    });

    it('rejects a payload of the wrong shape', () => {
      // @ts-expect-error username must be a string.
      expect(() => broker.emit('user:login', { id: 'u1', username: 42 })).not.toThrow();
    });

    it('types a listener payload from the event map', () => {
      const listener: Listener<EventPayload<AppEvents, 'user:login'>> = (payload) => {
        expectType<{ id: string; username: string }>()(payload);
      };
      broker.on('user:login', listener);
    });

    it('narrows a peer call to the same event', () => {
      const peer = new EventBroker<AppEvents>({ name: 'peer' });
      peer.on('user:validate', (data) => data.name.length > 0);
      broker.connectTo(peer);

      const answer = broker.callTo('peer', 'user:validate', { name: 'ada', age: 36 });
      expectType<boolean>()(answer);
      peer.shutdown();
    });
  });

  describe('an untyped broker', () => {
    it('accepts any event name', () => {
      const loose = new EventBroker({ name: 'loose' });
      let seen: unknown;
      loose.on('anything:at:all', (payload) => (seen = payload));

      loose.emit('anything:at:all', { free: 'form' });

      expect(seen).toEqual({ free: 'form' });
      loose.shutdown();
    });

    it('treats payloads as any', () => {
      const loose = new EventBroker({ name: 'loose' });
      let seen: unknown;

      // No declared map, so nothing constrains the payload.
      loose.on('x', (payload) => (seen = payload));
      loose.emit('x', 42);

      expect(seen).toBe(42);
      loose.shutdown();
    });
  });

  describe('Channel', () => {
    it('is satisfied by the concrete implementation', () => {
      const channel: Channel<ChannelEvents<'user', AppEvents>> = broker.channel('user');
      expect(channel.name).toBe('user');
      expect(channel.id).toBe('typed');
    });
  });

  describe('Broker', () => {
    it('is satisfied by the concrete implementation', () => {
      // The point of the interface: an adapter or test double can stand in for
      // `EventBroker` anywhere the mesh takes one.
      const asInterface: Broker<AppEvents> = broker;

      expect(asInterface.id).toBe('typed');
      expect(asInterface.getConnections()).toEqual([]);
    });

    it('defaults to an open event map', () => {
      // An untyped `Broker` is what a heterogeneous node looks like when the
      // mesh code cannot know its event map in advance.
      const anyNode: Broker = new EventBroker({ name: 'loose' });

      expectType<string>()(anyNode.id);
      anyNode.shutdown();
    });

    it('is not satisfied by a broker with a narrower event map', () => {
      // Documented consequence of `Broker.send` and `broadcastTo` taking
      // `EventBroker<TEvents>`: variance flows through the peer argument, so a
      // broker pinned to a specific map cannot stand in for the open one. A
      // typed broker still satisfies `Broker<its own map>`, which is what the
      // mesh actually passes around.
      // @ts-expect-error a pinned broker is not an open Broker.
      const widened: Broker = broker;
      expect(widened).toBeDefined();
    });
  });

  describe('channel prefixes are matched textually, so keep them namespace-shaped', () => {
    it('drops a same-prefix name that belongs to a different namespace', () => {
      // Not a claim: `'username:verify'` is simply absent from a `'user'`
      // channel. The match is textual, and a channel only ever emits
      // `<name><delimiter><event>`, so it could never reach that name anyway.
      type LooseEvents = {
        'username:verify': { token: string };
        'user:login': { id: string };
      };

      type UserChannel = ChannelEvents<'user', LooseEvents>;

      expectType<{ id: string }>()<UserChannel['login']>(null as unknown as UserChannel['login']);
      // @ts-expect-error 'username:verify' is not re-labelled onto a 'user' channel.
      expectType<{ token: string }>()<UserChannel['name:verify']>(null as unknown as UserChannel['name:verify']);
    });

    it('claims it under its own prefix', () => {
      type LooseEvents = {
        'username:verify': { token: string };
        'user:login': { id: string };
      };

      type UsernameChannel = ChannelEvents<'username', LooseEvents>;

      expectType<{ token: string }>()<UsernameChannel['verify']>(null as unknown as UsernameChannel['verify']);
    });
  });
});
