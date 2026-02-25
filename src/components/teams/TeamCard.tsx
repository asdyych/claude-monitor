'use client';

import { TeamState } from '@/types/team';
import { StatusBadge } from '@/components/common';
import { MemberList } from './MemberList';
import { MessagePreview } from './MessagePreview';
import { formatTimeAgo } from '@/lib/formatters';

interface TeamCardProps {
  team: TeamState;
}

export function TeamCard({ team }: TeamCardProps) {
  const { config, recentMessages, messageCount, activeMembers } = team;
  const totalMembers = config.members.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
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
    </div>
  );
}
