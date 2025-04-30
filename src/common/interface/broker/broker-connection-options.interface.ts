import type { EventType } from '../../types/common.types';

export interface ConnectionOptions {
  /**
   * @description Events to forward automatically.
   */
  events?: EventType[];
}
