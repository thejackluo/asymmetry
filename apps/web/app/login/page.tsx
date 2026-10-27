'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, login } from '@/lib/api';
import { setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget.elements as HTMLFormControlsCollection;
    const username = (f.namedItem('username') as HTMLInputElement).value.trim();
    const password = (f.namedItem('password') as HTMLInputElement).value;
    if (!username || !password) return;
    setError(null);
    setPending(true);
    try {
      const { token, user } = await login(username, password);
      setSession(token, user);
      router.replace('/tasks');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Wrong username or password.'
          : 'Could not reach the server — try again.',
      );
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">Asymmetry</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sign in to work with your agent.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-neutral-700"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-neutral-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-neutral-500">
          New here?{' '}
          <Link href="/demo" className="text-blue-700 hover:underline">
            Watch the demo
          </Link>
        </p>
      </div>
    </main>
  );
}
