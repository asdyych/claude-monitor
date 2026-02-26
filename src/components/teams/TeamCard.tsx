'use client';

import { useState, useCallback } from 'react';
import { TeamState } from '@/types/team';
import { StatusBadge } from '@/components/common';
import { MemberList } from './MemberList';
import { MessagePreview } from './MessagePreview';
import { formatTimeAgo } from '@/lib/formatters';

interface TeamCardProps {
  team: TeamState;
  onOpenDetail: (team: TeamState) => void;
  onTeamUpdated: () => void;
}

export function TeamCard({ team, onOpenDetail, onTeamUpdated }: TeamCardProps) {
  const { config, recentMessages, messageCount, activeMembers } = team;
  const totalMembers = config.members.length;
  const isRunning = team.isRunning ?? false;
  const [isActioning, setIsActioning] = useState(false);

  const handleLaunch = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsActioning(true);
      try {
        const res = await fetch(`/api/teams/${team.id}/launch`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) console.error('Launch failed:', data.error);
        else onTeamUpdated();
      } catch (err) {
        console.error('Launch error:', err);
      } finally {
        setIsActioning(false);
      }
    },
    [team.id, onTeamUpdated]
  );

  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsActioning(true);
      try {
        const res = await fetch(`/api/teams/${team.id}/stop`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) console.error('Stop failed:', data.error);
        else onTeamUpdated();
      } catch (err) {
        console.error('Stop error:', err);
      } finally {
        setIsActioning(false);
      }
    },
    [team.id, onTeamUpdated]
  );

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onOpenDetail(team)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{config.name}</h4>
          {config.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{config.description}</p>
          )}
        </div>
        <StatusBadge
          status={activeMembers > 0 ? 'active' : 'idle'}
          label={`${activeMembers}/${totalMembers} active`}
          pulse={activeMembers > 0}
        />
      </div>

      {/* Members */}
      <div className="mb-3">
        <p className="text-xs text-gray-400 mb-1.5">
          {totalMembers} member{totalMembers !== 1 ? 's' : ''}
        </p>
        <MemberList members={config.members} maxVisible={6} />
      </div>

      {/* Recent Activity */}
      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span>Recent messages ({messageCount})</span>
          {config.createdAt && (
            <span>Created {formatTimeAgo(new Date(config.createdAt))}</span>
          )}
        </div>
        <MessagePreview messages={recentMessages} />
      </div>

      {/* Action buttons */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetail(team); }}
          className="flex-1 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors text-center"
        >
          Open Details
        </button>

        {isRunning ? (
          <button
            onClick={handleStop}
            disabled={isActioning}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 rounded transition-colors disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={isActioning}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded transition-colors disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Launch
          </button>
        )}

        {isRunning && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(team);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors"
            title="Open terminals"
          >
            ⌨ Terminal
          </button>
        )}
      </div>
    </div>
  );
}
