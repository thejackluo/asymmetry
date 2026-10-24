import type { NetworkPayload, Task, TaskHistory, User } from './types';
import { isMockMode, mockApi } from './mock';
import { clearSession, getToken } from './auth';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = await res.json();
      // contract error shape: {error: {code, message}}
      if (body?.error?.message) message = body.error.message;
      else if (typeof body?.error === 'string') message = body.error;
    } catch {
      // keep status message
    }
    // Stale session: clear identity so guards route back to login.
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: User }> {
  if (isMockMode()) return mockApi.login(username, password);
  return apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getTasks(): Promise<Task[]> {
  if (isMockMode()) return mockApi.getTasks();
  return apiFetch('/api/tasks');
}

export async function getTaskMessages(taskId: string): Promise<TaskHistory> {
  if (isMockMode()) return mockApi.getTaskMessages(taskId);
  return apiFetch(`/api/tasks/${taskId}/messages`);
}

export async function getNetwork(): Promise<NetworkPayload> {
  if (isMockMode()) return mockApi.getNetwork();
  return apiFetch('/api/network');
}
