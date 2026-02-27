import { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';

interface UseSettingsReturn {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  save: (patch: Partial<AppSettings>) => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSettings(d.data as AppSettings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (d.success) setSettings(d.data as AppSettings);
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, save };
}
