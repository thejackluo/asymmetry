'use client';

import type { Message } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import Avatar from './Avatar';

export default function MessageBubble({
  message,
  agentName,
  align,
  showName = true,
  showAvatar = false,
  compact = false,
}: {
  message: Message;
  agentName: (agentId: string) => string;
  align?: 'left' | 'right';
  showName?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
}) {
  if (message.senderType === 'system') {
    return (
      <p className="my-2 text-center">
        <span className="inline-block rounded-full bg-black/5 px-3 py-1 text-xs text-neutral-600">
          {message.body}
        </span>
      </p>
    );
  }

  const isOutgoing = align
    ? align === 'right'
    : message.senderType === 'human';
  const sender =
    message.senderType === 'agent' ? agentName(message.senderId) : null;
  return (
    <div
      className={`flex items-end gap-2 ${
        isOutgoing ? 'justify-end' : 'justify-start'
      } ${showName ? 'mt-2.5' : 'mt-0.5'}`}
    >
      {!isOutgoing && (
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-end ${compact ? 'w-8' : 'w-10'}`}
        >
          {showAvatar && sender && (
            <Avatar name={sender} size={compact ? 'sm' : 'md'} />
          )}
        </span>
      )}
      <div
        className={`relative max-w-[75%] rounded-[18px] px-3 ${
          compact ? 'py-2' : 'py-2.5'
        } ${
          isOutgoing
            ? 'rounded-br-[4px] bg-[#0a84ff] text-white'
            : 'rounded-bl-[4px] border border-[#e5e5ea] bg-white text-neutral-900'
        }`}
      >
        {showName && sender && (
          <div
            className={`mb-0.5 text-[11px] font-medium ${
              isOutgoing ? 'text-blue-100' : 'text-neutral-500'
            }`}
          >
            {sender}
          </div>
        )}
        <div>
          <p
            className={`whitespace-pre-wrap break-words ${
              compact ? 'text-xs leading-4' : 'text-sm leading-5'
            }`}
          >
            {message.body}
          </p>
          <time
            className={`mt-1 block text-right text-[10px] leading-3 ${
              isOutgoing ? 'text-blue-100' : 'text-neutral-400'
            }`}
          >
            {formatTime(message.createdAt)}
          </time>
        </div>
      </div>
    </div>
  );
}
