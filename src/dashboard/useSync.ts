import { useCallback, useEffect, useState } from 'react';
import { errorText, send, type EngineReply, type Group } from '@/lib/types';

interface SyncProgress {
  phase?: string;
  pass?: number;
  foundGroups?: number;
  expected?: number;
  total?: number;
  index?: number;
  groupName?: string;
  coverLoaded?: boolean;
  joinedGroups?: number;
  managedGroups?: number;
  withNames?: number;
  error?: string;
}

const clearUserPause = () => chrome.storage.local.set({ fb_sync_user_paused: false }).catch(() => {});

/** Group and cover sync: starts them in the engine and follows their progress through storage. */
export function useSync(opts: {
  groups: Group[];
  selectedIds: string[];
  notify: (s: string) => void;
  applySynced: (groups: Partial<Group>[] | undefined, keepSelection: boolean) => void;
  reloadGroups: () => Promise<void>;
  hardReset: (reply: EngineReply) => Promise<void>;
}) {
  const { groups, selectedIds, notify, applySynced, reloadGroups, hardReset } = opts;
  const [groupSyncing, setGroupSyncing] = useState(false);
  const [coverSyncing, setCoverSyncing] = useState(false);
  const [groupPaused, setGroupPaused] = useState(false);
  const [coverPaused, setCoverPaused] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({});
  const [lastResult, setLastResult] = useState('');

  const endGroupSync = () => {
    setGroupSyncing(false);
    setGroupPaused(false);
    void clearUserPause();
  };

  const syncGroups = useCallback(async () => {
    setGroupPaused(false);
    setCoverSyncing(false);
    setGroupSyncing(true);
    void clearUserPause();
    setProgress({ phase: 'groups', foundGroups: groups.length });
    notify('Starting Facebook group sync…');
    try {
      const reply = await send({ type: 'SYNC_GROUPS' });
      if (reply?.accountChanged) await hardReset(reply);
      else if (reply?.success) {
        applySynced(reply.groups, false);
        const list = reply.groups ?? [];
        const managed = list.filter((g) => g.managed).length;
        const unnamed = list.filter((g) => !String(g.name ?? '').trim()).length;
        const summary = `${list.length - managed} joined · ${managed} managed · ${list.length} total`;
        setLastResult(`Last group sync: ${new Date().toLocaleString()} · ${summary} · ${unnamed ? `${unnamed} names still verifying` : 'all names verified'} · covers preserved`);
        notify(`Group sync complete: ${summary}.`);
      } else notify(reply?.error || (reply?.cancelled ? 'Group sync stopped.' : 'Sync failed.'));
    } catch (e) {
      notify(errorText(e));
    } finally {
      endGroupSync();
    }
  }, [applySynced, groups.length, hardReset, notify]);

  const syncCovers = useCallback(async () => {
    if (!groups.length) return notify('No saved groups. Sync from Facebook first.');
    if (!selectedIds.length) return notify('Select at least one group to sync covers.');
    setCoverSyncing(true);
    setCoverPaused(false);
    setGroupSyncing(false);
    notify('Refreshing group covers…');
    try {
      const reply = await send({ type: 'SYNC_GROUP_COVERS', selectedIds });
      if (!reply?.success) return notify(reply?.error || 'Cover sync failed.');
      applySynced(reply.groups, true);
      const loaded = Math.max(Number(reply.covers?.pass1Loaded ?? 0), Number(reply.covers?.pass2Loaded ?? 0));
      notify(`Cover sync complete: ${loaded}/${selectedIds.length} selected groups loaded from Facebook.`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setCoverSyncing(false);
      setCoverPaused(false);
    }
  }, [applySynced, groups.length, notify, selectedIds]);

  const togglePause = useCallback(async () => {
    const covers = coverSyncing && !groupSyncing;
    const paused = covers ? coverPaused : groupPaused;
    const type = `${paused ? 'RESUME' : 'PAUSE'}_${covers ? 'COVER' : 'GROUP'}_SYNC`;
    try {
      const reply = await send({ type });
      if (!reply?.success) throw new Error(reply?.error || 'Could not change sync state.');
      if (covers) {
        setCoverPaused(!paused);
        notify(paused ? 'Cover sync resumed…' : 'Cover sync paused. Current covers are preserved.');
      } else {
        setGroupPaused(!paused);
        await chrome.storage.local.set({ fb_sync_user_paused: !paused }).catch(() => {});
        if (!paused) await reloadGroups();
        notify(paused ? 'Resuming group sync…' : 'Sync paused. Synced groups are preserved and visible.');
      }
    } catch (e) {
      notify(errorText(e));
    }
  }, [coverPaused, coverSyncing, groupPaused, groupSyncing, notify, reloadGroups]);

  useEffect(() => {
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const p = changes.fb_sync_progress?.newValue as SyncProgress | undefined;
      if (area !== 'local' || !p) return;
      setProgress(p);
      const found = p.foundGroups ?? 0;
      switch (p.phase) {
        case 'groups':
          setGroupSyncing(true);
          notify(`Syncing Facebook groups — pass ${p.pass ?? 1} · ${found}${p.expected ? ` / ${p.expected}` : ''} groups found…`);
          break;
        case 'managed':
          setGroupSyncing(true);
          notify(`Syncing Groups You Manage… ${found} groups found…`);
          break;
        case 'covers':
          setCoverSyncing(true);
          notify(`Syncing group covers — ${p.index ?? 0}/${p.total ?? 0}${p.groupName ? ` · ${p.groupName}` : ''}${p.coverLoaded ? ' ✓' : ''}`);
          break;
        case 'paused':
          setGroupSyncing(true);
          setGroupPaused(true);
          notify(`Sync paused — ${found} groups synced.`);
          break;
        case 'pausing':
          notify('Pausing at a safe point…');
          break;
        case 'resuming':
          setGroupPaused(false);
          setGroupSyncing(true);
          notify('Resuming group sync…');
          break;
        case 'cover-paused':
          setCoverSyncing(true);
          setCoverPaused(true);
          notify(`Cover sync paused — ${p.index ?? 0}/${p.total ?? 0} covers preserved.`);
          break;
        case 'cover-resuming':
          setCoverPaused(false);
          setCoverSyncing(true);
          notify('Resuming cover sync…');
          break;
        case 'complete':
          setGroupSyncing(false);
          setGroupPaused(false);
          notify(`Sync complete: ${p.total ?? 0} groups loaded · ${p.joinedGroups ?? 0} joined · ${p.managedGroups ?? 0} managed · ${p.withNames ?? 0} names resolved.`);
          break;
        case 'cover-complete':
          setCoverSyncing(false);
          setCoverPaused(false);
          notify(`Cover sync complete: ${p.total ?? 0} groups checked.`);
          break;
        case 'cancelled':
        case 'error':
          setGroupSyncing(false);
          setCoverSyncing(false);
          setGroupPaused(false);
          setCoverPaused(false);
          notify(p.error || 'Sync failed.');
          break;
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [notify]);

  let banner: { title?: string; detail: string; paused: boolean } | null = null;
  const total = Number(progress.total ?? groups.length);
  const coverPosition = `${Math.min(Number(progress.index ?? 0), total)} / ${total}`;
  if (groupSyncing && groupPaused) banner = { title: 'Group sync paused', detail: `${groups.length} groups already synced and preserved.`, paused: true };
  else if (groupSyncing) {
    const found = Number(progress.foundGroups ?? groups.length);
    const expected = Number(progress.expected ?? 0);
    const where = progress.phase === 'managed' ? 'Groups You Manage' : 'Groups You’ve Joined';
    banner = { detail: `${where} · ${expected ? `${found} found · target ${expected}` : `${found} found`} · Groups appear live as they are found.`, paused: false };
  } else if (coverSyncing && coverPaused) banner = { title: 'Cover sync paused', detail: `${coverPosition} · Covers already loaded are preserved.`, paused: true };
  else if (coverSyncing) banner = { title: 'Syncing group covers…', detail: `${coverPosition} · Updating covers live.`, paused: false };

  return {
    groupSyncing,
    coverSyncing,
    paused: groupSyncing ? groupPaused : coverPaused,
    banner,
    lastResult,
    setLastResult,
    syncGroups,
    syncCovers,
    togglePause,
  };
}
