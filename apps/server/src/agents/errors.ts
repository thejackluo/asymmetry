import { ArgsParseError, LLMTimeoutError } from './llm.js';

export function safeFailureReason(error: unknown): string {
  if (error instanceof LLMTimeoutError) {
    return 'model request timed out';
  }
  if (error instanceof Error && error.message.includes('OPENAI_API_KEY is required')) {
    return 'LLM not configured';
  }
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status;
    const code = (error as { code?: unknown }).code;
    if (status === 429 && (code === 'credit_balance_exhausted' || code === 'insufficient_quota')) {
      return 'Model service credits are exhausted. Add credits or configure a funded API key, then create a new task.';
    }
    if (status === 429) {
      return 'Model service rate limit reached. Wait briefly, then create a new task.';
    }
    if (status === 401 || status === 403) {
      return 'Model service access was denied. Check the server API credentials and permissions, then create a new task.';
    }
  }
  return 'model request failed';
}

export function logAgentError(context: string, error: unknown): void {
  const category = error instanceof LLMTimeoutError
    ? 'timeout'
    : error instanceof ArgsParseError ? 'bad_args' : 'error';
  console.error(`[agents] ${context} failed: ${category}`);
}
