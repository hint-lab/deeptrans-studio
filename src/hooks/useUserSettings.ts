"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type UserSettings = {
  provider: string; // e.g., 'openai', 'google', 'deepLx', 'deepseek'
  dictionaryIds: string[]; // selected dictionary ids
  memoryIds: string[]; // selected memory ids
};

const STORAGE_KEY = "dt.userSettings";

const DEFAULT_SETTINGS: UserSettings = {
  provider: "openai",
  dictionaryIds: [],
  memoryIds: [],
};

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as UserSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch { }
    setLoaded(true);
  }, []);

  const save = useCallback((next: Partial<UserSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next } as UserSettings;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } catch { }
      return merged;
    });
  }, []);

  const updateProvider = useCallback((provider: string) => save({ provider }), [save]);
  const updateDictionaries = useCallback((dictionaryIds: string[]) => save({ dictionaryIds }), [save]);
  const updateMemories = useCallback((memoryIds: string[]) => save({ memoryIds }), [save]);

  return useMemo(
    () => ({ settings, loaded, updateProvider, updateDictionaries, updateMemories }),
    [settings, loaded, updateProvider, updateDictionaries, updateMemories]
  );
}


