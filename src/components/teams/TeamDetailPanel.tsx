'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { TeamState } from '@/types/team';
import { ManagedProcess } from '@/types/managed-process';
import { ProcessSummary } from '@/types/ws';
import { useWebSocket } from '@/hooks/useWebSocket';

const TerminalGrid = dynamic(
  () => import('@/components/terminal/TerminalGrid').then((m) => m.TerminalGrid),
  { ssr: false }
);

interface TeamDetailPanelProps {
  team: TeamState;
  onClose: () => void;
  onTeamUpdated: () => void;
}

type DispatchEntry = {
  taskId: string;
  memberName: string;
  status: string;
  detail?: string;
};

function mergeProcessSummary(
  existing: ManagedProcess[],
  incoming: ProcessSummary[]
): ManagedProcess[] {
  const map = new Map(existing.map((p) => [p.id, p]));
  for (const s of incoming) {
    const prev = map.get(s.id);
    map.set(s.id, {
      ...(prev ?? {}),
      id: s.id,
      teamId: s.teamId,
      memberName: s.memberName,
      pid: s.pid,
      status: s.status,
      exitCode: s.exitCode,
      startedAt: prev?.startedAt ?? new Date(s.startedAt),
      cwd: s.cwd,
      command: prev?.command ?? '',
      cols: prev?.cols ?? 220,
      rows: prev?.rows ?? 50,
    });
  }
  return Array.from(map.values());
}

export function TeamDetailPanel({ team, onClose, onTeamUpdated }: TeamDetailPanelProps) {
  const [processes, setProcesses] = useState<ManagedProcess[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaderInput, setLeaderInput] = useState('');
  const [leaderFeedback, setLeaderFeedback] = useState<string | null>(null);
  const [dispatchTimeline, setDispatchTimeline] = useState<DispatchEntry[]>([]);
  // Name of member currently executing a dispatched task (for terminal highlight)
  const [activeMemberName, setActiveMemberName] = useState<string | null>(null);
  const [showTerminals, setShowTerminals] = useState(team.isRunning ?? false);
  const { addMessageHandler, sendToLeader, state } = useWebSocket();
  const leaderInputRef = useRef<HTMLInputElement>(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${team.id}/processes`);
      const data = await res.json();
      if (data.success) {
        setProcesses(
          data.data.map((p: ManagedProcess & { startedAt: string }) => ({
            ...p,
            startedAt: new Date(p.startedAt),
          }))
        );
      }
    } catch {
      // ignore network errors
    }
  }, [team.id]);

  // Initial load
  useEffect(() => {
    if (team.isRunning) {
      fetchProcesses();
    }
  }, [team.isRunning, fetchProcesses]);

  // Merge process_list snapshots for the "panel opened late" scenario
  useEffect(() => {
    const teamProcesses = state.processes.filter((p) => p.teamId === team.id);
    if (teamProcesses.length === 0) return;
    setProcesses((prev) => mergeProcessSummary(prev, teamProcesses));
    if (teamProcesses.some((p) => p.status === 'running')) setShowTerminals(true);
  }, [state.processes, team.id]);

  // Real-time WebSocket events
  useEffect(() => {
    const remove = addMessageHandler((msg) => {
      if (msg.type === 'process_started' && msg.teamId === team.id) {
        // Optimistically insert a minimal entry so TerminalView mounts immediately,
        // then fetch full metadata in the background.
        setProcesses((prev) => {
          if (prev.some((p) => p.id === msg.processId)) return prev;
          return [
            ...prev,
            {
              id: msg.processId,
              teamId: msg.teamId,
              memberName: msg.memberName,
              pid: 0,
              status: 'running' as const,
              startedAt: new Date(),
              cwd: '',
              command: '',
              cols: 220,
              rows: 50,
            },
          ];
        });
        setShowTerminals(true);
        // Fetch full metadata to backfill pid/cwd/etc.
        void fetchProcesses();
      } else if (msg.type === 'process_exit') {
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === msg.processId
              ? { ...p, status: 'exited', exitCode: msg.exitCode }
              : p
          )
        );
      } else if (msg.type === 'leader_ack' && msg.teamId === team.id) {
        setLeaderFeedback(msg.accepted ? '✓ Message delivered to leader' : `✗ ${msg.message}`);
      } else if (msg.type === 'dispatch_update' && msg.teamId === team.id) {
        setDispatchTimeline((prev) => {
          // Merge: update existing entry for same taskId if present, otherwise prepend
          const existing = prev.findIndex((e) => e.taskId === msg.taskId);
          const entry: DispatchEntry = {
            taskId: msg.taskId,
            memberName: msg.memberName,
            status: msg.status,
            detail: msg.detail,
          };
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = entry;
            return next;
          }
          return [entry, ...prev].slice(0, 20);
        });
        // Track which member is actively running so TerminalGrid can highlight it
        if (msg.status === 'running' || msg.status === 'queued') {
          setActiveMemberName(msg.memberName);
        } else if (msg.status === 'succeeded' || msg.status === 'failed') {
          setActiveMemberName((prev) => (prev === msg.memberName ? null : prev));
        }
      }
    });
    return remove;
  }, [addMessageHandler, team.id, fetchProcesses]);

  const handleSendToLeader = useCallback(() => {
    const text = leaderInput.trim();
    if (!text) {
      setLeaderFeedback('Please enter a message for the leader');
      return;
    }
    sendToLeader(team.id, text);
    setLeaderFeedback('Sending…');
    setLeaderInput('');
    leaderInputRef.current?.focus();
  }, [leaderInput, sendToLeader, team.id]);

  const handleLaunch = useCallback(async () => {
    setIsLaunching(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}/launch`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowTerminals(true);
      onTeamUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLaunching(false);
    }
  }, [team.id, onTeamUpdated]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onTeamUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStopping(false);
    }
  }, [team.id, onTeamUpdated]);

  const handleDestroy = useCallback(async () => {
    if (!confirmDestroy) {
      setConfirmDestroy(true);
      return;
    }
    setIsDestroying(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onTeamUpdated();
      onClose();
    } catch (err) {
      setError(String(err));
      setIsDestroying(false);
    }
  }, [confirmDestroy, team.id, onTeamUpdated, onClose]);

  const isRunning = team.isRunning ?? false;
  const runningProcesses = processes.filter((p) => p.status === 'running');

  // Active dispatch badge text
  const activeEntry = dispatchTimeline.find(
    (e) => e.status === 'running' || e.status === 'queued'
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{team.config.name}</h2>
            {team.config.description && (
              <p className="text-xs text-gray-500 truncate">{team.config.description}</p>
            )}
          </div>

          {/* Status badge */}
          <span
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              isRunning ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
            />
            {isRunning ? 'Running' : 'Stopped'}
          </span>

          {/* Active dispatch indicator */}
          {activeEntry && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-blue-900/50 text-blue-400 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {activeEntry.memberName} executing
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <button
                  onClick={() => setShowTerminals((v) => !v)}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                >
                  {showTerminals ? 'Hide Terminals' : 'Show Terminals'}
                </button>
                <button
                  onClick={handleStop}
                  disabled={isStopping}
                  className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {isStopping ? 'Stopping...' : 'Stop'}
                </button>
              </>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={isLaunching}
                className="px-3 py-1.5 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isLaunching ? 'Launching...' : 'Launch'}
              </button>
            )}

            <button
              onClick={handleDestroy}
              disabled={isDestroying}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                confirmDestroy
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-red-400'
              }`}
            >
              {isDestroying ? 'Destroying...' : confirmDestroy ? 'Confirm Destroy' : 'Destroy'}
            </button>

            {confirmDestroy && (
              <button
                onClick={() => setConfirmDestroy(false)}
                className="px-2 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            )}

            <button
              onClick={onClose}
              className="ml-1 px-2 py-1.5 text-gray-400 hover:text-white text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 bg-red-900/30 border border-red-700 text-red-300 text-sm rounded px-3 py-2 flex-shrink-0">
            {error}
          </div>
        )}

        {/* Leader Chat bar — always visible when running */}
        {isRunning && (
          <div className="px-5 pt-3 pb-3 border-b border-gray-800 bg-gray-900/70 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Leader</span>
              <input
                ref={leaderInputRef}
                type="text"
                value={leaderInput}
                onChange={(e) => setLeaderInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendToLeader();
                }}
                placeholder="Send task to team leader (Enter)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSendToLeader}
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shrink-0"
              >
                Send
              </button>
            </div>
            <div className="flex items-start gap-4 mt-1.5 min-h-[18px]">
              {leaderFeedback && (
                <p className="text-xs text-gray-500">{leaderFeedback}</p>
              )}
              {dispatchTimeline.length > 0 && (
                <div className="flex gap-2 flex-wrap ml-auto">
                  {dispatchTimeline.slice(0, 4).map((item, idx) => {
                    const statusColor =
                      item.status === 'succeeded'
                        ? 'text-green-400'
                        : item.status === 'failed'
                        ? 'text-red-400'
                        : item.status === 'running'
                        ? 'text-blue-400'
                        : 'text-yellow-400';
                    return (
                      <span
                        key={`${item.taskId}-${idx}`}
                        className={`text-xs font-mono ${statusColor}`}
                        title={item.detail}
                      >
                        {item.memberName}:{item.status}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {showTerminals && runningProcesses.length > 0 ? (
            <TerminalGrid
              processes={runningProcesses}
              activeMemberName={activeMemberName}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              {/* Members info */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3">
                  Members ({team.config.members.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {team.config.members.map((member) => {
                    const isActive = activeMemberName === member.name;
                    return (
                      <div
                        key={member.agentId}
                        className={`bg-gray-800 border rounded-lg px-3 py-2 flex items-center gap-3 transition-colors ${
                          isActive ? 'border-blue-600' : 'border-gray-700'
                        }`}
                        style={{ borderLeftColor: member.color, borderLeftWidth: 3 }}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: member.color || '#e6edf3' }}
                          >
                            {member.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {member.agentType} · {member.model}
                          </p>
                        </div>
                        {isActive ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 animate-pulse">
                            executing
                          </span>
                        ) : (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              member.status === 'active'
                                ? 'bg-green-900/50 text-green-400'
                                : member.status === 'idle'
                                ? 'bg-yellow-900/50 text-yellow-400'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {member.status}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent messages */}
              {team.recentMessages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">
                    Recent Messages ({team.messageCount})
                  </h3>
                  <div className="space-y-2">
                    {team.recentMessages.map((msg, i) => (
                      <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-medium"
                            style={{ color: msg.color || '#58a6ff' }}
                          >
                            {msg.from}
                          </span>
                          <span className="text-xs text-gray-600">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-3">
                          {msg.summary || msg.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isRunning && team.config.members.length > 0 && (
                <div className="mt-4 text-center py-8 text-gray-600">
                  <p className="text-sm">Team is not running.</p>
                  <button
                    onClick={handleLaunch}
                    className="mt-3 px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                  >
                    Launch Team
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
