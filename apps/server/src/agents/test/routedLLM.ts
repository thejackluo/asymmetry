import {
  mockLLM,
  type LLMClient,
  type LLMMessage,
  type MockLLMCall,
  type MockLLMScriptStep,
  type ToolSpec,
} from '../llm.js';

export type RoutedLLMScripts = Record<string, MockLLMScriptStep[]>;

export interface RoutedLLMCall extends MockLLMCall {
  route: string;
}

export type RoutedLLMClient = LLMClient & { calls: RoutedLLMCall[] };

function routeFor(messages: LLMMessage[], scripts: RoutedLLMScripts): string {
  const system = messages.find(({ role }) => role === 'system')?.content ?? '';
  if (system.includes('set_task_scope')) {
    return 'scope';
  }
  const namedRoute = Object.keys(scripts).find((name) => name !== 'scope' && system.includes(`You are ${name},`));
  if (namedRoute) {
    return namedRoute;
  }
  throw new Error(`No routed LLM script matches system prompt: ${system.slice(0, 100)}`);
}

export function routedLLM(scripts: RoutedLLMScripts): RoutedLLMClient {
  const clients = new Map<string, ReturnType<typeof mockLLM>>();
  const calls: RoutedLLMCall[] = [];
  return {
    calls,
    async chat(messages, tools, opts) {
      const route = routeFor(messages, scripts);
      const client = clients.get(route) ?? mockLLM(scripts[route] ?? []);
      clients.set(route, client);
      calls.push({ messages, tools, opts, route });
      return client.chat(messages, tools, opts);
    },
  };
}

export function llmTool(name: string, args: unknown): MockLLMScriptStep {
  return {
    toolCalls: [{ id: `call-${name}`, name, args }],
  };
}

export function noTools(): ToolSpec[] {
  return [];
}
