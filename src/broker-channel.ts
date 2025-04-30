import type { Broker, BrokerOptions, Channel, ChannelEvents, EventOptions, EventRecord, EventType, Listener } from './common';

export class BrokerChannel<TChannelEvents extends EventRecord, TPrefix extends string> implements Channel<TChannelEvents> {
  constructor(
    private readonly _broker: Broker<any>,
    private readonly _name: string,
    private readonly _delimiter: BrokerOptions['delimiter'],
  ) {}
  public get id() {
    return this._broker.id;
  }
  public get name() {
    return this._name;
  }
  private _createEventName<K extends keyof TChannelEvents & EventType>(event: K): `${TPrefix}${EventType}${K}` {
    return `${this.name}${this._delimiter}${event}` as `${TPrefix}${EventType}${K}`;
  }
  public on<K extends keyof TChannelEvents & EventType>(event: K, listener: Listener<TChannelEvents[K]>): this;
  public on<K extends keyof TChannelEvents & EventType>(event: K, listener: Listener<TChannelEvents[K]>, options: EventOptions & { watch?: false }): this;
  public on<K extends keyof TChannelEvents & EventType>(event: K, listener: Listener<TChannelEvents[K]> | null, options: EventOptions & { watch: true }): Promise<TChannelEvents[K]>;
  public on<K extends keyof TChannelEvents & EventType>(...args: any[]): this | Promise<TChannelEvents[K]> {
    const [event, listener, options] = args;
    const namespacedEvent = this._createEventName(event);
    const result = this._broker.on(namespacedEvent, listener, options);
    return typeof result === 'object' && result instanceof Promise ? result : this;
  }
  public once<K extends keyof TChannelEvents & EventType>(event: K, listener: Listener<TChannelEvents[K]>): this;
  public once<K extends keyof TChannelEvents & EventType>(event: K, listener: Listener<TChannelEvents[K]> | null, options: EventOptions & { watch: true }): Promise<TChannelEvents[K]>;
  public once<K extends keyof TChannelEvents & EventType>(...args: any[]): this | Promise<TChannelEvents[K]> {
    const [event, listener, options] = args;
    const namespacedEvent = this._createEventName(event);
    const result = this._broker.once(namespacedEvent, listener, options);
    return typeof result === 'object' && result instanceof Promise ? result : this;
  }
  public off<K extends keyof TChannelEvents & EventType>(event: K, listener?: Listener<TChannelEvents[K]>): this {
    const namespacedEvent = this._createEventName(event);
    this._broker.off(namespacedEvent, listener);
    return this;
  }
  public emit<K extends keyof TChannelEvents & EventType>(event: K, payload: TChannelEvents[K], options?: EventOptions): this {
    const namespacedEvent = this._createEventName(event);
    this._broker.emit(namespacedEvent, payload, options);
    return this;
  }

  public call<K extends keyof TChannelEvents & EventType, TReturn extends any>(event: K, data: TChannelEvents[K], strategy: 'first' | 'last'): TReturn | undefined;
  public call<K extends keyof TChannelEvents & EventType, TReturn extends any>(event: K, data: TChannelEvents[K], strategy: 'all'): TReturn[];
  public call<K extends keyof TChannelEvents & EventType, TReturn extends any>(event: K, data: TChannelEvents[K], strategy: 'race'): Promise<TReturn>;
  public call<K extends keyof TChannelEvents & EventType>(event: K, data: TChannelEvents[K], strategy: 'some' | 'every'): boolean;
  public call<K extends keyof TChannelEvents & EventType>(event: K, data: TChannelEvents[K], strategy: 'first' | 'last' | 'all' | 'race' | 'some' | 'every') {
    const namespacedEvent = this._createEventName(event);
    return this._broker.call(namespacedEvent, data, strategy as any) as any;
  }

  public getListener<K extends keyof TChannelEvents & EventType, TReturn extends any>(event: K): Listener<TChannelEvents[K], TReturn>[] {
    const namespacedEvent = this._createEventName(event);
    return this._broker.getListener(namespacedEvent);
  }

  public channel<TNestedPrefix extends string, TNestedEvents extends ChannelEvents<TNestedPrefix, TChannelEvents> = ChannelEvents<TNestedPrefix, TChannelEvents>>(
    name: TNestedPrefix,
  ): Channel<TNestedEvents> {
    const nestedName = `${this.name}${this._delimiter}${name}`;
    return this._broker.channel(nestedName);
  }

  public broadcast<K extends keyof TChannelEvents & EventType>(event: K, payload: TChannelEvents[K], options?: EventOptions): this {
    const namespacedEvent = this._createEventName(event);
    this._broker.broadcast(namespacedEvent, payload, options);
    return this;
  }
  public watch<K extends keyof TChannelEvents & EventType>(event: K, timeoutMs?: number): Promise<TChannelEvents[K]> {
    return this._broker.watch(event, timeoutMs);
  }
}
