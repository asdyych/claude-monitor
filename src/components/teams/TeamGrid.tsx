'use client';

import { TeamState } from '@/types/team';
import { TeamCard } from './TeamCard';

interface TeamGridProps {
  teams: TeamState[];
}

export function TeamGrid({ teams }: TeamGridProps) {
  const activeTeams = teams.filter(t => t.activeMembers > 0);
  const inactiveTeams = teams.filter(t => t.activeMembers === 0);

  return (
    <div className="space-y-6">
      {/* Active Teams */}
      {activeTeams.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Active Teams ({activeTeams.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Teams */}
      {inactiveTeams.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Idle Teams ({inactiveTeams.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {inactiveTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No Agent Teams found
        </div>
      )}
    </div>
  );
}
