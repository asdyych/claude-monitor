'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatTimeAgo } from '@/lib/formatters';

interface HeaderProps {
  connected: boolean;
  lastUpdated: Date;
  error: string | null;
  onReconnect: () => void;
  onOpenSettings?: () => void;
}

const NAV_TABS = [
  { label: 'Monitor', href: '/monitor' },
  { label: 'Teams', href: '/teams' },
];

export function Header({ connected, lastUpdated, error, onReconnect, onOpenSettings }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-0">
      <div className="flex items-center justify-between h-14">
        <div className="flex items-center gap-4 h-full">
          <h1 className="text-xl font-bold text-gray-900">
            Claude Code Monitor
          </h1>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>

          <nav className="flex items-center h-full ml-2">
            {NAV_TABS.map((tab) => {
              const isActive = pathname === tab.href || (pathname === '/' && tab.href === '/monitor');
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex items-center h-full px-4 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                  )}
                </Link>
              );
            })}
          </nav>
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
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
