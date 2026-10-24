import { CLIENT_EVENTS, SERVER_EVENTS } from '@asymmetry/shared';

export { CLIENT_EVENTS, SERVER_EVENTS } from '@asymmetry/shared';

export const EVENTS = {
  ...CLIENT_EVENTS,
  ...SERVER_EVENTS,
} as const;
