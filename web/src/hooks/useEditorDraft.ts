import i18n from '@/lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { Canvas } from 'fabric';
import { useAuthStore } from '@/stores/authStore';
import { CANVAS_PROPERTIES } from '@/lib/aiDesign';

export interface EditorDraft { name: string; width: number; height: number; canvasJson: string; savedAt: string }

export function useEditorDraft(canvas: Canvas | null, ready: boolean, readOnly: boolean, id: string | undefined, name: string, width: number, height: number) {
  const userId = useAuthStore(s => s.user?.id);
  const key = `lcs-editor-draft:${userId}:${id || 'new'}`;
  const baseline = useRef(''), initialized = useRef('');
  const storageFailed = useRef(false);
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const [dirty, setDirty] = useState(false), [pendingDraft, setPendingDraft] = useState<EditorDraft | null>(null);
  const latest = useRef({ canvas, ready, readOnly, name, width, height, key });
  latest.current = { canvas, ready, readOnly, name, width, height, key };
  const capture = useCallback(() => {
    const state = latest.current;
    if (!state.canvas || !state.ready) return;
    const json = state.canvas.toObject(CANVAS_PROPERTIES);
    json.objects = json.objects.filter((obj: any) => !obj.isGuideLine);
    return { name: state.name, width: state.width, height: state.height, canvasJson: JSON.stringify(json) };
  }, []);
  const markSaved = useCallback((snapshot = capture()) => {
    if (!snapshot) return;
    baseline.current = JSON.stringify(snapshot); setDirty(false);
    try { localStorage.removeItem(latest.current.key); } catch { /* Quota/privacy restrictions do not prevent saving remotely. */ }
    storageFailed.current = false; setDraftUnavailable(false);
    setPendingDraft(null);
  }, [capture]);
  const markLoaded = useCallback((snapshot: Omit<EditorDraft, 'savedAt'>) => {
    baseline.current = JSON.stringify(snapshot); setDirty(false);
  }, []);
  const check = useCallback((persist = true) => {
    if (!latest.current.ready || latest.current.readOnly || !baseline.current) return false;
    const snapshot = capture();
    const changed = !!snapshot && JSON.stringify(snapshot) !== baseline.current;
    setDirty(changed);
    if (persist && snapshot) {
      try {
        if (changed) localStorage.setItem(latest.current.key, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
        else localStorage.removeItem(latest.current.key);
        storageFailed.current = false; setDraftUnavailable(false);
      } catch { storageFailed.current = true; setDraftUnavailable(true); }
    }
    return changed;
  }, [capture]);
  useEffect(() => {
    if (!ready || !canvas || initialized.current === key) return;
    initialized.current = key;
    baseline.current = JSON.stringify(capture()); setDirty(false);
    try {
      const draft = JSON.parse(localStorage.getItem(key) || 'null');
      if (draft && typeof draft.name === 'string' && typeof draft.canvasJson === 'string' && Number.isFinite(draft.width) && draft.width > 0 && Number.isFinite(draft.height) && draft.height > 0) setPendingDraft(draft);
      else setPendingDraft(null);
    } catch { setPendingDraft(null); }
  }, [ready, canvas, key, capture]);
  useEffect(() => {
    if (!ready || !canvas || pendingDraft) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { check(false); clearTimeout(timer); timer = setTimeout(() => check(), 300); };
    schedule(); canvas.on('after:render', schedule);
    return () => { clearTimeout(timer); canvas.off('after:render', schedule); };
  }, [canvas, ready, name, width, height, pendingDraft, check]);
  const blocker = useBlocker(() => latest.current.ready && !latest.current.readOnly && check(!pendingDraft));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(storageFailed.current ? i18n.t('designer.leaveWithoutDraft') : i18n.t('designer.leaveWithDraft'))) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (check(!pendingDraft)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [check, pendingDraft]);
  const discardDraft = () => { try { localStorage.removeItem(key); } catch {} setPendingDraft(null); };
  return { dirty, draftUnavailable, pendingDraft, markSaved, markLoaded, hasChanges: () => check(false), discardDraft, acknowledgeDraft: () => setPendingDraft(null) };
}
