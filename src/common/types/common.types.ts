export type EventType = string;
export type EventRecord = Record<EventType, any>;
export type Listener<Payload = any, Return = void> = (payload: Payload) => Return;
export type BrokerId = string;
export type ChannelEvents<TPrefix extends EventType, TEvents extends EventRecord> = {
  [K in keyof TEvents as K extends `${TPrefix}${EventType}${infer Event}` ? Event : never]: TEvents[K];
};
