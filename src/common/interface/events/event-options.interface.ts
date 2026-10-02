import type { BrokerId } from '../../types/common.types';

/**
 * Per-call tuning for subscribing and emitting.
 *
 * All fields are optional and every one of them has a default, so passing `{}`
 * is equivalent to passing nothing.
 */
export interface EventOptions {
  /**
   * Watch instead of subscribe.
   *
   * Turns the call into a promise that settles on the next emit of the event
   * instead of registering a listener.
   */
  watch?: boolean;

  /**
   * Milliseconds before a watcher rejects. Falls back to
   * `BrokerOptions.defaultTimeout`, or the per-call value on {@link EventOptions.watch}.
   */
  timeout?: number;

  /**
   * Value a watcher resolves with when it times out.
   *
   * Tested with `!== undefined`, so `0`, `''`, `false` and `null` are all valid
   * fallbacks. Leaving it undefined makes the timeout a rejection.
   */
  defaultValue?: any;
}

/**
 * Routing metadata carried alongside a payload across the mesh.
 *
 * These three fields are how one emit becomes a mesh-wide operation. They are
 * underscore-prefixed to mark them as transport bookkeeping rather than
 * application input — a caller never sets them by hand; `broadcast`, `send`,
 * `emitTo` and `broadcastTo` do. Set `_eventId` yourself only to reuse a
 * correlation id across two emits.
 */
export interface EmitOptions extends EventOptions {
  /** Correlation id. Generated per emit when omitted; see {@link EmitOptions} on dedup. */
  _eventId?: string;

  /** Broker that originated the event. Defaults to this broker. */
  _sourceId?: BrokerId;

  /** Set to keep forwarding to connected peers, which forward onward in turn. */
  _propagate?: boolean;
}
