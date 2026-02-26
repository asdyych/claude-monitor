'use client';

import { useState, useCallback } from 'react';
import { useEventSource } from '@/hooks/useEventSource';
import { DashboardLayout, Header } from '@/components/layout';
import { ProcessList } from '@/components/processes';
import { ConnectionStatus } from '@/components/connections';
import { TeamGrid } from '@/components/teams';
import { MetricCard } from '@/components/common';
import { TeamCreateDialog } from '@/components/teams/TeamCreateDialog';

export default function Dashboard() {
  const { state, error, reconnect, refresh } = useEventSource();
  const [showCreate, setShowCreate] = useState(false);

  const handleTeamsUpdated = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    refresh();
  }, [refresh]);

  // Calculate metrics
  const totalProcesses = state.processes.length;
  const totalCpu = state.processes.reduce((sum, p) => sum + p.cpu, 0);
  const totalMemory = state.processes.reduce((sum, p) => sum + p.memory, 0);
  const activeTeams = state.teams.filter((t) => t.activeMembers > 0 || t.isRunning).length;
  const totalMembers = state.teams.reduce((sum, t) => sum + t.config.members.length, 0);

  return (
    <DashboardLayout>
      <Header
        connected={state.connected}
        lastUpdated={state.lastUpdated}
        error={error}
        onReconnect={reconnect}
      />

      <main className="p-6 space-y-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Node Processes"
            value={totalProcesses}
            subtitle={totalProcesses > 0 ? 'Running' : 'None'}
            status={totalProcesses > 0 ? 'success' : 'neutral'}
          />
          <MetricCard
            title="Total CPU"
            value={`${totalCpu.toFixed(1)}%`}
            subtitle="Across all processes"
            status={totalCpu > 50 ? 'warning' : 'neutral'}
          />
          <MetricCard
            title="Total Memory"
            value={`${(totalMemory / 1024).toFixed(1)} GB`}
            subtitle={`${totalMemory} MB`}
          />
          <MetricCard
            title="Agent Teams"
            value={`${activeTeams}/${state.teams.length}`}
            subtitle={`${totalMembers} total members`}
            status={activeTeams > 0 ? 'success' : 'neutral'}
          />
        </div>

        {/* Top Row: Process & Connection Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ProcessList processes={state.processes} />
          </div>
          <div>
            <ConnectionStatus status={state.proxyStatus} />
          </div>
        </div>

        {/* Teams Section */}
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
    </DashboardLayout>
  );
}
