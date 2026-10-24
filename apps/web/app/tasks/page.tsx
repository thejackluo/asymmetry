'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import TaskList from '@/components/TaskList';
import TaskChat from '@/components/TaskChat';
import { getNetwork, getTasks } from '@/lib/api';
import { clearSession, getToken, useStoredUser } from '@/lib/auth';
import { getSocket, useSocketConnected } from '@/lib/socket';
import type {
  Agent,
  NetworkPayload,
  Task,
  TaskUpdatedPayload,
} from '@/lib/types';
import { EVT } from '@/lib/types';

export default function TasksPage() {
  const router = useRouter();
  const user = useStoredUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const connected = useSocketConnected();
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const socket = getSocket();
    socket.connect(token);
    const refresh = () => {
      getTasks()
        .then((ts) => {
          setTasks(ts);
          if (ts.length && !selectedRef.current) setSelectedId(ts[0].id);
        })
        .catch(() => {});
      getNetwork()
        .then((n) => setAgents(n.agents))
        .catch(() => {});
    };
    const unsubs = [
      // Refetch on (re)connect — recovers any events missed while down.
      socket.on('connect', refresh),
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
      // Auth rejected at socket level — same teardown as a REST 401.
      socket.on('connect_error', (err: Error) => {
        if (/unauthorized|invalid|401/i.test(err?.message ?? '')) {
          clearSession(true);
        }
      }),
    ];

    refresh();

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
      <div className="flex flex-1 overflow-hidden">
        {/* desktop: ~280px list beside chat; mobile: one or the other */}
        <aside
          className={`w-full border-r border-neutral-200 md:block md:w-[280px] md:shrink-0 ${
            selectedId ? 'hidden md:block' : ''
          }`}
        >
          <TaskList
            tasks={tasks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            connected={connected}
            onCreate={(title, done) => {
              // While disconnected, socket.io buffers emits and replays them
              // on reconnect — a retry would double-create the task. Fail fast
              // instead so the title is restored and nothing is queued.
              if (!getSocket().connected()) {
                done(false);
                return;
              }
              let settled = false;
              getSocket().emit(EVT.TASK_CREATE, { title }, (result) => {
                settled = true;
                done(!!result?.ok);
              });
              setTimeout(() => {
                if (!settled) done(false);
              }, 5000);
            }}
          />
        </aside>
        <section
          className={`min-w-0 flex-1 ${selectedId ? 'block' : 'hidden'} md:block`}
        >
          {selected ? (
            <div className="flex h-full flex-col">
              <button
                onClick={() => setSelectedId(null)}
                className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm text-blue-700 md:hidden"
              >
                ← Back to tasks
              </button>
              <div className="min-h-0 flex-1">
                <TaskChat
                  key={selected.id}
                  task={selected}
                  myAgentId={user.agentId}
                  agentName={agentName}
                  connected={connected}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-400">
                Create or select a task to talk to your agent.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
