import { useCallback, useEffect, useRef, useState } from 'react';
import { clearMedia, limitMedia, mergeFiles, restoreMedia, saveMedia } from '@/lib/composer-media';
import { groupsToCsv, isManualGroupUrl, normalizeGroups } from '@/lib/groups';
import { validateSpintax } from '@/lib/spintax';
import { errorText, send, type Group } from '@/lib/types';
import { backgroundAllowed, Composer } from './Composer';
import { GroupsPanel, IdentitySelector, PostPreview, ProfileHeader, ProgressPanel } from './Panels';
import { useAccount } from './useAccount';
import { usePosting } from './usePosting';
import { useSync } from './useSync';

export function App() {
  const [notice, notify] = useState('Ready. Select groups, then click Post to publish to the selected Facebook groups.');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [background, setBackground] = useState('');
  const [spintax, setSpintax] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const mediaIds = useRef<string[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manual, setManual] = useState({ kind: '', message: '' });

  const showGroups = useCallback((raw: unknown) => {
    const next = normalizeGroups(raw);
    setGroups(next);
    setSelected((s) => new Set([...s].filter((id) => next.some((g) => g.id === id))));
  }, []);

  const reloadGroups = useCallback(async () => {
    const reply = await send({ type: 'LOAD_IDENTITY_GROUPS' }).catch(() => undefined);
    if (reply?.success) return showGroups(reply.groups);
    const { fb_groups_list: stored } = await chrome.storage.local.get('fb_groups_list');
    showGroups((stored as { groups?: unknown } | undefined)?.groups ?? stored);
  }, [showGroups]);

  const onAccountChanged = useCallback((message: string) => {
    setGroups([]);
    setSelected(new Set());
    notify(message);
  }, []);

  const account = useAccount(notify, onAccountChanged, reloadGroups);

  const applySynced = useCallback(
    (raw: Partial<Group>[] | undefined, keepSelection: boolean) => {
      showGroups(raw);
      if (!keepSelection) setSelected(new Set());
    },
    [showGroups],
  );

  const sync = useSync({ groups, selectedIds: [...selected], notify, applySynced, reloadGroups, hardReset: account.hardReset });

  const onAllPublished = useCallback(() => {
    setText('');
    setFiles([]);
    setSelected(new Set());
    void clearMedia(mediaIds.current);
    mediaIds.current = [];
  }, []);
  const posting = usePosting(notify, groups, onAllPublished);

  useEffect(() => {
    void reloadGroups();
    restoreMedia()
      .then((restored) => {
        if (!restored.files.length) return;
        mediaIds.current = restored.ids;
        setFiles(restored.files);
        notify(`Photo/video restored from local storage · ${restored.files.length} file${restored.files.length === 1 ? '' : 's'} ready.`);
      })
      .catch((e) => console.warn('Could not restore media', e));
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.fb_groups_list) showGroups((changes.fb_groups_list.newValue as { groups?: unknown } | undefined)?.groups ?? []);
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [reloadGroups, showGroups]);

  const storeFiles = async (next: File[]) => {
    setFiles(next);
    mediaIds.current = await saveMedia(next, mediaIds.current);
  };

  const addFiles = async (picked: File[]) => {
    const media = limitMedia(mergeFiles(files, picked));
    try {
      await storeFiles(media.files);
      notify(media.trimmed ? media.message : `Photo/video ready · ${media.files.length} file${media.files.length === 1 ? '' : 's'} saved for posting.`);
    } catch (e) {
      notify(`Could not save selected media: ${errorText(e)}`);
    }
  };

  const removeFile = async (index: number) => {
    try {
      await storeFiles(files.filter((_, i) => i !== index));
    } catch (e) {
      notify(`Could not update media selection: ${errorText(e)}`);
    }
  };

  const toggleSpintax = useCallback(
    (on: boolean) => {
      if (on) {
        const v = validateTextForSpintax(text);
        if (v) return notify(v);
      }
      setSpintax(on);
      notify(on ? 'Spintax enabled · one variation will be assigned per group.' : 'Spintax OFF · original post text will be used exactly as entered.');
    },
    [text],
  );

  const addManualGroup = async () => {
    if (!isManualGroupUrl(manualUrl)) return setManual({ kind: 'error', message: 'Enter a valid Facebook group URL first.' });
    setManual({ kind: '', message: 'Checking this group…' });
    try {
      const reply = await send({ type: 'ADD_MANUAL_GROUP', url: manualUrl.trim() });
      const incoming = reply?.success ? normalizeGroups([reply.group])[0] : undefined;
      if (!incoming) return setManual({ kind: 'error', message: reply?.error || 'Could not verify this group.' });
      const exists = groups.some((g) => g.id === incoming.id);
      setGroups(normalizeGroups([...groups, incoming]));
      setSelected((s) => new Set(s).add(incoming.id));
      setManualUrl('');
      setManual({ kind: 'ok', message: `${exists ? 'Already joined' : 'Joined'}: ${incoming.name} · selected.` });
      sync.setLastResult(`Manual group verified: ${incoming.name}`);
    } catch (e) {
      setManual({ kind: 'error', message: errorText(e) });
    }
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([groupsToCsv(groups)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'facebook_groups.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onPostClick = () => {
    if (posting.running) return void posting.togglePause();
    const message = text.trim();
    void posting.start({
      groups: groups.filter((g) => selected.has(g.id)),
      message,
      spintax,
      background: backgroundAllowed(message, files.length) ? background : '',
      mediaCount: files.length,
      identity: account.identity,
      // The current selection is the source of truth: a text-only post drops any stale media.
      saveMedia: async () => {
        if (files.length) await storeFiles(files);
        else {
          await clearMedia(mediaIds.current);
          mediaIds.current = [];
        }
        return mediaIds.current;
      },
    });
  };

  const syncBusy = sync.groupSyncing || sync.coverSyncing;

  return (
    <>
      <ProfileHeader profile={account.profile} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Compose Post</h1>
            <p>Create a post and select your joined Facebook groups.</p>
          </div>
        </div>
        <div className="syncbar">
          <div>
            <b>Sync your Facebook groups</b>
            <span id="syncStatus">
              {sync.banner ? (
                <span className={`sync-live${sync.banner.paused ? ' paused' : ''}`}>
                  <span>
                    {sync.banner.title && <b>{sync.banner.title}</b>}
                    <small>{sync.banner.detail}</small>
                  </span>
                </span>
              ) : (
                sync.lastResult || 'Sync group IDs/names from Facebook. Covers can be refreshed separately.'
              )}
            </span>
          </div>
          <div className="sync-actions">
            <button className="sync-cover-btn" id="syncCovers" disabled={syncBusy} onClick={() => void sync.syncCovers()}>▧ Sync Group Covers</button>
            {syncBusy && (
              <button className={`sync-pause-btn${sync.paused ? ' resume' : ''}`} id="syncPause" onClick={() => void sync.togglePause()}>{sync.paused ? '▶ Resume' : 'Ⅱ Pause'}</button>
            )}
            <button className="sync-btn" id="syncGroups" disabled={syncBusy} aria-busy={sync.groupSyncing} onClick={() => void sync.syncGroups()}>{sync.groupSyncing ? '↻ Syncing…' : '↻ Sync from Facebook'}</button>
          </div>
        </div>
        <div className="manualbar">
          <div className="manual-copy">
            <span aria-hidden="true" className="manual-icon">↗</span>
            <div><b>Add manually</b><span>Paste a Facebook group URL</span></div>
          </div>
          <div className="manual-form">
            <input
              autoComplete="off"
              id="manualGroupUrl"
              aria-label="Facebook group URL"
              placeholder="https://facebook.com/groups/..."
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && isManualGroupUrl(manualUrl) && void addManualGroup()}
            />
            <button className="manual-btn" id="addManualGroup" disabled={!isManualGroupUrl(manualUrl)} onClick={() => void addManualGroup()}>＋ Add</button>
          </div>
          <div aria-live="polite" className={`manual-status ${manual.kind}`} id="manualStatus">{manual.message}</div>
        </div>
        <div className="layout">
          <section>
            <div className="panel post-composer">
              <div className="composer-title-row"><h2>Post Content</h2></div>
              <IdentitySelector identity={account.identity} profileIdentity={account.profileIdentity} pages={account.pages} refreshing={account.refreshingPages} onRefresh={() => void account.refreshPages()} onSwitch={(t) => void account.switchTo(t)} />
              <Composer text={text} onText={setText} background={background} onBackground={setBackground} files={files} onAddFiles={(f) => void addFiles(f)} onRemoveFile={(i) => void removeFile(i)} spintax={spintax} onSpintax={toggleSpintax} />
              <div className="counter"><span id="chars">{text.length}</span> chars</div>
            </div>
            <PostPreview identity={account.identity} text={text} spintax={spintax} background={background} files={files} groupCount={selected.size} />
            <div className="actionbar">
              <button className="primary" id="postBtn" onClick={onPostClick}>
                {posting.running ? (posting.paused ? 'Resume' : 'Pause') : <>Post to (<span id="postCount">{selected.size}</span>)</>}
              </button>
              {posting.running && <button className="stop-post" id="stopPostBtn" onClick={posting.stop}>Stop</button>}
            </div>
            <div className="notice" id="status" role="status">{notice}</div>
            {posting.visible && <ProgressPanel progress={posting.progress} />}
          </section>
          <GroupsPanel
            groups={groups}
            selected={selected}
            syncing={syncBusy && !sync.paused}
            onToggle={(id, on) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })}
            onSelectMany={(ids) => setSelected((s) => new Set([...s, ...ids]))}
            onClear={() => setSelected(new Set())}
            onExport={exportCsv}
          />
        </div>
      </main>
    </>
  );
}

function validateTextForSpintax(text: string): string | null {
  const v = validateSpintax(text);
  return v.valid ? null : `Invalid Spintax: ${v.error}`;
}
