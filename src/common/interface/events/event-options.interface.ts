import type { BrokerId } from '../../types/common.types';

export interface EventOptions {
  timeout?: number;
  watch?: boolean;
  defaultValue?: any;
}
export interface EmitOptions extends EventOptions {
  _eventId?: string;
  _sourceId?: BrokerId;
  _propagate?: boolean;
}
