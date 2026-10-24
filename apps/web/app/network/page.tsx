'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import NetworkGraph from '@/components/NetworkGraph';
import { getNetwork } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import type { NetworkPayload, User } from '@/lib/types';
import { EVT } from '@/lib/types';

export default function NetworkPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setUser(getUser());

    const socket = getSocket();
    socket.connect(token);
    const unsubs = [
      socket.on('connect', () => setConnected(true)),
      socket.on('disconnect', () => setConnected(false)),
      socket.on(EVT.NETWORK_UPDATED, (n: NetworkPayload) => setNetwork(n)),
    ];
    getNetwork()
      .then(setNetwork)
      .catch(() => {});
    return () => unsubs.forEach((u) => u());
  }, [router]);

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col">
      <Header connected={connected} />
      {network ? (
        <NetworkGraph network={network} myAgentId={user.agentId} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-xs text-zinc-600">loading network…</p>
        </div>
      )}
    </div>
  );
}
