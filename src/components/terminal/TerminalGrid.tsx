'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ManagedProcess } from '@/types/managed-process';

// Dynamic import to avoid SSR issues with xterm.js
const TerminalView = dynamic(
  () => import('./TerminalView').then((mod) => mod.TerminalView),
  { ssr: false, loading: () => <div className="flex-1 bg-[#0d1117] animate-pulse rounded" /> }
);

interface TerminalGridProps {
  processes: ManagedProcess[];
  onClose?: () => void;
  /** Auto-focus terminal belonging to this member when a dispatch is running */
  activeMemberName?: string | null;
}

type GridLayout = '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x2';

interface LayoutConfig {
  label: string;
  cols: number;
  rows: number;
}

const LAYOUTS: Record<GridLayout, LayoutConfig> = {
  '1x1': { label: '1', cols: 1, rows: 1 },
  '1x2': { label: '1×2', cols: 2, rows: 1 },
  '2x1': { label: '2×1', cols: 1, rows: 2 },
  '2x2': { label: '2×2', cols: 2, rows: 2 },
  '2x3': { label: '2×3', cols: 3, rows: 2 },
  '3x2': { label: '3×2', cols: 2, rows: 3 },
};

function getAutoLayout(count: number): GridLayout {
  if (count <= 1) return '1x1';
  if (count <= 2) return '1x2';
  if (count <= 4) return '2x2';
  if (count <= 6) return '2x3';
  return '3x2';
}

export function TerminalGrid({ processes, onClose, activeMemberName }: TerminalGridProps) {
  const [focusedId, setFocusedId] = useState<string | null>(processes[0]?.id ?? null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<GridLayout>(() => getAutoLayout(processes.length));

  // Auto-focus the terminal of the member currently executing a dispatched task.
  // Skip auto-focus if user has manually maximized a terminal.
  useEffect(() => {
    if (!activeMemberName || maximizedId) return;
    const match = processes.find((p) => p.memberName === activeMemberName);
    if (match) setFocusedId(match.id);
  }, [activeMemberName, processes, maximizedId]);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    setMaximizedId((prev) => (prev === id ? null : id));
  }, []);

  const { cols, rows } = LAYOUTS[layout];
  const visibleProcesses = maximizedId
    ? processes.filter((p) => p.id === maximizedId)
    : processes;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-gray-700 flex-shrink-0">
        <span className="text-sm font-medium text-gray-300">
          Terminal Grid
          <span className="ml-2 text-gray-500 text-xs">({processes.length} processes)</span>
        </span>

        <div className="flex items-center gap-1 ml-auto">
          {/* Layout selector */}
          {!maximizedId && (
            <div className="flex items-center gap-1 mr-2">
              {(Object.keys(LAYOUTS) as GridLayout[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setLayout(key)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors font-mono ${
                    layout === key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                  title={`Layout ${LAYOUTS[key].label}`}
                >
                  {LAYOUTS[key].label}
                </button>
              ))}
            </div>
          )}

          {maximizedId && (
            <button
              onClick={() => setMaximizedId(null)}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              Restore
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* Terminal Grid */}
      <div
        className="flex-1 overflow-hidden p-2 gap-2"
        style={{
          display: 'grid',
          gridTemplateColumns: maximizedId ? '1fr' : `repeat(${cols}, 1fr)`,
          gridTemplateRows: maximizedId ? '1fr' : `repeat(${rows}, 1fr)`,
        }}
      >
        {visibleProcesses.slice(0, maximizedId ? 1 : cols * rows).map((proc) => (
          <div
            key={proc.id}
            className="relative overflow-hidden rounded"
            style={{ minHeight: 0 }}
          >
            <TerminalView
              processId={proc.id}
              memberName={proc.memberName}
              focused={focusedId === proc.id}
              onFocus={() => handleFocus(proc.id)}
            />
            {/* Maximize/restore button overlay */}
            <button
              onClick={() => toggleMaximize(proc.id)}
              className="absolute top-7 right-2 z-10 px-1.5 py-0.5 text-xs bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded transition-colors opacity-0 group-hover:opacity-100"
              title={maximizedId === proc.id ? 'Restore' : 'Maximize'}
            >
              {maximizedId === proc.id ? '⊡' : '⊞'}
            </button>
          </div>
        ))}

        {/* Empty placeholders for remaining grid cells */}
        {!maximizedId &&
          Array.from({ length: Math.max(0, cols * rows - visibleProcesses.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="bg-[#0d1117] border border-gray-800 rounded flex items-center justify-center"
            >
              <span className="text-gray-700 text-xs">No process</span>
            </div>
          ))}
      </div>
    </div>
  );
}
