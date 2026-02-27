'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { PathInput } from './PathInput';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { settings, loading, saving, save } = useSettings();
  const [defaultCwd, setDefaultCwd] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setDefaultCwd(settings.defaultCwd);
  }, [loading, settings.defaultCwd]);

  const handleSave = async () => {
    await save({ defaultCwd: defaultCwd.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Default Working Directory
            </label>
            <PathInput
              value={loading ? '' : defaultCwd}
              onChange={setDefaultCwd}
              disabled={loading}
              placeholder="e.g. D:\projects  or  /home/user/projects"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Pre-fills the working directory when creating a new team. You can still override per team.
            </p>
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
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
