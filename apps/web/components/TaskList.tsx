'use client';

import { useState } from 'react';
import type { Message, Task } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import Avatar from './Avatar';

export default function TaskList({
  tasks,
  selectedId,
  onSelect,
  onCreate,
  connected,
  lastMessages,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string, done: (ok: boolean) => void) => void;
  connected: boolean;
  lastMessages: Record<string, Message | undefined>;
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
          placeholder={
            connected ? 'New task — what do you need?' : 'Reconnecting…'
          }
          disabled={!connected}
          className="w-full rounded-full border-0 bg-[#f2f2f7] px-4 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[#0a84ff]/30 disabled:bg-neutral-100 disabled:text-neutral-400"
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
        {tasks.map((t) => {
          const message = lastMessages[t.id];
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={t.id === selectedId}
              className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0a84ff] ${
                t.id === selectedId
                  ? 'bg-[#0a84ff]/10'
                  : 'hover:bg-neutral-50'
              }`}
            >
              <Avatar name={t.title} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-900">
                  {t.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-500">
                  {message?.body ?? 'No messages yet'}
                </span>
              </span>
              <time className="shrink-0 self-start pt-0.5 text-[10px] text-neutral-400">
                {formatTime(message?.createdAt ?? t.createdAt)}
              </time>
            </button>
          );
        })}
      </div>
    </div>
  );
}
