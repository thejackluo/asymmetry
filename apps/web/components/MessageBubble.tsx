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
      <p className="my-2 text-center text-xs italic text-neutral-500">
        {message.body}
      </p>
    );
  }

  const isHuman = message.senderType === 'human';
  return (
    <div className={`mb-3 flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[72ch] rounded-lg px-3 py-2 ${
          isHuman
            ? 'bg-blue-600 text-white'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-900'
        }`}
      >
        <div
          className={`mb-0.5 text-[11px] font-medium ${
            isHuman ? 'text-blue-100' : 'text-neutral-500'
          }`}
        >
          {isHuman ? 'You' : agentName(message.senderId)}
        </div>
        <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        <div
          className={`mt-1 text-right text-[10px] ${
            isHuman ? 'text-blue-200' : 'text-neutral-400'
          }`}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
