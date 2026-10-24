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

export function logAgentError(context: string, error: unknown): void {
  const category = error instanceof LLMTimeoutError
    ? 'timeout'
    : error instanceof ArgsParseError ? 'bad_args' : 'error';
  console.error(`[agents] ${context} failed: ${category}`);
}
