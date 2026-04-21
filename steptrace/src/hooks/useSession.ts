import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Session, Step, AppStatus, SessionMeta, AppConfig, Highlight, Spotlight, LogSnippet } from '../types';

export function useSession() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionsDir, setSessionsDir] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionMeta[]>([]);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await invoke<AppConfig>('get_config');
      setConfig(cfg);
      setSessionsDir(cfg.sessions_dir);
    } catch (e) { setError(String(e)); }
  }, []);

  const loadRecentSessions = useCallback(async () => {
    try {
      const list = await invoke<SessionMeta[]>('get_all_sessions');
      setRecentSessions(list);
    } catch (e) { setError(String(e)); }
  }, []);

  useEffect(() => {
    loadConfig();
    loadRecentSessions();
  }, [loadConfig, loadRecentSessions]);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(listen<Session>('session-started', e => {
      setSession(e.payload); setSteps([]); setStatus('recording'); setError(null);
    }));
    unlisteners.push(listen<string>('status-changed', e => setStatus(e.payload as AppStatus)));
    unlisteners.push(listen<Session>('session-stopped', e => {
      setSession(e.payload); setSteps(e.payload.steps); setStatus('idle');
      loadRecentSessions();
    }));
    unlisteners.push(listen<Step>('step-captured', e => {
      setSteps(prev => prev.find(s => s.id === e.payload.id) ? prev : [...prev, e.payload]);
    }));

    return () => { unlisteners.forEach(p => p.then(fn => fn())); };
  }, [loadRecentSessions]);

  const startRecording = useCallback(async () => {
    try {
      const s = await invoke<Session>('start_session');
      setSession(s); setSteps([]); setStatus('recording'); setError(null);
    } catch (e) { setError(String(e)); }
  }, []);

  const pauseRecording = useCallback(async () => {
    try { await invoke('pause_session'); setStatus('paused'); }
    catch (e) { setError(String(e)); }
  }, []);

  const resumeRecording = useCallback(async () => {
    try { await invoke('resume_session'); setStatus('recording'); }
    catch (e) { setError(String(e)); }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const finished = await invoke<Session>('stop_session');
      setSession(finished); setSteps(finished.steps); setStatus('idle');
      loadRecentSessions();
      return finished;
    } catch (e) { setError(String(e)); return null; }
  }, [loadRecentSessions]);

  const deleteStep = useCallback(async (stepId: string) => {
    try {
      await invoke('delete_step', { stepId });
      setSteps(prev => prev.filter(s => s.id !== stepId));
    } catch (e) { setError(String(e)); }
  }, []);

  const addAnnotation = useCallback(async (stepId: string, text: string) => {
    try {
      await invoke('add_annotation', { stepId, text });
      const trimmed = text.trim();
      setSteps(prev => prev.map(s => s.id === stepId
        ? { ...s, annotation: trimmed === '' ? undefined : trimmed }
        : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const addLogSnippet = useCallback(async (stepId: string, log: string) => {
    try {
      const snippet = await invoke<LogSnippet>('add_log_snippet', { stepId, log });
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, log_snippet: snippet } : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const updateLogNote = useCallback(async (stepId: string, note: string | undefined) => {
    try {
      const snippet = await invoke<LogSnippet | null>(
        'update_log_note',
        { stepId, note: note || null },
      );
      setSteps(prev => prev.map(s => s.id === stepId
        ? { ...s, log_snippet: snippet ?? undefined }
        : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const deleteLogSnippet = useCallback(async (stepId: string) => {
    try {
      await invoke('delete_log_snippet', { stepId });
      setSteps(prev => prev.map(s => s.id === stepId
        ? { ...s, log_snippet: undefined }
        : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const cropStepImage = useCallback(async (stepId: string, x: number, y: number, w: number, h: number) => {
    try {
      await invoke('crop_step_image', { stepId, x, y, w, h });
      setSteps(prev => prev.map(s => s.id === stepId
        ? { ...s, highlight: undefined, spotlight: undefined }
        : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const addHighlight = useCallback(async (stepId: string, highlight: Highlight) => {
    try {
      await invoke('add_highlight', { stepId, highlight });
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, highlight } : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const setSpotlight = useCallback(async (stepId: string, spotlight: Spotlight | null) => {
    try {
      await invoke('set_spotlight', { stepId, spotlight });
      setSteps(prev => prev.map(s => s.id === stepId
        ? { ...s, spotlight: spotlight ?? undefined }
        : s));
    } catch (e) { setError(String(e)); }
  }, []);

  const captureNow = useCallback(async (fromButton: boolean) => {
    try {
      const step = await invoke<Step>('capture_now', { fromButton });
      return step;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const s = await invoke<Session>('load_session', { sessionId });
      setSession(s); setSteps(s.steps);
      return s;
    } catch (e) { setError(String(e)); return null; }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('delete_session', { sessionId });
      loadRecentSessions();
    } catch (e) { setError(String(e)); }
  }, [loadRecentSessions]);

  const saveConfig = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke('save_config', { config: cfg });
      setConfig(cfg);
    } catch (e) { setError(String(e)); }
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setSteps([]);
  }, []);

  return {
    status, session, steps, error, sessionsDir, config, recentSessions,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    deleteStep, addAnnotation, addLogSnippet, updateLogNote, deleteLogSnippet,
    addHighlight, setSpotlight, cropStepImage, captureNow,
    loadSession, deleteSession, saveConfig, loadRecentSessions, clearSession,
  };
}
