import type { EventBroker } from './broker';
import type { BrokerOptions, Channel, ChannelEvents, EventOptions, EventPayload, EventRecord, EventReturn, EventType, Listener, Events } from './common';

export class BrokerChannel<TEvents extends EventRecord, TPrefix extends EventType> implements Channel<TEvents> {
  constructor(
    private readonly _broker: EventBroker<any>,
    private readonly _name: string,
    private readonly _delimiter: BrokerOptions['delimiter'],
  ) {}
  public get id() {
    return this._broker.id;
  }
  public get name() {
    return this._name;
  }
  private _createEventName<K extends Events<TEvents>>(event: K): `${TPrefix}${EventType}${K}` {
    return `${this.name}${this._delimiter}${event}` as `${TPrefix}${EventType}${K}`;
  }
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>, options?: EventOptions): this;
  public on<K extends Events<TEvents>>(event: K, listener: null | Listener<EventPayload<TEvents, K>, void>, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public on<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const namespaced = this._createEventName(event);
    // @ts-ignore
    const result = this._broker.on(namespaced, listener, options);
    return typeof result === 'object' && result instanceof Promise ? result : this;
  }
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void>): this;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options: EventOptions & { watch: true }): Promise<EventPayload<TEvents, K>>;
  public once<K extends Events<TEvents>>(event: K, listener: Listener<EventPayload<TEvents, K>, void> | null, options?: EventOptions & { watch?: boolean }): this | Promise<EventPayload<TEvents, K>> {
    const namespaced = this._createEventName(event);
    // @ts-ignore
    const result = this._broker.once(namespaced, listener, options);
    return typeof result === 'object' && result instanceof Promise ? result : this;
  }
  public off<K extends Events<TEvents>>(event: K, listener?: Listener<EventPayload<TEvents, K>, void>): this {
    const namespaced = this._createEventName(event);
    this._broker.off(namespaced, listener);
    return this;
  }
  public emit<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const namespaced = this._createEventName(event);
    this._broker.emit(namespaced, payload, options);
    return this;
  }

  // @ts-ignore
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>): EventReturn<TEvents, K>;
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy: 'all'): EventReturn<TEvents, K>[];
  public call<K extends Events<TEvents>>(event: K, data: EventPayload<TEvents, K>, strategy?: 'all') {
    const mode = strategy ?? 'first';
    const namespaced = this._createEventName(event);
    // @ts-ignore: We know that _broker.call() matches the expected return type for the strategy.
    return this._broker.call(namespaced, data, mode);
  }

  public getListener<K extends Events<TEvents>>(event: K): Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[] {
    const namespaced = this._createEventName(event);
    return this._broker.getListener(namespaced) as Listener<EventPayload<TEvents, K>, EventReturn<TEvents, K>>[];
  }

  public channel<TNestedPrefix extends string, TNestedEvents extends ChannelEvents<TNestedPrefix, TEvents> = ChannelEvents<TNestedPrefix, TEvents>>(name: TNestedPrefix): Channel<TNestedEvents> {
    const nestedName = `${this.name}${this._delimiter}${name}`;
    return this._broker.channel(nestedName);
  }

  public broadcast<K extends Events<TEvents>>(event: K, payload: EventPayload<TEvents, K>, options?: EventOptions): this {
    const namespaced = this._createEventName(event);
    this._broker.broadcast(namespaced, payload, options);
    return this;
  }
  public watch<K extends Events<TEvents>>(event: K, timeoutMs?: number): Promise<EventPayload<TEvents, K>> {
    return this._broker.watch(event, timeoutMs);
  }
}
