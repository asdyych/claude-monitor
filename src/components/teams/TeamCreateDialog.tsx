'use client';

import { useState, useCallback, useEffect } from 'react';
import { TeamCreateRequest, TeamMemberConfig } from '@/types/team';
import { useSettings } from '@/hooks/useSettings';
import { PathInput } from '@/components/settings/PathInput';

interface TeamCreateDialogProps {
  onClose: () => void;
  onCreated: (teamId: string) => void;
}

const MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-0',
];

const AGENT_TYPES = ['orchestrator', 'subagent', 'reviewer', 'coder', 'analyst'];

const MEMBER_COLORS = [
  '#58a6ff', '#3fb950', '#ff7b72', '#d29922',
  '#bc8cff', '#39d353', '#ffa657', '#f78166',
];

function SaveDefaultButton({ cwd }: { cwd: string }) {
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultCwd: cwd }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
    >
      {saved ? '✓ Saved' : 'Save as default'}
    </button>
  );
}

function createEmptyMember(index: number): TeamMemberConfig {
  return {
    name: `Agent ${index + 1}`,
    agentType: index === 0 ? 'orchestrator' : 'subagent',
    model: 'claude-opus-4-5',
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    cwd: '',
    task: '',
  };
}

export function TeamCreateDialog({ onClose, onCreated }: TeamCreateDialogProps) {
  const { settings, loading: settingsLoading } = useSettings();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cwd, setCwd] = useState('');
  const [members, setMembers] = useState<TeamMemberConfig[]>([
    createEmptyMember(0),
    createEmptyMember(1),
  ]);
  const [launchImmediately, setLaunchImmediately] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill working directory from saved settings (only on first load)
  useEffect(() => {
    if (!settingsLoading && settings.defaultCwd && !cwd) {
      setCwd(settings.defaultCwd);
    }
  }, [settingsLoading, settings.defaultCwd, cwd]);

  const addMember = useCallback(() => {
    setMembers((prev) => [...prev, createEmptyMember(prev.length)]);
  }, []);

  const removeMember = useCallback((index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateMember = useCallback((index: number, field: keyof TeamMemberConfig, value: string) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !cwd.trim()) {
      setError('Team name and working directory are required');
      return;
    }
    if (members.length === 0) {
      setError('At least one member is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: TeamCreateRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        cwd: cwd.trim(),
        members,
        launchImmediately,
      };

      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onCreated(data.data.teamId);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }, [name, description, cwd, members, launchImmediately, onCreated]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Create Agent Team</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Team Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Code Review Team"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">Working Directory *</label>
                {cwd.trim() && cwd.trim() !== settings.defaultCwd && (
                  <SaveDefaultButton cwd={cwd.trim()} />
                )}
              </div>
              <PathInput value={cwd} onChange={setCwd} />
            </div>
          </div>

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-300">
                Members ({members.length})
              </label>
              <button
                onClick={addMember}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add Member
              </button>
            </div>

            <div className="space-y-3">
              {members.map((member, index) => (
                <div
                  key={index}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2"
                  style={{ borderLeftColor: member.color, borderLeftWidth: 3 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-4">{index + 1}</span>
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => updateMember(index, 'name', e.target.value)}
                      placeholder="Agent name"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="color"
                      value={member.color || '#58a6ff'}
                      onChange={(e) => updateMember(index, 'color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border border-gray-600"
                      title="Agent color"
                    />
                    {members.length > 1 && (
                      <button
                        onClick={() => removeMember(index)}
                        className="text-gray-500 hover:text-red-400 transition-colors text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select
                        value={member.agentType}
                        onChange={(e) => updateMember(index, 'agentType', e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      >
                        {AGENT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Model</label>
                      <select
                        value={member.model}
                        onChange={(e) => updateMember(index, 'model', e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                      >
                        {MODELS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Task (optional)</label>
                    <input
                      type="text"
                      value={member.task || ''}
                      onChange={(e) => updateMember(index, 'task', e.target.value)}
                      placeholder="Describe what this agent should do..."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={launchImmediately}
                onChange={(e) => setLaunchImmediately(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm text-gray-300">Launch immediately after creation</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {submitting ? 'Creating...' : launchImmediately ? 'Create & Launch' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
