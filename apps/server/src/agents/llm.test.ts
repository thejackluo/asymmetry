import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { openAILLM } from './llm.js';
import {
  ArgsParseError,
  LLMTimeoutError,
  mockLLM,
  parseToolArguments,
  withTimeout,
  type LLMMessage,
  type ToolSpec,
} from './llm.js';

const { openAICompletionCreate } = vi.hoisted(() => ({
  openAICompletionCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openAICompletionCreate } };
  },
}));

const message: LLMMessage = { role: 'user', content: 'hello' };
const tools: ToolSpec[] = [];

describe('LLM adapters', () => {
  it('omits the tools parameter when no tools are supplied', async () => {
    openAICompletionCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'done', tool_calls: [] } }],
    });

    await openAILLM({ apiKey: 'test-key' }).chat([message], []);

    const params = openAICompletionCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.hasOwn(params, 'tools')).toBe(false);
  });

  it('maps an explicit tool choice to OpenAI function calling', async () => {
    openAICompletionCreate.mockClear();
    openAICompletionCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null, tool_calls: [] } }],
    });

    const llm = openAILLM({ apiKey: 'test-key' });
    const scopeTool: ToolSpec = {
      name: 'set_task_scope',
      description: 'Set the task scope.',
      parameters: { type: 'object' },
    };
    await Reflect.apply(llm.chat, llm, [
      [message],
      [scopeTool],
      { toolChoice: { name: 'set_task_scope' } },
    ]);

    const params = openAICompletionCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.tool_choice).toEqual({
      type: 'function',
      function: { name: 'set_task_scope' },
    });
  });

  it('returns mock script steps in order and records each request', async () => {
    const llm = mockLLM([
      { reply: 'first' },
      (messages) => ({ reply: messages[0]?.content }),
    ]);

    await expect(llm.chat([message], tools)).resolves.toEqual({ reply: 'first' });
    await expect(llm.chat([message], tools)).resolves.toEqual({ reply: 'hello' });
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0]).toMatchObject({ messages: [message], tools });
    await expect(llm.chat([message], tools)).rejects.toThrow('script exhausted');
  });

  it('returns a visible parse error for malformed tool arguments', () => {
    const args = parseToolArguments('{bad json');
    expect(args).toBeInstanceOf(ArgsParseError);
    expect((args as ArgsParseError).raw).toBe('{bad json');
  });

  it('aborts and rejects when the model request times out', async () => {
    let signal: AbortSignal | undefined;
    const llm = {
      async chat(_messages: LLMMessage[], _tools: ToolSpec[], opts?: { signal?: AbortSignal }) {
        signal = opts?.signal;
        return new Promise<never>(() => {});
      },
    };

    await expect(withTimeout(llm, 5).chat([message], tools)).rejects.toBeInstanceOf(LLMTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it('keeps OpenAI imports confined to llm.ts', () => {
    const directory = fileURLToPath(new URL('.', import.meta.url));
    const modules = readdirSync(directory).filter(
      (entry) => entry.endsWith('.ts') && entry !== 'llm.ts' && entry !== 'llm.test.ts',
    );

    for (const module of modules) {
      const source = readFileSync(join(directory, module), 'utf8');
      expect(source, module).not.toMatch(/(?:from|import)\s*['"]openai['"]/);
    }
  });
});
