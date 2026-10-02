import type { EventBroker } from '../../../broker';
import type { EventType } from '../../types/common.types';

/**
 * A live link to another broker.
 *
 * Routing state, not a listener: it exists for as long as the connection does,
 * and is what {@link Broker.emit} consults to decide where an event goes.
 */
export interface BrokerConnection {
  /** The peer at the other end. */
  readonly broker: EventBroker<any>;

  /**
   * Events auto-forwarded to the peer, from `ConnectionOptions.events`.
   *
   * `undefined` when the peer has no standing forwards — the common case, and
   * the reason `emit` can skip an uninterested peer with one property check.
   */
  readonly forward?: Set<EventType>;
}
