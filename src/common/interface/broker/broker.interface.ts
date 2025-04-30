import type { BrokerId, EventRecord, EventType } from '../../types/common.types';
import type { BroadcastMethod, CallMethod, ChannelMethod, EmitMethod, GetListenerMethod, OffMethod, OnceMethod, OnMethod, ShutdownMethod, WatchMethod } from '../events/event-api.interface';
import type { EventOptions } from '../events/event-options.interface';
import type { ConnectionOptions } from './broker-connection-options.interface';
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
  id: BrokerId;
  // Event Distribution
  send<K extends keyof TEvents & EventType>(event: K, target: Broker<TEvents>, options?: EventOptions): this;

  // Broker Connections
  disconnect(brokerId: BrokerId): boolean;

  connectTo<TOtherEvents extends EventRecord>(broker: Broker<TOtherEvents>, options?: ConnectionOptions): this;

  isConnected(brokerId: BrokerId): boolean;

  // Inter-broker Communication
  emitTo<K extends keyof TEvents & EventType>(brokerId: BrokerId, event: K, payload: TEvents[K], options?: EventOptions): boolean;

  // Mesh
  createConnections<TOtherEvents extends EventRecord>(brokers: Array<Broker<TOtherEvents>>, options?: ConnectionOptions): this;
}
