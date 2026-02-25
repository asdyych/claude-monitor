'use client';

import { useEventSource } from '@/hooks/useEventSource';
import { DashboardLayout, Header } from '@/components/layout';
import { ProcessList } from '@/components/processes';
import { ConnectionStatus } from '@/components/connections';
import { TeamGrid } from '@/components/teams';
import { MetricCard } from '@/components/common';

export default function Dashboard() {
  const { state, error, reconnect } = useEventSource();

  // Calculate metrics
  const totalProcesses = state.processes.length;
  const totalCpu = state.processes.reduce((sum, p) => sum + p.cpu, 0);
  const totalMemory = state.processes.reduce((sum, p) => sum + p.memory, 0);
  const activeTeams = state.teams.filter(t => t.activeMembers > 0).length;
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
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Agent Teams ({state.teams.length})
          </h2>
          <TeamGrid teams={state.teams} />
        </section>
      </main>
    </DashboardLayout>
  );
}
