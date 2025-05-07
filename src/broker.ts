import { BrokerChannel } from './broker-channel';
import type {
  Broker,
  BrokerId,
  BrokerOptions,
  Channel,
  ChannelEvents,
  ConnectionOptions,
  EmitOptions,
  EventOptions,
  EventPayload,
  EventRecord,
  EventReturn,
  Events,
  EventType,
  Listener,
} from './common';
import { EventEmitter } from './engine/event-emitter';
interface EventTrace {
  eventId: EventType;
  sourceId: BrokerId;
  visited: Set<BrokerId>;
  timestamp: number;
}
export class EventBroker<TEvents extends EventRecord> implements Broker<TEvents> {
  private readonly _id: BrokerId;
  private readonly _emitter: EventEmitter<TEvents>;
  private readonly _connections: Map<BrokerId, EventBroker<any>> = new Map();
  private readonly _channels: Map<EventType, Channel<any>> = new Map();
  private readonly _eventTraces: Map<EventType, EventTrace> = new Map();
  constructor(public options: BrokerOptions) {
    this.options = this.normalizeOptions(options);
    this._id = options.name;
    this._emitter = new EventEmitter(this.options.delimiter, this.options.cacheSize, this.options.defaultTimeout, this.options.maxListeners);
  }

  private trackEvent(eventId: EventType, sourceId: BrokerId): EventTrace {
    let trace = this._eventTraces.get(eventId);

    if (!trace) {
      trace = {
        eventId,
        sourceId,
        visited: new Set([this._id]),
        timestamp: Date.now(),
      };
      this._eventTraces.set(eventId, trace);
    } else {
      trace.visited.add(this._id);
    }

    return trace;
  }
  private hasProcessedEvent(eventId: EventType): boolean {
    const trace = this._eventTraces.get(eventId);
    return trace ? trace.visited.has(this._id) : false;
  }
  private normalizeOptions(options: BrokerOptions): BrokerOptions {
    return {
      name: options.name,
      cacheSize: options.cacheSize ?? 6,
      delimiter: options.delimiter ?? ':',
      ignoreErrors: options.ignoreErrors ?? false,
      defaultTimeout: options.defaultTimeout ?? 1000,
      maxListeners: options.maxListeners ?? 5,
    };
  }
  public get id() {
    return this._id;
  }

  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null | Listener<EventPayload<TEvents, K>, void>, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    // @ts-ignore
    const result = this._emitter.on(event, listener, options);
    if (result instanceof Promise) {
      return result;
    }
    return this;
  }
  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    this._emitter.off(event, listener);
    return this;
  }
  public emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EmitOptions): this {
    const eventId = options?._eventId || crypto.randomUUID();
    const sourceId = options?._sourceId || this._id;
    const propagate = options?._propagate ?? false;

    if (!this.hasProcessedEvent(eventId)) {
      this.trackEvent(eventId, sourceId);

      // @ts-ignore
      this._emitter.emit(event, payload, options);

      if (propagate) {
        for (const [brokerId, connectedBroker] of this._connections.entries()) {
          try {
            const trace = this._eventTraces.get(eventId);
            if (trace && !trace.visited.has(brokerId)) {
              connectedBroker.emit(event, payload, {
                ...options,
                // @ts-ignore
                _eventId: eventId,
                _sourceId: sourceId,
                _propagate: true,
              });
            }
          } catch (error) {
            if (!this.options.ignoreErrors) {
              throw error;
            }
          }
        }
      }
    }

    return this;
  }
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>): this;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    // @ts-ignore
    const result = this._emitter.once(event, listener, options);
    if (result instanceof Promise) {
      return result;
    }
    return this;
  }
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    return this._emitter.watch(event, timeoutMs);
  }

  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    return this._emitter.getListener(event);
  }
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'first' | 'last'): EventReturn<TEvents, K> | undefined;

  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K>[];

  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'first' | 'last' | 'all') {
    const listeners = this.getListener(event);

    if (!listeners.length) {
      // Return appropriate default values based on strategy
      if (strategy === 'all') return [];
      return undefined;
    }

    switch (strategy) {
      case 'last': {
        const lastListener = listeners[listeners.length - 1];
        return lastListener ? lastListener(data) : undefined;
      }

      case 'all': {
        return listeners.map((listener) => listener(data));
      }
      case 'first':
      default:
        const firstListener = listeners[0];
        return firstListener ? firstListener(data) : undefined;
    }
  }

  public channel<TPrefix extends EventType, TChannelEvents extends ChannelEvents<TPrefix, TEvents> = ChannelEvents<TPrefix, TEvents>>(name: TPrefix): Channel<TChannelEvents> {
    if (this._channels.has(name)) {
      return this._channels.get(name)!;
    }

    const channel = new BrokerChannel<TChannelEvents, TPrefix>(this, name, this.options.delimiter);
    // @ts-ignore
    this._channels.set(name, channel);
    return channel;
  }
  public broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const eventId = crypto.randomUUID();

    this.emit(event, payload, {
      ...options,
      _eventId: eventId,
      _sourceId: this._id,
      _propagate: true,
    });

    return this;
  }

  public send<K extends Events<TEvents>>(event: K, target: EventBroker<TEvents>, options?: EventOptions): this {
    const eventId = crypto.randomUUID();
    target.emit(
      event,
      // @ts-ignore
      null,
      {
        ...options,
        _eventId: eventId,
        _sourceId: this._id,
        _propagate: false,
      },
    );

    return this;
  }
  public connectTo<TOtherEvents extends EventRecord>(broker: EventBroker<TOtherEvents>, options?: ConnectionOptions): this {
    if (!broker || !broker.id) {
      throw new Error('Invalid broker');
    }
    if (broker.id === this._id) {
      throw new Error(`Cannot connect broker "${this._id}" to itself`);
    }
    if (this._connections.has(broker.id)) {
      return this;
    }

    this._connections.set(broker.id, broker);

    if (typeof broker.connectTo === 'function' && !broker.isConnected(this._id)) {
      broker.connectTo(this, options);
    }

    if (options?.events && options.events.length > 0) {
      for (const event of options.events) {
        this.on(event, (payload) => {
          // @ts-ignore
          broker.emit(event, payload, {
            _eventId: crypto.randomUUID(),
            _sourceId: this._id,
            _propagate: false,
          });
          return undefined;
        });
      }
    }

    return this;
  }

  public disconnect(brokerId: BrokerId): boolean {
    const broker = this._connections.get(brokerId);
    const result = this._connections.delete(brokerId);

    if (result && broker && typeof broker.disconnect === 'function') {
      broker.disconnect(this._id);
    }

    return result;
  }
  public isConnected(brokerId: BrokerId): boolean {
    return this._connections.has(brokerId);
  }

  public emitTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, payload: TEvents[K], options?: EventOptions): boolean {
    const broker = this._connections.get(brokerId);

    if (!broker) {
      return false;
    }

    const eventId = crypto.randomUUID();
    broker.emit(event, payload, {
      ...options,
      // @ts-ignore
      _eventId: eventId,
      _sourceId: this._id,
      _propagate: false,
    });
    return true;
  }

  public createConnections<TOtherEvents extends EventRecord>(brokers: Array<EventBroker<TOtherEvents>>, options?: ConnectionOptions): this {
    for (const broker of brokers) {
      this.connectTo(broker, options);
    }
    for (let i = 0; i < brokers.length; i++) {
      for (let j = i + 1; j < brokers.length; j++) {
        brokers[i].connectTo(brokers[j], options);
      }
    }
    return this;
  }

  public shutdown(): void {
    this._emitter.shutdown();
    this._connections.clear();
    this._channels.clear();
  }
}
