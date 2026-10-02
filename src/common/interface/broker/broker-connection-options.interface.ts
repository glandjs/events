import type { EventType } from '../../types/common.types';

/**
 * Options for {@link Broker.connectTo} and {@link Broker.createConnections}.
 */
export interface ConnectionOptions {
  /**
   * Events to forward to the peer automatically.
   *
   * A standing subscription at the routing level: after connecting, every emit of
   * these events on this broker is also delivered to the peer, with no
   * per-message work from the caller.
   *
   * Forwarding shares the original event's correlation id, so it cannot loop. A
   * peer that re-emits a forwarded event is suppressed by dedup rather than
   * bouncing it back.
   *
   * Names are matched exactly — a `'user:*'` entry is not a wildcard here. Use
   * the emitter's own `*` matching on the peer instead.
   *
   * Ignored when `connectTo` is called for a peer that is already connected; the
   * first call's options win.
   *
   * @example
   * broker.connectTo(httpAdapter, { events: ['route:registered'] });
   */
  events?: EventType[];
}
