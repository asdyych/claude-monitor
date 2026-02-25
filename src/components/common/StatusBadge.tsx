'use client';

export function StatusBadge({ status, label, pulse = false }: {
  status: 'active' | 'idle' | 'offline' | 'error' | 'listening' | 'connected';
  label?: string;
  pulse?: boolean;
}) {
  const colorMap: Record<string, string> = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-gray-400',
    error: 'bg-red-500',
    listening: 'bg-blue-500',
    connected: 'bg-green-500'
  };

  const textMap: Record<string, string> = {
    active: 'Active',
    idle: 'Idle',
    offline: 'Offline',
    error: 'Error',
    listening: 'Listening',
    connected: 'Connected'
  };

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100">
      <span className={`w-2 h-2 rounded-full ${colorMap[status]} ${pulse ? 'animate-pulse' : ''}`} />
      {label || textMap[status]}
    </span>
  );
}
