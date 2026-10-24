'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getUser } from '@/lib/auth';
import { resetSocket } from '@/lib/socket';
import { useEffect, useState } from 'react';
import type { User } from '@/lib/types';

export default function Header({ connected }: { connected?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => setUser(getUser()), []);

  function logout() {
    clearSession();
    resetSocket();
    router.push('/login');
  }

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`font-mono text-sm transition ${
        pathname === href
          ? 'text-emerald-400'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
      <div className="flex items-center gap-6">
        <span className="font-mono text-sm font-bold tracking-widest text-emerald-400">
          ASYMMETRY
        </span>
        {link('/tasks', 'tasks')}
        {link('/network', 'network')}
      </div>
      <div className="flex items-center gap-3">
        {connected !== undefined && (
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-red-500'
            }`}
            title={connected ? 'socket connected' : 'socket disconnected'}
          />
        )}
        <span className="font-mono text-xs text-zinc-500">
          {user ? `@${user.username}` : ''}
        </span>
        <button
          onClick={logout}
          className="font-mono text-xs text-zinc-500 transition hover:text-red-400"
        >
          logout
        </button>
      </div>
    </header>
  );
}
