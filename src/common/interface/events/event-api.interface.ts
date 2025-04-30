import type { ChannelEvents, EventRecord, EventType, Listener } from '../../types/common.types';
import type { Channel } from '../channel.interface';
import type { EventOptions } from './event-options.interface';
export interface OnMethod<TEvents extends EventRecord> {
  on<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>): this;
  on<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>, options: EventOptions & { watch?: false }): this;
  on<K extends keyof TEvents & EventType>(event: K, listener: null | Listener<TEvents[K]>, options: EventOptions & { watch: true }): Promise<TEvents[K]>;
}
export interface OnceMethod<TEvents extends EventRecord> {
  once<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>): this;
  once<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]> | null, options: EventOptions & { watch: true }): Promise<TEvents[K]>;
}

export interface CallMethod<TEvents extends EventRecord> {
  call<K extends keyof TEvents & EventType, TReturn extends any>(event: K, data: TEvents[K], strategy: 'first' | 'last'): TReturn | undefined;
  call<K extends keyof TEvents & EventType, TReturn extends any>(event: K, data: TEvents[K], strategy: 'all'): TReturn[];
  call<K extends keyof TEvents & EventType, TReturn extends any>(event: K, data: TEvents[K], strategy: 'race'): Promise<TReturn>;
  call<K extends keyof TEvents & EventType>(event: K, data: TEvents[K], strategy: 'some' | 'every'): boolean;
}
export interface OffMethod<TEvents extends EventRecord> {
  off<K extends keyof TEvents & EventType>(event: K, listener?: Listener<TEvents[K]>): this;
}
export interface EmitMethod<TEvents extends EventRecord> {
  emit<K extends keyof TEvents & EventType>(event: K, payload: TEvents[K], options?: EventOptions): this;
}
export interface GetListenerMethod<TEvents extends EventRecord> {
  getListener<K extends keyof TEvents & EventType, TReturn extends any>(event: K): Listener<TEvents[K], TReturn>[];
}
export interface ChannelMethod<TEvents extends EventRecord> {
  channel<TPrefix extends EventType, TChannelEvents extends ChannelEvents<TPrefix, TEvents> = ChannelEvents<TPrefix, TEvents>>(name: TPrefix): Channel<TChannelEvents>;
}
export interface ShutdownMethod {
  shutdown(): void;
}
export interface BroadcastMethod<TEvents extends EventRecord> {
  broadcast<K extends keyof TEvents & EventType>(event: K, payload: TEvents[K], options?: EventOptions): this;
}
export interface WatchMethod<TEvents extends EventRecord> {
  watch<K extends keyof TEvents & EventType>(event: K, timeoutMs?: number): Promise<TEvents[K]>;
}
