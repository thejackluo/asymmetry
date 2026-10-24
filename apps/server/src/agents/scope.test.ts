import { describe, expect, it } from 'vitest';
import { mockLLM } from './llm.js';
import { ALLOWED_FIELDS, deriveScope, validateScopeRequest } from './scope.js';

describe('canonical task scope', () => {
  it('derives a deduplicated allowlisted scope with one internal tool call', async () => {
    const llm = mockLLM([{
      toolCalls: [{
        id: 'scope-1',
        name: 'set_task_scope',
        args: {
          purpose: 'find a summer room',
          fields: ['location_area', 'price', 'price', 'private_notes'],
        },
      }],
    }]);

    await expect(deriveScope(llm, {
      title: 'Find a summer room',
      mainThread: 'Near campus, May through August.',
    })).resolves.toEqual({
      purpose: 'find a summer room',
      fields: ['location_area', 'price'],
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.tools.map(({ name }) => name)).toEqual(['set_task_scope']);
  });

  it('fails closed for absent tool calls, malformed arguments, or empty allowed fields', async () => {
    const noTool = mockLLM([{ reply: 'no scope' }]);
    const malformed = mockLLM([{
      toolCalls: [{ id: 'bad', name: 'set_task_scope', args: { purpose: '', fields: ['price'] } }],
    }]);
    const empty = mockLLM([{
      toolCalls: [{
        id: 'empty',
        name: 'set_task_scope',
        args: { purpose: 'find a room', fields: ['unsupported'] },
      }],
    }]);
    const input = { title: 'Find a room', mainThread: 'Looking for a room.' };

    await expect(deriveScope(noTool, input)).resolves.toBeNull();
    await expect(deriveScope(malformed, input)).resolves.toBeNull();
    await expect(deriveScope(empty, input)).resolves.toBeNull();
  });

  it('rejects requested fields outside canonical scope without trimming them', () => {
    expect(validateScopeRequest(
      { fields: ['location_area', 'price'] },
      ['price', 'mechanic', 'mechanic'],
    )).toEqual({ ok: false, fields: ['mechanic'] });
    expect(validateScopeRequest(
      { fields: ['location_area', 'price'] },
      ['price', 'price'],
    )).toEqual({ ok: true, fields: ['price'] });
    expect(validateScopeRequest(null, ['price'])).toEqual({ ok: false, fields: ['price'] });
  });

  it('uses the fixed task field allowlist', () => {
    expect(ALLOWED_FIELDS).toEqual([
      'location_area',
      'price',
      'dates',
      'furnished',
      'vehicle',
      'mileage',
      'title_status',
      'mechanic',
    ]);
  });
});
