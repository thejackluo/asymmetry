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

export function setSession(token: string, user: User): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

// localStorage is client-only; useSyncExternalStore keeps the SSR/hydration
// snapshot consistent (null) and re-reads after mount — avoids both a
// hydration mismatch and setState-in-effect.
const noop = () => () => {};
const readUser = () => getUser();
const readNull = () => null;

export function useStoredUser(): User | null {
  return useSyncExternalStore(noop, readUser, readNull);
}
