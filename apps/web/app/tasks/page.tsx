'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import TaskList from '@/components/TaskList';
import TaskChat from '@/components/TaskChat';
import { getNetwork, getTasks } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import type {
  Agent,
  NetworkPayload,
  Task,
  TaskUpdatedPayload,
  User,
} from '@/lib/types';
import { EVT } from '@/lib/types';

export default function TasksPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

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
      socket.on(EVT.TASK_CREATED, (t: Task) => {
        setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
        if (!selectedRef.current) setSelectedId(t.id);
      }),
      socket.on(EVT.TASK_UPDATED, (p: TaskUpdatedPayload) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === p.taskId ? { ...t, status: p.status } : t)),
        );
      }),
      socket.on(EVT.NETWORK_UPDATED, (n: NetworkPayload) => {
        setAgents(n.agents);
      }),
    ];

    getTasks()
      .then((ts) => {
        setTasks(ts);
        if (ts.length && !selectedRef.current) setSelectedId(ts[0].id);
      })
      .catch(() => {});
    getNetwork()
      .then((n) => setAgents(n.agents))
      .catch(() => {});

    return () => unsubs.forEach((u) => u());
  }, [router]);

  const agentName = useCallback(
    (agentId: string) =>
      agents.find((a) => a.id === agentId)?.name ?? `agent-${agentId.slice(0, 6)}`,
    [agents],
  );

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col">
      <Header connected={connected} />
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-3">
        <aside className="border-r border-zinc-800 md:col-span-1">
          <TaskList
            tasks={tasks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={(title) =>
              getSocket().emit(EVT.TASK_CREATE, { title })
            }
          />
        </aside>
        <section className="md:col-span-2">
          {selected ? (
            <TaskChat
              task={selected}
              myAgentId={user.agentId}
              agentName={agentName}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-600">
                create or select a task to talk to your agent.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
