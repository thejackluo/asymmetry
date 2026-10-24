import { describe, expect, it } from 'vitest';
import {
  BOB_RELEASED_FACTS,
  DEMO_SCOPE_FIELDS,
  DEMO_TOTAL_FACTS,
  mockApi,
} from './mock';

describe('mock fixture scope agreement', () => {
  it('peer reply releases exactly the canonical scope fields', () => {
    const released = BOB_RELEASED_FACTS.split('·').map((s) => s.trim());
    expect(released).toHaveLength(DEMO_SCOPE_FIELDS.length);
    // no out-of-scope facts may leak into the base transcript
    expect(BOB_RELEASED_FACTS).not.toMatch(/furnished/i);
  });

  it('seed transcript reply matches the exported fixture line', async () => {
    const history = await mockApi.getTaskMessages('t-welcome');
    const bobReply = history.messages.find((m) => m.senderId === 'a-bob');
    expect(bobReply?.body).toContain(BOB_RELEASED_FACTS);
    const request = history.messages.find((m) => m.body.includes('info_request'));
    for (const field of DEMO_SCOPE_FIELDS) {
      expect(request?.body).toContain(field);
    }
    expect(request?.body).not.toMatch(/furnished/i);
  });

  it('demo disclosure counts agree: shared scope-size, withheld remainder', () => {
    // six-fact fixture → shared 3 (scope), withheld 3 (private/out-of-scope)
    expect(DEMO_TOTAL_FACTS - DEMO_SCOPE_FIELDS.length).toBe(3);
  });
});
