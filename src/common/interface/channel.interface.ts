import type { EventRecord } from '../types/common.types';
import type { BroadcastMethod, CallMethod, ChannelMethod, EmitMethod, GetListenerMethod, OffMethod, OnceMethod, OnMethod, WatchMethod } from './events/event-api.interface';

export interface Channel<TEvents extends EventRecord>
  extends OnMethod<TEvents>,
    OnceMethod<TEvents>,
    OffMethod<TEvents>,
    CallMethod<TEvents>,
    EmitMethod<TEvents>,
    CallMethod<TEvents>,
    GetListenerMethod<TEvents>,
    ChannelMethod<TEvents>,
    BroadcastMethod<TEvents>,
    WatchMethod<TEvents> {
  id: string; // broker id
  name: string; // channel name
}
