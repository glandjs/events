export type IOEvent<TPayload = any, TReturn = void> = {
  payload: TPayload;
  return: TReturn;
};

export type EventType = string;

export type EventRecord = Record<EventType, any>;
export type Events<TEvents extends EventRecord> = keyof TEvents & string;
export type EventPayload<TEvents extends EventRecord, K extends Events<TEvents>> = TEvents[K] extends IOEvent<infer P, any> ? P : TEvents[K];

export type EventReturn<TEvents extends EventRecord, K extends Events<TEvents>> = TEvents[K] extends IOEvent<any, infer R> ? R : void;

export type Listener<Payload = any, Return = void> = (payload: Payload) => Return;
export type BrokerId = string;
export type ChannelEvents<TPrefix extends EventType, TEvents extends EventRecord> = {
  [K in keyof TEvents as K extends `${TPrefix}${EventType}${infer Event}` ? Event : never]: TEvents[K];
};
