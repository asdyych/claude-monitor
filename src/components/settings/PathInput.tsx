'use client';

import { useState } from 'react';
import { DirectoryPicker } from './DirectoryPicker';

interface PathInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PathInput({
  value,
  onChange,
  placeholder = 'e.g. /home/user/project or C:\\Users\\user\\project',
  disabled,
  className,
}: PathInputProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={
            className ??
            'flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50'
          }
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPicker(true)}
          title="Browse..."
          className="px-2.5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 rounded text-gray-300 hover:text-white transition-colors flex-shrink-0"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {showPicker && (
        <DirectoryPicker
          initialPath={value || undefined}
          onSelect={(selected) => {
            onChange(selected);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
