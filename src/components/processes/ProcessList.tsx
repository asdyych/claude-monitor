'use client';

import { ProcessInfo } from '@/types/process';
import { formatMemory, formatCpu, formatTimeAgo } from '@/lib/formatters';

interface ProcessRowProps {
  process: ProcessInfo;
}

function ProcessRow({ process }: ProcessRowProps) {
  const cpuColor = process.cpu > 50 ? 'text-red-600' : process.cpu > 20 ? 'text-yellow-600' : 'text-gray-900';
  const memColor = process.memory > 200 ? 'text-red-600' : process.memory > 100 ? 'text-yellow-600' : 'text-gray-900';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-mono text-gray-600">
        {process.pid}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {process.name}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={cpuColor}>{formatCpu(process.cpu)}</span>
        <div className="w-16 h-1.5 bg-gray-200 rounded mt-1">
          <div
            className={`h-full rounded ${process.cpu > 50 ? 'bg-red-500' : process.cpu > 20 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(process.cpu, 100)}%` }}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={memColor}>{formatMemory(process.memory)}</span>
        <div className="w-16 h-1.5 bg-gray-200 rounded mt-1">
          <div
            className={`h-full rounded ${process.memory > 200 ? 'bg-red-500' : process.memory > 100 ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min((process.memory / 500) * 100, 100)}%` }}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatTimeAgo(process.startTime)}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Running
        </span>
      </td>
    </tr>
  );
}

interface ProcessListProps {
  processes: ProcessInfo[];
}

export function ProcessList({ processes }: ProcessListProps) {
  const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
  const totalMemory = processes.reduce((sum, p) => sum + p.memory, 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            Node.js Processes
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {processes.length} processes | Total: {formatCpu(totalCpu)} CPU, {formatMemory(totalMemory)} Memory
          </p>
        </div>
      </div>

      {processes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          No Node.js processes found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CPU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Memory
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {processes.map(process => (
                <ProcessRow key={process.pid} process={process} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
