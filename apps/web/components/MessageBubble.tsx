'use client';

import type { Message } from '@/lib/types';
import { formatTime } from '@/lib/utils';

export default function MessageBubble({
  message,
  agentName,
}: {
  message: Message;
  agentName: (agentId: string) => string;
}) {
  if (message.senderType === 'system') {
    return (
      <p className="my-2 text-center font-mono text-xs italic text-zinc-500">
        {message.body}
      </p>
    );
  }

  const isHuman = message.senderType === 'human';
  return (
    <div className={`mb-3 flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isHuman
            ? 'bg-zinc-700/80 text-zinc-100'
            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
        }`}
      >
        <div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider opacity-60">
          {isHuman ? 'you' : `🤖 ${agentName(message.senderId)}`}
        </div>
        <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        <div className="mt-1 text-right font-mono text-[10px] opacity-40">
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
