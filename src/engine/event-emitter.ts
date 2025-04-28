import { EventEmitter as GlandEventEmitter } from '@glandjs/emitter';
import { EventWatcher } from './event-watcher';
import type { EventOptions, EventRecord, EventType, Listener } from '../common';

export class EventEmitter<TEvents extends EventRecord> {
  private emitter: GlandEventEmitter;
  private watcher: EventWatcher<TEvents>;
  private defaultOptions: EventOptions = {
    watch: false,
    timeout: 1000,
    defaultValue: null,
  };

  constructor(separator?: string, cacheSize?: number, timeout = 1000) {
    this.emitter = new GlandEventEmitter(separator, cacheSize);
    this.watcher = new EventWatcher<TEvents>(timeout);
    this.defaultOptions.timeout = timeout;
  }

  public on<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>): this;
  public on<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>, options: EventOptions & { watch?: false }): this;
  public on<K extends keyof TEvents & EventType>(event: K, listener: null | Listener<TEvents[K]>, options: EventOptions & { watch: true }): Promise<TEvents[K]>;
  public on<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>, options?: EventOptions): this | Promise<TEvents[K]> {
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
    this.emitter.on(event, listener);
    return this;
  }

  public watch<K extends keyof TEvents & EventType>(event: K, timeout?: number): Promise<TEvents[K]> {
    return this.watcher.watch(event, timeout || this.defaultOptions.timeout);
  }

  public off<K extends keyof TEvents & EventType>(event: K): this;
  public off<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>): this;
  public off<K extends keyof TEvents & EventType>(event: K, listener?: Listener<TEvents[K]>): this {
    this.emitter.off(event, listener);
    return this;
  }

  public emit<K extends keyof TEvents & EventType>(event: K, payload: TEvents[K], options?: EventOptions): this {
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

    return this;
  }

  public dispose(): void {
    this.watcher.dispose();
  }

  public once<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]>): this;
  public once<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]> | null, options: EventOptions & { watch: true }): Promise<TEvents[K]>;
  public once<K extends keyof TEvents & EventType>(event: K, listener: Listener<TEvents[K]> | null, options?: EventOptions): this | Promise<TEvents[K]> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    if (mergedOptions.watch) {
      return this.watcher.watch(event, mergedOptions.timeout);
    }

    const wrapper: Listener<TEvents[K]> = (payload) => {
      // remove after first call
      this.emitter.off(event, wrapper);
      listener && listener(payload);
    };

    this.emitter.on(event, wrapper);
    return this;
  }

  public getListener<K extends keyof TEvents & EventType, TReturn extends any>(event: K): Listener<TEvents[K], TReturn>[] {
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
