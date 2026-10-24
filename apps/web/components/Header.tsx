'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, useStoredUser } from '@/lib/auth';
import { resetSocket } from '@/lib/socket';

export default function Header({ connected }: { connected?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useStoredUser();

  function logout() {
    clearSession();
    resetSocket();
    router.push('/login');
  }

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm transition ${
        pathname === href
          ? 'font-medium text-blue-700'
          : 'text-neutral-600 hover:text-neutral-900'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <span className="shrink-0 text-sm font-semibold tracking-wide text-neutral-900">
          Asymmetry
        </span>
        {link('/tasks', 'Tasks')}
        {link('/network', 'Network')}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {connected !== undefined && (
          <span
            className={`whitespace-nowrap text-xs ${connected ? 'text-emerald-600' : 'text-red-600'}`}
            role="status"
          >
            {connected ? '● connected' : '● reconnecting'}
          </span>
        )}
        <span className="max-w-24 truncate text-xs text-neutral-500">
          {user ? `@${user.username}` : ''}
        </span>
        <button
          onClick={logout}
          className="whitespace-nowrap text-xs text-neutral-500 transition hover:text-neutral-900"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
