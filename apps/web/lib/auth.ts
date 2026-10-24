'use client';

import { useSyncExternalStore } from 'react';
import type { User } from './types';

const TOKEN_KEY = 'asym_token';
const USER_KEY = 'asym_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

// Memoized by raw value — JSON.parse must not run on every read or
// useSyncExternalStore sees a fresh object each call (infinite loop).
let cachedRaw: string | null = null;
let cachedUser: User | null = null;

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    if (!raw) {
      cachedUser = null;
    } else {
      try {
        cachedUser = JSON.parse(raw) as User;
      } catch {
        cachedUser = null;
      }
    }
  }
  return cachedUser;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function setSession(token: string, user: User): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

// Central session teardown: clears identity, drops the socket singleton,
// notifies every useStoredUser subscriber, and routes back to login so no
// stale listeners, events, or commands survive an identity change (401 or
// Alice→Bob switch). Imported lazily to avoid a module cycle.
export function clearSession(redirect = false): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  cachedRaw = null;
  cachedUser = null;
  void import('./socket').then(({ resetSocket }) => resetSocket());
  notify();
  if (redirect) window.location.assign('/login');
}

// localStorage is client-only; useSyncExternalStore keeps the SSR/hydration
// snapshot consistent (null) and re-reads after mount — avoids both a
// hydration mismatch and setState-in-effect.
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const readUser = () => getUser();
const readNull = () => null;

export function useStoredUser(): User | null {
  return useSyncExternalStore(subscribe, readUser, readNull);
}
