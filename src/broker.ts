import { generateUUID } from './utils';
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
  private readonly _connections = new Map<BrokerId, EventBroker<any>>();
  private readonly _channels = new Map<EventType, Channel<any>>();
  private readonly _eventTraces = new Map<EventType, EventTrace>();
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
    const eventId = options?._eventId || generateUUID();
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

  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all') {
    const listeners = this.getListener(event);

    if (!listeners.length) {
      return [];
    }

    switch (strategy) {
      case 'all': {
        return listeners.map((listener) => listener(data));
      }
      default:
        const firstListener = listeners[0];
        return firstListener(data);
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
    const eventId = generateUUID();

    this.emit(event, payload, {
      ...options,
      _eventId: eventId,
      _sourceId: this._id,
      _propagate: true,
    });

    return this;
  }

  public send<K extends Events<TEvents>>(event: K, target: EventBroker<TEvents>, options?: EventOptions): this {
    const eventId = generateUUID();
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
            _eventId: generateUUID(),
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

    const eventId = generateUUID();
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
  public getConnections(): BrokerId[] {
    return Array.from(this._connections.keys());
  }

  public getConnection(brokerId: BrokerId): EventBroker<any> | undefined {
    return this._connections.get(brokerId);
  }

  public disconnectAll(): this {
    for (const brokerId of this._connections.keys()) {
      this.disconnect(brokerId);
    }
    return this;
  }
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public callTo<K extends Events<TEvents>>(brokerId: BrokerId, event: K, data: EventPayload<TEvents, K>, strategy?: 'all'): EventReturn<TEvents, K> | EventReturn<TEvents, K>[] {
    const broker = this._connections.get(brokerId);

    if (!broker) {
      return [];
    }

    return broker.call(event, data, strategy!) as EventReturn<TEvents, K> | EventReturn<TEvents, K>[];
  }
  public broadcastTo<K extends Events<TEvents>>(brokerIds: BrokerId[], event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const eventId = generateUUID();

    for (const brokerId of brokerIds) {
      const broker = this._connections.get(brokerId);
      if (broker) {
        broker.emit(event, payload, {
          ...options,
          // @ts-ignore
          _eventId: eventId,
          _sourceId: this._id,
          _propagate: false,
        });
      }
    }

    return this;
  }

  public findBroker(brokerId: BrokerId, maxDepth: number = 3): EventBroker<any> | undefined {
    if (this.id === brokerId) {
      return this;
    }

    const directConnection = this._connections.get(brokerId);
    if (directConnection) {
      return directConnection;
    }

    if (maxDepth <= 0) {
      return undefined;
    }

    for (const [, connectedBroker] of this._connections.entries()) {
      if (connectedBroker.id === this.id) {
        continue;
      }

      const found = connectedBroker.findBroker(brokerId, maxDepth - 1);
      if (found) {
        return found;
      }
    }

    return undefined;
  }
  public shutdown(): void {
    this._emitter.shutdown();
    this._connections.clear();
    this._channels.clear();
  }
}
