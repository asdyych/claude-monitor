'use client';

import { TeamMember } from '@/types/team';

interface MemberListProps {
  members: TeamMember[];
  maxVisible?: number;
}

export function MemberList({ members, maxVisible = 5 }: MemberListProps) {
  const visibleMembers = members.slice(0, maxVisible);
  const hiddenCount = members.length - maxVisible;

  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-gray-300'
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleMembers.map((member) => (
        <span
          key={member.agentId}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100"
          title={`${member.name} (${member.model}) - ${member.status}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColors[member.status]}`} />
          <span
            className="truncate max-w-[80px]"
            style={{ color: member.color || 'inherit' }}
          >
            {member.name}
          </span>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
