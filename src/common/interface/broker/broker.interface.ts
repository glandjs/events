import type { EventBroker } from '../../../broker';
import type { BrokerId, EventPayload, EventRecord, EventReturn, Events } from '../../types/common.types';
import type { BroadcastMethod, CallMethod, ChannelMethod, EmitMethod, GetListenerMethod, OffMethod, OnceMethod, OnMethod, ShutdownMethod, WatchMethod } from '../events/event-api.interface';
import type { EventOptions } from '../events/event-options.interface';
import type { ConnectionOptions } from './broker-connection-options.interface';

/**
 * Everything a broker can do, independent of any particular event map.
 *
 * Implement this to teach the mesh a new kind of node — an HTTP adapter, a queue
 * consumer, a test double. {@link EventBroker} is the in-process implementation;
 * the interface exists so a remote or fake peer can satisfy the same contract.
 */
export interface Broker<TEvents extends EventRecord = EventRecord>
  extends OnMethod<TEvents>,
    OnceMethod<TEvents>,
    CallMethod<TEvents>,
    OffMethod<TEvents>,
    EmitMethod<TEvents>,
    GetListenerMethod<TEvents>,
    ChannelMethod<TEvents>,
    ShutdownMethod,
    BroadcastMethod<TEvents>,
    WatchMethod<TEvents> {
  /** Unique identity of this broker, as configured by `BrokerOptions.name`. */
  id: BrokerId;

  // Event Distribution

  /**
   * Delivers one event to one broker, addressed directly.
   *
   * Takes the target instance rather than an id, and does not require a
   * connection — use {@link Broker.findBroker} to turn an id into an instance.
   * The target processes the event locally but does not relay or echo it.
   */
  send<K extends Events<TEvents>>(event: K, target: EventBroker<TEvents>, payload: EventPayload<TEvents, K>, options?: EventOptions): this;

  // Broker Connections

  /**
   * Adds a peer. Connections are mutual: the peer gains a link back.
   *
   * @throws if `broker` has no id, or is this broker.
   */
  connectTo<TOtherEvents extends EventRecord>(broker: EventBroker<TOtherEvents>, options?: ConnectionOptions): this;

  /** Removes the link to `brokerId` in both directions. `true` if one existed. */
  disconnect(brokerId: BrokerId): boolean;

  /** Whether a direct link to `brokerId` exists. */
  isConnected(brokerId: BrokerId): boolean;

  /** Ids of directly connected peers. */
  getConnections(): BrokerId[];

  /** The peer for `brokerId`, if directly connected. */
  getConnection(brokerId: BrokerId): EventBroker<any> | undefined;

  /** Resolves a broker id to its instance, up to `maxDepth` hops. Defaults to 3. */
  findBroker(brokerId: BrokerId, maxDepth?: number): EventBroker<any> | undefined;

  // Inter-broker Communication

  /** Emits on a connected peer. `false` when there is no such link. */
  emitTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): boolean;

  /** Runs `event` on a connected peer's listeners and returns the result. `[]` if not connected. */
  callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];

  /** Emits on each of `brokerIds`, skipping ids that are not connected. */
  broadcastTo<K extends Events<TEvents>>(brokerIds: BrokerId[], event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this;

  // Mesh

  /** Connects `brokers` to each other and to this broker, forming a full mesh. */
  createConnections<TOtherEvents extends EventRecord>(brokers: Array<EventBroker<TOtherEvents>>, options?: ConnectionOptions): this;
}
