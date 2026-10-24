import type { Message } from '@asymmetry/shared';
import { ArgsParseError, type LLMClient, type LLMMessage, type ToolSpec } from './llm.js';

// TODO(D3): align tags with seed
export const ALLOWED_FIELDS = [
  'location_area',
  'price',
  'dates',
  'furnished',
  'vehicle',
  'mileage',
  'title_status',
  'mechanic',
] as const;

export interface CanonicalScope {
  purpose: string;
  fields: string[];
}

export interface DeriveScopeInput {
  title: string;
  mainThread: Message[] | string;
}

const scopeTool: ToolSpec = {
  name: 'set_task_scope',
  description: 'Set the task purpose and the smallest set of information fields needed.',
  parameters: {
    type: 'object',
    properties: {
      purpose: { type: 'string' },
      fields: { type: 'array', items: { type: 'string' } },
    },
    required: ['purpose', 'fields'],
    additionalProperties: false,
  },
};

function threadText(mainThread: DeriveScopeInput['mainThread']): string {
  if (typeof mainThread === 'string') {
    return mainThread;
  }
  return mainThread
    .map((message) => `${message.senderType}: ${message.body}`)
    .join('\n');
}

export async function deriveScope(
  llm: LLMClient,
  { title, mainThread }: DeriveScopeInput,
): Promise<CanonicalScope | null> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'Determine the minimum allowed information fields needed for the human task. Use set_task_scope once. Do not infer or request unrelated information.',
    },
    {
      role: 'user',
      content: `Task: ${title}\n\nMain-thread conversation:\n${threadText(mainThread)}`,
    },
  ];
  const result = await llm.chat(messages, [scopeTool]);
  const call = result.toolCalls?.find(({ name }) => name === 'set_task_scope');
  if (!call || call.args instanceof ArgsParseError || !call.args || typeof call.args !== 'object') {
    return null;
  }

  const args = call.args as { purpose?: unknown; fields?: unknown };
  if (
    typeof args.purpose !== 'string'
    || args.purpose.trim().length === 0
    || !Array.isArray(args.fields)
    || args.fields.some((field) => typeof field !== 'string')
  ) {
    return null;
  }

  const allowedFields = new Set<string>(ALLOWED_FIELDS);
  const fields = [...new Set((args.fields as string[]).filter((field) => allowedFields.has(field)))];
  if (fields.length === 0) {
    return null;
  }
  return { purpose: args.purpose, fields };
}

export interface ScopeValidation {
  ok: boolean;
  fields: string[];
}

export function validateScopeRequest(
  canonical: Pick<CanonicalScope, 'fields'> | null,
  requestedFields: string[],
): ScopeValidation {
  const canonicalFields = new Set(canonical?.fields ?? []);
  const offending = [...new Set(requestedFields.filter((field) => !canonicalFields.has(field)))];
  if (!canonical || offending.length > 0) {
    return { ok: false, fields: offending.length > 0 ? offending : [...new Set(requestedFields)] };
  }
  return { ok: true, fields: [...new Set(requestedFields)] };
}
