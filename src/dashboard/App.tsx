import { useCallback, useEffect, useRef, useState } from 'react';
import { clearMedia, limitMedia, mergeFiles, restoreMedia, saveMedia } from '@/lib/composer-media';
import { groupsToCsv, isManualGroupUrl, normalizeGroups } from '@/lib/groups';
import { validateSpintax } from '@/lib/spintax';
import { useT } from '@/lib/i18n';
import { summarize } from '@/lib/progress';
import { errorText, send, type Group } from '@/lib/types';
import { backgroundAllowed, Composer } from './Composer';
import { Icon } from './Icon';
import { GroupsPanel, IdentitySelector, PostPreview, ProfileHeader, ProgressPanel } from './Panels';
import { useAccount } from './useAccount';
import { usePosting } from './usePosting';
import { useSync } from './useSync';

export function App() {
  const t = useT();
  const [notice, notify] = useState('');
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

  const sync = useSync({
    groups,
    selectedIds: [...selected],
    notify,
    applySynced,
    reloadGroups,
    hardReset: account.hardReset,
  });

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
        notify(
          `Photo/video restored from local storage · ${restored.files.length} file${restored.files.length === 1 ? '' : 's'} ready.`,
        );
      })
      .catch((e) => console.warn('Could not restore media', e));
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.fb_groups_list)
        showGroups((changes.fb_groups_list.newValue as { groups?: unknown } | undefined)?.groups ?? []);
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
      notify(
        media.trimmed
          ? media.message
          : `Photo/video ready · ${media.files.length} file${media.files.length === 1 ? '' : 's'} saved for posting.`,
      );
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
      notify(
        on
          ? 'Spintax enabled · one variation will be assigned per group.'
          : 'Spintax OFF · original post text will be used exactly as entered.',
      );
    },
    [text],
  );

  const addManualGroup = async () => {
    if (!isManualGroupUrl(manualUrl))
      return setManual({ kind: 'error', message: 'Enter a valid Facebook group URL first.' });
    setManual({ kind: '', message: 'Checking this group…' });
    try {
      const reply = await send({ type: 'ADD_MANUAL_GROUP', url: manualUrl.trim() });
      const incoming = reply?.success ? normalizeGroups([reply.group])[0] : undefined;
      if (!incoming)
        return setManual({ kind: 'error', message: reply?.error || 'Could not verify this group.' });
      const exists = groups.some((g) => g.id === incoming.id);
      setGroups(normalizeGroups([...groups, incoming]));
      setSelected((s) => new Set(s).add(incoming.id));
      setManualUrl('');
      setManual({
        kind: 'ok',
        message: `${exists ? 'Already joined' : 'Joined'}: ${incoming.name} · selected.`,
      });
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
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-32 sm:px-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{t('Compose Post')}</h1>
          <p className="mt-1 text-base-content/70">
            {t('Create a post and select your joined Facebook groups.')}
          </p>
        </div>
        <div className="mb-5 flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-8 flex-none place-items-center rounded-full ${sync.banner?.paused ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}
            >
              <Icon name="refresh" className={`size-4${syncBusy && !sync.paused ? ' animate-spin' : ''}`} />
            </span>
            <div className="min-w-0" id="syncStatus">
              {sync.banner ? (
                <>
                  <b className={`block ${sync.banner.paused ? 'text-warning' : ''}`}>
                    {sync.banner.title || t('Sync your Facebook groups')}
                  </b>
                  <span className="block text-xs text-base-content/70">{sync.banner.detail}</span>
                </>
              ) : (
                <>
                  <b className="block">{t('Sync your Facebook groups')}</b>
                  <span className="block text-xs text-base-content/70">
                    {sync.lastResult ||
                      t('Sync group IDs/names from Facebook. Covers can be refreshed separately.')}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              id="syncCovers"
              disabled={syncBusy}
              onClick={() => void sync.syncCovers()}
            >
              <Icon name="image" />
              {t('Sync group covers')}
            </button>
            {syncBusy && (
              <button
                className={`btn btn-sm btn-outline ${sync.paused ? 'btn-primary' : 'btn-warning'}`}
                id="syncPause"
                onClick={() => void sync.togglePause()}
              >
                <Icon name={sync.paused ? 'play' : 'pause'} />
                {sync.paused ? t('Resume') : t('Pause')}
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              id="syncGroups"
              disabled={syncBusy}
              aria-busy={sync.groupSyncing}
              onClick={() => void sync.syncGroups()}
            >
              <Icon name="refresh" />
              {sync.groupSyncing ? t('Syncing…') : t('Sync from Facebook')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            <div className="mb-5 rounded-box border border-base-300 bg-base-100 p-5">
              <h2 className="mb-3 text-base font-semibold">{t('Post Content')}</h2>
              <IdentitySelector
                identity={account.identity}
                profileIdentity={account.profileIdentity}
                pages={account.pages}
                refreshing={account.refreshingPages}
                onRefresh={() => void account.refreshPages()}
                onSwitch={(t) => void account.switchTo(t)}
              />
              <Composer
                text={text}
                onText={setText}
                background={background}
                onBackground={setBackground}
                files={files}
                onAddFiles={(f) => void addFiles(f)}
                onRemoveFile={(i) => void removeFile(i)}
                spintax={spintax}
                onSpintax={toggleSpintax}
              />
              <div className="mt-2 text-right text-xs text-base-content/70 tabular-nums">
                <span id="chars">{text.length}</span> {t('chars')}
              </div>
            </div>
            <PostPreview
              identity={account.identity}
              text={text}
              spintax={spintax}
              background={background}
              files={files}
              groupCount={selected.size}
            />
            {posting.visible && <ProgressPanel progress={posting.progress} />}
          </section>
          <GroupsPanel
            groups={groups}
            selected={selected}
            syncing={syncBusy && !sync.paused}
            onToggle={(id, on) =>
              setSelected((s) => {
                const next = new Set(s);
                if (on) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onSelectMany={(ids) => setSelected((s) => new Set([...s, ...ids]))}
            onClear={() => setSelected(new Set())}
            onExport={exportCsv}
          >
            <div className="flex gap-2">
              <label className="input input-sm min-w-0 flex-1">
                <Icon name="link" className="size-4 text-base-content/60" />
                <input
                  autoComplete="off"
                  id="manualGroupUrl"
                  aria-label={t('Facebook group URL')}
                  placeholder={t('Paste a Facebook group URL')}
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && isManualGroupUrl(manualUrl) && void addManualGroup()}
                />
              </label>
              <button
                className="btn btn-sm btn-outline btn-primary"
                id="addManualGroup"
                disabled={!isManualGroupUrl(manualUrl)}
                onClick={() => void addManualGroup()}
              >
                <Icon name="plus" />
                {t('Add')}
              </button>
            </div>
            <div
              aria-live="polite"
              className={`mt-1.5 text-xs empty:hidden ${manual.kind === 'error' ? 'text-error' : manual.kind === 'ok' ? 'text-success' : 'text-base-content/70'}`}
              id="manualStatus"
            >
              {manual.message}
            </div>
          </GroupsPanel>
        </div>
      </main>
      {/* The dispatch bar: always reachable however long the group list or preview gets. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100">
        {posting.visible && (
          <div className="h-1 bg-base-300" aria-hidden="true">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${summarize(posting.progress).percent}%` }}
            />
          </div>
        )}
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div
            className="line-clamp-2 min-w-0 flex-1 text-xs text-base-content/70 sm:text-sm"
            id="status"
            role="status"
            title={notice || undefined}
          >
            {notice || t('Ready. Select groups, then click Post to publish to the selected Facebook groups.')}
          </div>
          {posting.running && (
            <button className="btn btn-outline btn-error" id="stopPostBtn" onClick={posting.stop}>
              <Icon name="stop" />
              {t('Stop')}
            </button>
          )}
          <button className="btn btn-accent min-w-40" id="postBtn" onClick={onPostClick}>
            {posting.running ? (
              <>
                <Icon name={posting.paused ? 'play' : 'pause'} />
                {posting.paused ? t('Resume') : t('Pause')}
              </>
            ) : (
              <>
                <Icon name="send" />
                <span>
                  {t('Post to')}{' '}
                  <span id="postCount" className="tabular-nums">
                    {selected.size}
                  </span>{' '}
                  {t(selected.size === 1 ? 'group' : 'groups')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function validateTextForSpintax(text: string): string | null {
  const v = validateSpintax(text);
  return v.valid ? null : `Invalid Spintax: ${v.error}`;
}
