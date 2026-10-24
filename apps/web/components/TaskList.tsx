'use client';

import type { Task } from '@/lib/types';

const badge: Record<Task['status'], string> = {
  active: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  stuck: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
};

export default function TaskList({
  tasks,
  selectedId,
  onSelect,
  onCreate,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <form
        className="border-b border-zinc-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            'title',
          ) as HTMLInputElement;
          const title = input.value.trim();
          if (title) {
            onCreate(title);
            input.value = '';
          }
        }}
      >
        <input
          name="title"
          placeholder="new task — what do you need?"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
      </form>
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="p-4 text-sm text-zinc-600">
            no tasks yet — give your agent something to do.
          </p>
        )}
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`block w-full border-b border-zinc-900 px-3 py-3 text-left transition ${
              t.id === selectedId ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'
            }`}
          >
            <div className="truncate text-sm text-zinc-200">{t.title}</div>
            <span
              className={`mt-1 inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${badge[t.status]}`}
            >
              {t.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
