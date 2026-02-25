'use client';

import { ProxyStatus } from '@/types/connection';
import { StatusBadge } from '@/components/common';
import { formatTimeAgo } from '@/lib/formatters';

interface ConnectionStatusProps {
  status: ProxyStatus;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Claude Code Proxy
        </h3>
        <StatusBadge
          status={status.isListening ? 'listening' : 'offline'}
          pulse={status.isListening}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Port</span>
          <span className="font-mono text-gray-900">{status.port}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Active Connections</span>
          <span className={`font-semibold ${status.activeConnections > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {status.activeConnections}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Last Checked</span>
          <span className="text-gray-400 text-xs">
            {formatTimeAgo(status.lastChecked)}
          </span>
        </div>
      </div>

      {status.connections.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Active Connections</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {status.connections.map((conn, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 font-mono">
                  {conn.remoteAddress}:{conn.remotePort}
                </span>
                <span className="text-green-500">ESTABLISHED</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
