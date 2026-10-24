import OpenAI from 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type JSONSchema = {
  type?: string;
  [key: string]: unknown;
};

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface LLMResult {
  reply?: string;
  toolCalls?: ToolCall[];
}

export interface LLMClient {
  chat(
    messages: LLMMessage[],
    tools: ToolSpec[],
    opts?: { signal?: AbortSignal },
  ): Promise<LLMResult>;
}

export class ArgsParseError extends Error {
  constructor(readonly raw: string, options?: ErrorOptions) {
    super('The model returned malformed tool-call JSON arguments', options);
    this.name = 'ArgsParseError';
  }
}

export function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    return new ArgsParseError(raw, { cause: error });
  }
}

function toOpenAIMessage(message: LLMMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content,
    };
  }

  if (message.role === 'assistant' && message.toolCalls) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.args),
        },
      })),
    };
  }

  return { role: message.role, content: message.content };
}

export function openAILLM({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
}: {
  apiKey?: string;
  model?: string;
} = {}): LLMClient {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to create the OpenAI LLM client');
  }

  const client = new OpenAI({ apiKey });

  return {
    async chat(messages, tools, opts) {
      const apiMessages = messages.map(toOpenAIMessage);
      const apiTools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      for (let attempt = 0; ; attempt += 1) {
        try {
          completion = await client.chat.completions.create(
            { model, messages: apiMessages, tools: apiTools },
            { signal: opts?.signal },
          );
          break;
        } catch (error) {
          if (attempt >= 1 || opts?.signal?.aborted) {
            throw error;
          }
        }
      }

      const message = completion.choices[0]?.message;
      const toolCalls = message?.tool_calls?.flatMap((call) => {
        if (call.type !== 'function') {
          return [];
        }
        return [{
          id: call.id,
          name: call.function.name,
          args: parseToolArguments(call.function.arguments),
        }];
      });

      return {
        ...(typeof message?.content === 'string' ? { reply: message.content } : {}),
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    },
  };
}

export type MockLLMScriptStep =
  | LLMResult
  | ((messages: LLMMessage[]) => LLMResult);

export interface MockLLMCall {
  messages: LLMMessage[];
  tools: ToolSpec[];
  opts?: { signal?: AbortSignal };
}

export type MockLLMClient = LLMClient & { calls: MockLLMCall[] };

export function mockLLM(script: MockLLMScriptStep[]): MockLLMClient {
  const calls: MockLLMCall[] = [];
  let step = 0;

  return {
    calls,
    async chat(messages, tools, opts) {
      calls.push({ messages, tools, opts });
      const result = script[step];
      step += 1;
      if (result === undefined) {
        throw new Error('mockLLM script exhausted');
      }
      return typeof result === 'function' ? result(messages) : result;
    },
  };
}

export class LLMTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = 'LLMTimeoutError';
  }
}

export function withTimeout(llm: LLMClient, ms = 30_000): LLMClient {
  return {
    async chat(messages, tools, opts) {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort(opts?.signal?.reason);
      opts?.signal?.addEventListener('abort', forwardAbort, { once: true });
      if (opts?.signal?.aborted) {
        forwardAbort();
      }

      let timeout: ReturnType<typeof setTimeout> | undefined;
      const call = llm.chat(messages, tools, { signal: controller.signal });
      try {
        return await Promise.race([
          call,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new LLMTimeoutError(ms));
            }, ms);
          }),
        ]);
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        opts?.signal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}
