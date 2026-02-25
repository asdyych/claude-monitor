'use client';

import { formatTimeAgo } from '@/lib/formatters';

interface HeaderProps {
  connected: boolean;
  lastUpdated: Date;
  error: string | null;
  onReconnect: () => void;
}

export function Header({ connected, lastUpdated, error, onReconnect }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">
            Claude Code Monitor
          </h1>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {error && (
            <span className="text-sm text-red-500">{error}</span>
          )}
          <span className="text-sm text-gray-500">
            Updated: {formatTimeAgo(lastUpdated)}
          </span>
          {!connected && (
            <button
              onClick={onReconnect}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
