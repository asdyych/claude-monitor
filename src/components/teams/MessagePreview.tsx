'use client';

import { TeamMessage } from '@/types/team';
import { formatTimestamp } from '@/lib/formatters';

interface MessagePreviewProps {
  messages: TeamMessage[];
}

export function MessagePreview({ messages }: MessagePreviewProps) {
  if (messages.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">No recent messages</p>
    );
  }

  return (
    <div className="space-y-2">
      {messages.slice(0, 3).map((msg, i) => (
        <div key={i} className="text-xs">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="font-medium"
              style={{ color: msg.color || '#374151' }}
            >
              {msg.from}
            </span>
            <span className="text-gray-400">
              {formatTimestamp(msg.timestamp)}
            </span>
          </div>
          <p className="text-gray-600 line-clamp-2 pl-0.5 border-l-2 border-gray-200">
            {msg.summary || msg.text.slice(0, 100)}
            {msg.text.length > 100 && '...'}
          </p>
        </div>
      ))}
    </div>
  );
}
