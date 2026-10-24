'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import NetworkGraph from '@/components/NetworkGraph';
import { getNetwork } from '@/lib/api';
import { clearSession, getToken, useStoredUser } from '@/lib/auth';
import { getSocket, useSocketConnected } from '@/lib/socket';
import type { NetworkPayload } from '@/lib/types';
import { EVT } from '@/lib/types';

export default function NetworkPage() {
  const router = useRouter();
  const user = useStoredUser();
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const connected = useSocketConnected();
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const socket = getSocket();
    socket.connect(token);
    const refresh = () => {
      getNetwork()
        .then((n) => {
          setNetwork(n);
          setLoadError(false);
        })
        .catch(() => setLoadError(true));
    };
    const unsubs = [
      socket.on('connect', refresh),
      socket.on(EVT.NETWORK_UPDATED, (n: NetworkPayload) => setNetwork(n)),
      socket.on('connect_error', (err: Error) => {
        if (/unauthorized|invalid|401/i.test(err?.message ?? '')) {
          clearSession(true);
        }
      }),
    ];
    refresh();
    return () => unsubs.forEach((u) => u());
  }, [router]);

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col">
      <Header connected={connected} />
      {loadError ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-xs text-red-400">
            couldn&apos;t load the network — reconnecting will retry
          </p>
        </div>
      ) : network ? (
        network.agents.length > 0 ? (
          <NetworkGraph network={network} myAgentId={user.agentId} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="font-mono text-xs text-zinc-600">
              no agents on the network yet
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-xs text-zinc-600">loading network…</p>
        </div>
      )}
    </div>
  );
}
