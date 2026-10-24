'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, ApiError } from '@/lib/api';
import { getToken, setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace('/tasks');
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await login(username.trim(), password);
      setSession(token, user);
      router.push('/tasks');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'wrong password'
          : 'could not reach server — try again',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-mono text-3xl font-bold tracking-widest text-emerald-400 a2a-glow">
            ASYMMETRY
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            your agent asks around. you get opportunities.
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl"
        >
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
            username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          {error && (
            <p className="mt-3 font-mono text-xs text-red-400">error: {error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded bg-emerald-500/90 py-2 font-mono text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'connecting…' : 'enter'}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-600">
            new usernames auto-register
          </p>
        </form>
      </div>
    </main>
  );
}
