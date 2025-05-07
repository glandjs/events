import { EventEmitter as GlandEventEmitter } from '@glandjs/emitter';
import { EventWatcher } from './event-watcher';
import type { EventOptions, EventPayload, EventRecord, EventReturn, Events, EventType, GetListenerMethod, Listener, OnceMethod, OnMethod, ShutdownMethod, WatchMethod } from '../common';

export class EventEmitter<TEvents extends EventRecord> implements OnMethod<TEvents>, OnceMethod<TEvents>, GetListenerMethod<TEvents>, ShutdownMethod, WatchMethod<TEvents> {
  private emitter: GlandEventEmitter;
  private watcher: EventWatcher<TEvents>;
  private defaultOptions: EventOptions = {
    watch: false,
    timeout: 1000,
    defaultValue: null,
  };

  private maxListeners: number;
  constructor(separator?: string, cacheSize?: number, timeout = 1000, maxListeners = 5) {
    this.emitter = new GlandEventEmitter(separator, cacheSize);
    this.watcher = new EventWatcher<TEvents>(timeout);
    this.maxListeners = maxListeners;
    this.defaultOptions.timeout = timeout;
  }

  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null | Listener<EventPayload<TEvents, K>, void>, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    if (mergedOptions.watch) {
      return this.watcher.watch(event, mergedOptions.timeout).then(
        (result) => result,
        (error) => {
          if (mergedOptions.defaultValue) {
            return mergedOptions.defaultValue;
          }
          throw error;
        },
      );
    }
    if (!listener) {
      throw new Error(`Listener cannot be null unless 'watch: true' is explicitly set in options.`);
    }

    const currentListeners = this.getListener(event);
    if (currentListeners.length >= this.maxListeners) {
      throw new Error(`Maximum listeners (${this.maxListeners}) exceeded for event '${event}'`);
    }

    this.emitter.on(event, listener!);
    return this;
  }

  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    return this.watcher.watch(event, timeoutMs || this.defaultOptions.timeout);
  }

  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    this.emitter.off(event, listener);
    return this;
  }

  public emit<K extends keyof TEvents & EventType>(event: K, payload: TEvents[K], options?: EventOptions): void {
    this.watcher.onEmit(event, payload);

    this.emitter.emit(event, payload);
    if (options?.watch) {
      this.watch(event, options.timeout).catch((err) => {
        if (options.defaultValue) {
          return options.defaultValue;
        }
        throw err;
      });
    }
  }
  public shutdown(): void {
    this.watcher.shutdown();
  }

  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>): this;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    if (mergedOptions.watch) {
      return this.watcher.watch(event, mergedOptions.timeout);
    }

    const currentListeners = this.getListener(event);
    if (currentListeners.length >= this.maxListeners) {
      throw new Error(`Maximum listeners (${this.maxListeners}) exceeded for event '${String(event)}'`);
    }
    const wrapper: Listener<TEvents[K]> = (payload) => {
      // remove after first call
      this.emitter.off(event, wrapper);
      listener && listener(payload);
    };

    this.emitter.on(event, wrapper);
    return this;
  }

  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    const parts = event.split(this.emitter['spliter']);
    let node = this.emitter['tree'];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!node[part]) {
        return [];
      }
      node = node[part];
    }

    return Array.isArray(node) ? node : [];
  }
}
