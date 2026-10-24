'use client';

import { useState } from 'react';
import type { Task } from '@/lib/types';

const badge: Record<Task['status'], string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  stuck: 'bg-amber-50 text-amber-700 border-amber-200',
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
  onCreate: (title: string, done: (ok: boolean) => void) => void;
}) {
  const [createError, setCreateError] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col bg-white">
      <form
        className="border-b border-neutral-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            'title',
          ) as HTMLInputElement;
          const title = input.value.trim();
          if (title) {
            // Optimistic clear; restore the title if the server never
            // confirms the create instead of losing the request.
            onCreate(title, (ok) => {
              if (ok) {
                setCreateError(null);
              } else {
                input.value = title;
                setCreateError(
                  'Task not created — connection problem. Your request was kept above.',
                );
              }
            });
            input.value = '';
          }
        }}
      >
        <label htmlFor="new-task-title" className="sr-only">
          New task
        </label>
        <input
          id="new-task-title"
          name="title"
          placeholder="New task — what do you need?"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        {createError && (
          <p role="alert" className="mt-2 text-xs text-amber-700">
            {createError}
          </p>
        )}
      </form>
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">
            No tasks yet — give your agent something to do.
          </p>
        )}
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={t.id === selectedId}
            className={`block w-full border-b border-neutral-100 px-3 py-3 text-left transition ${
              t.id === selectedId
                ? 'border-l-2 border-l-blue-600 bg-blue-50/60'
                : 'hover:bg-neutral-50'
            }`}
          >
            <div className="truncate text-sm text-neutral-900">{t.title}</div>
            <span
              className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badge[t.status]}`}
            >
              {t.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
