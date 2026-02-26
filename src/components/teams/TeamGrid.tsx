'use client';

import { useState, useCallback, useEffect } from 'react';
import { TeamState } from '@/types/team';
import { TeamCard } from './TeamCard';
import { TeamCreateDialog } from './TeamCreateDialog';
import { TeamDetailPanel } from './TeamDetailPanel';

interface TeamGridProps {
  teams: TeamState[];
  onTeamsUpdated: () => void;
}

export function TeamGrid({ teams, onTeamsUpdated }: TeamGridProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Always derive selected team from the live teams array so it stays in sync
  const selectedTeam = selectedTeamId ? (teams.find((t) => t.id === selectedTeamId) ?? null) : null;

  const activeTeams = teams.filter((t) => t.activeMembers > 0 || t.isRunning);
  const inactiveTeams = teams.filter((t) => t.activeMembers === 0 && !t.isRunning);

  // Close panel if the team was destroyed
  useEffect(() => {
    if (selectedTeamId && !teams.find((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(null);
    }
  }, [teams, selectedTeamId]);

  const handleCreated = useCallback(
    (_teamId: string) => {
      setShowCreate(false);
      onTeamsUpdated();
    },
    [onTeamsUpdated]
  );

  const handleOpenDetail = useCallback((team: TeamState) => {
    setSelectedTeamId(team.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTeamId(null);
  }, []);

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
            {activeTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onOpenDetail={handleOpenDetail}
                onTeamUpdated={onTeamsUpdated}
              />
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
            {inactiveTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onOpenDetail={handleOpenDetail}
                onTeamUpdated={onTeamsUpdated}
              />
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">No Agent Teams found</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Create your first team
          </button>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <TeamCreateDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {/* Detail panel */}
      {selectedTeam && (
        <TeamDetailPanel
          team={selectedTeam}
          onClose={handleCloseDetail}
          onTeamUpdated={onTeamsUpdated}
        />
      )}
    </div>
  );
}
