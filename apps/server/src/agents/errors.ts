import { ArgsParseError, LLMTimeoutError } from './llm.js';

export function safeFailureReason(error: unknown): string {
  if (error instanceof LLMTimeoutError) {
    return 'model request timed out';
  }
  if (error instanceof Error && error.message.includes('OPENAI_API_KEY is required')) {
    return 'LLM not configured';
  }
  return 'model request failed';
}

export function logAgentError(
  context: string,
  error: unknown,
  includeDetails = false,
): void {
  const category = error instanceof LLMTimeoutError
    ? 'timeout'
    : error instanceof ArgsParseError ? 'bad_args' : 'error';
  console.error(`[agents] ${context} failed: ${category}`);
  if (!includeDetails || process.env.NODE_ENV !== 'development') return;

  let details = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
    : String(error);
  for (const secret of [process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY1]) {
    if (secret) details = details.split(secret).join('[REDACTED]');
  }
  details = details
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
  console.error(`[agents] ${context} error details:\n${details}`);
}
