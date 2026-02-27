'use client';

import { useState, useCallback } from 'react';
import { useEventSource } from '@/hooks/useEventSource';
import { DashboardLayout, Header } from '@/components/layout';
import { TeamGrid } from '@/components/teams';
import { MetricCard } from '@/components/common';
import { TeamCreateDialog } from '@/components/teams/TeamCreateDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';

export default function TeamsPage() {
  const { state, error, reconnect, refresh } = useEventSource();
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const activeTeams = state.teams.filter((t) => t.activeMembers > 0 || t.isRunning).length;
  const totalMembers = state.teams.reduce((sum, t) => sum + t.config.members.length, 0);

  const handleTeamsUpdated = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    refresh();
  }, [refresh]);

  return (
    <DashboardLayout>
      <Header
        connected={state.connected}
        lastUpdated={state.lastUpdated}
        error={error}
        onReconnect={reconnect}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            title="Agent Teams"
            value={`${activeTeams}/${state.teams.length}`}
            subtitle="Active / Total"
            status={activeTeams > 0 ? 'success' : 'neutral'}
          />
          <MetricCard
            title="Total Members"
            value={totalMembers}
            subtitle="Across all teams"
          />
          <MetricCard
            title="Running Teams"
            value={state.teams.filter((t) => t.isRunning).length}
            subtitle="Currently active"
            status={state.teams.some((t) => t.isRunning) ? 'success' : 'neutral'}
          />
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              Agent Teams ({state.teams.length})
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <span className="text-base leading-none">+</span>
              New Team
            </button>
          </div>
          <TeamGrid teams={state.teams} onTeamsUpdated={handleTeamsUpdated} />
        </section>
      </main>

      {showCreate && (
        <TeamCreateDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </DashboardLayout>
  );
}
