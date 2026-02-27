'use client';

import { useState, useEffect, useCallback } from 'react';
import { BrowseResponse, FsEntry } from '@/app/api/fs/browse/route';

interface DirectoryPickerProps {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

function pathSegments(p: string): { label: string; path: string }[] {
  if (p === '__drives__') return [{ label: 'Drives', path: '__drives__' }];

  // Normalize separators
  const normalized = p.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  const segments: { label: string; path: string }[] = [];
  let accumulated = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Windows drive: "C:" becomes "C:\"
    if (i === 0 && /^[A-Za-z]:$/.test(part)) {
      accumulated = `${part}\\`;
      segments.push({ label: `${part}\\`, path: accumulated });
    } else {
      accumulated = accumulated
        ? accumulated.replace(/\\/g, '/') + '/' + part
        : '/' + part;
      segments.push({ label: part, path: accumulated });
    }
  }

  return segments;
}

export function DirectoryPicker({ initialPath, onSelect, onClose }: DirectoryPickerProps) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/fs/browse?path=${encodeURIComponent(target)}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data as BrowseResponse);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void navigate(initialPath ?? '');
  }, [navigate, initialPath]);

  const segments = data ? pathSegments(data.current) : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="text-sm font-semibold text-white">Select Directory</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0 min-h-[36px] flex items-center gap-0.5 flex-wrap">
          {/* Up button */}
          {data?.parent !== undefined && data.parent !== null && (
            <button
              onClick={() => void navigate(data.parent!)}
              title="Go up"
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors mr-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {segments.map((seg, i) => (
            <span key={seg.path} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-gray-600 text-xs px-0.5">/</span>}
              <button
                onClick={() => void navigate(seg.path)}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  i === segments.length - 1
                    ? 'text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {seg.label}
              </button>
            </span>
          ))}
          {data?.current === '__drives__' && (
            <span className="text-xs text-gray-400 font-medium px-1">Drives</span>
          )}
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
              Loading...
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && data && (
            <>
              {/* Windows: "All Drives" shortcut when not already on drives page */}
              {data.current !== '__drives__' && data.parent !== null && (
                <button
                  onClick={() => void navigate('__drives__')}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-blue-400 hover:bg-gray-800 border-b border-gray-800 transition-colors text-left"
                >
                  <DriveIcon />
                  <span>All Drives</span>
                </button>
              )}

              {/* Windows: show drive list */}
              {data.drives && data.drives.map((drive) => (
                <button
                  key={drive}
                  onClick={() => void navigate(drive)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 transition-colors text-left"
                >
                  <DriveIcon />
                  <span className="font-mono">{drive}</span>
                </button>
              ))}

              {/* Regular directory entries */}
              {data.entries.map((entry: FsEntry) => (
                <button
                  key={entry.path}
                  onClick={() => void navigate(entry.path)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 transition-colors text-left group"
                >
                  <FolderIcon />
                  <span className="flex-1 truncate">{entry.name}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-600 group-hover:text-gray-400 flex-shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}

              {!data.drives && data.entries.length === 0 && (
                <p className="text-center py-8 text-gray-600 text-sm">No subdirectories</p>
              )}
            </>
          )}
        </div>

        {/* Footer: current path + select */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-3 flex-shrink-0">
          <span
            className="flex-1 text-xs font-mono text-gray-400 truncate"
            title={data?.current}
          >
            {loading ? '…' : data?.current === '__drives__' ? '' : (data?.current ?? '')}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!data || data.current === '__drives__'}
            onClick={() => {
              if (data && data.current !== '__drives__') {
                onSelect(data.current);
              }
            }}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-yellow-400 flex-shrink-0"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-blue-400 flex-shrink-0"
    >
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
