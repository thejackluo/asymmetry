import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearSession } = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock('./auth', () => ({
  getToken: () => 'tok',
  clearSession,
  setSession: vi.fn(),
  useStoredUser: () => null,
}));
vi.mock('./mock', () => ({
  isMockMode: () => false,
  mockApi: {},
}));

import { ApiError, getTasks, login } from './api';

const res = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status }),
  ) as Promise<Response>;

beforeEach(() => {
  clearSession.mockClear();
});

describe('apiFetch 401 handling', () => {
  it('login 401 surfaces ApiError — no teardown, no redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => res(401, { error: { code: 'UNAUTHORIZED', message: 'bad credentials' } })),
    );
    await expect(login('alice', 'wrong')).rejects.toThrowError(ApiError);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('protected-route 401 tears the session down and redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res(401, { error: { code: 'UNAUTHORIZED', message: 'stale' } })));
    await expect(getTasks()).rejects.toThrowError(ApiError);
    expect(clearSession).toHaveBeenCalledWith(true);
  });
});
