export interface BrokerOptions {
  /**
   * @description Unique name of this broker. (Required)
   */
  name: string;
  /**
   * @default 6
   */
  cacheSize?: number;

  /**
   * @default ':'
   * @description The delimiter used to segment namespaces.
   */
  delimiter?: string;

  /**
   * @default false
   * @description Disable throwing uncaughtException if an error event is emitted and it has no listeners.
   */
  ignoreErrors?: boolean;

  /**
   * @default 1000
   * @description Default timeout for async operations in ms.
   */
  defaultTimeout?: number;

  /**
   * @default 5
   * @description Maximum number of listeners allowed per event.
   */
  maxListeners?: number;
}
