import type { ChannelEvents, EventPayload, EventRecord, EventReturn, Events, Listener } from '../../types/common.types';
import type { Channel } from '../channel.interface';
import type { EventOptions } from './event-options.interface';
export interface OnMethod<TEvents extends EventRecord> {
  on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  on<K extends Events<TEvents>>(event: K, listener: null | Listener<EventPayload<TEvents, K>, void>, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
}
export interface OnceMethod<TEvents extends EventRecord> {
  once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>): this;
  once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
}

export interface CallMethod<TEvents extends EventRecord> {
  call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'first' | 'last'): EventReturn<TEvents, K> | undefined;

  call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K>[];
}
export interface OffMethod<TEvents extends EventRecord> {
  off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this;
}
export interface EmitMethod<TEvents extends EventRecord> {
  emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this;
}
export interface GetListenerMethod<TEvents extends EventRecord> {
  getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[];
}
export interface ChannelMethod<TEvents extends EventRecord> {
  channel<TPrefix extends Events<TEvents>, TChannelEvents extends ChannelEvents<TPrefix, TEvents> = ChannelEvents<TPrefix, TEvents>>(name: TPrefix): Channel<TChannelEvents>;
}
export interface ShutdownMethod {
  shutdown(): void;
}
export interface BroadcastMethod<TEvents extends EventRecord> {
  broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this;
}
export interface WatchMethod<TEvents extends EventRecord> {
  watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>>;
}
