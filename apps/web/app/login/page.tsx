'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, login } from '@/lib/api';
import { setSession } from '@/lib/auth';
import Avatar from '@/components/Avatar';

const demoUsers = [
  { displayName: 'Alice', username: 'alice' },
  { displayName: 'Bob', username: 'bob' },
  { displayName: 'Carol', username: 'carol' },
  { displayName: 'Dave', username: 'dave' },
  { displayName: 'Erin', username: 'erin' },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const loginName = username.trim();
    if (!loginName || !password) return;
    setError(null);
    setPending(true);
    try {
      const { token, user } = await login(loginName, password);
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
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-7 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.22)] sm:p-9">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-[#0a84ff] text-lg font-semibold text-white">
            A
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Asymmetry
          </h1>
        </div>
        <p className="max-w-sm text-sm leading-6 text-neutral-600">
          Your agent asks your friends&apos; agents. Only what&apos;s allowed gets
          shared.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/20"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/20"
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
            className="w-full rounded-xl bg-[#0a84ff] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#0876e5] disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-7 border-t border-neutral-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-700">Demo accounts</p>
            <span className="text-[10px] text-neutral-400">password: demo</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {demoUsers.map((demoUser) => (
              <button
                key={demoUser.username}
                type="button"
                disabled={pending}
                aria-label={`Fill demo account ${demoUser.displayName} (${demoUser.username})`}
                onClick={() => {
                  setUsername(demoUser.username);
                  setPassword('demo');
                  setError(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 px-2.5 py-2 text-left transition hover:border-[#0a84ff]/40 hover:bg-[#0a84ff]/5 disabled:opacity-50"
              >
                <Avatar name={demoUser.displayName} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-neutral-800">
                    {demoUser.displayName}
                  </span>
                  <span className="block truncate text-[10px] text-neutral-500">
                    @{demoUser.username}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
