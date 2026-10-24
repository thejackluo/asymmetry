export const EVENTS = {
  TASK_CREATE: 'task:create',
  CHAT_SEND: 'chat:send',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  CHAT_MESSAGE: 'chat:message',
  SUBCHAT_STARTED: 'subchat:started',
  SUBCHAT_MESSAGE: 'subchat:message',
  SUBCHAT_CLOSED: 'subchat:closed',
  AGENT_STATUS: 'agent:status',
  NETWORK_UPDATED: 'network:updated',
  DISCLOSURE_LOGGED: 'disclosure:logged',
} as const;
