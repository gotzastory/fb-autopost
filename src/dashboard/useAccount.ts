import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cleanPages } from '@/lib/groups';
import { errorText, send, type EngineReply, type Identity, type Profile } from '@/lib/types';

const ACCOUNT_SCOPED_KEYS = [
  'fb_managed_pages',
  'fb_posting_identity',
  'fb_groups_list',
  'fb_groups_by_identity',
  'fb_groups_stats',
  'fb_page_sync_progress',
  'fb_sync_progress',
  'lastUpdated',
];
const DEFAULT_NAME = 'Facebook Account';
const samePageName = (a?: string, b?: string) => String(a ?? '').toLocaleLowerCase() === String(b ?? '').toLocaleLowerCase();

async function savedPage(pages: Identity[]): Promise<Identity | null> {
  const { fb_posting_identity: saved } = await chrome.storage.local.get('fb_posting_identity');
  if ((saved as Identity | undefined)?.type !== 'page') return null;
  const page = pages.find((p) => samePageName(p.name, (saved as Identity).name));
  return page ? { ...page, id: (saved as Identity).id || page.id || null } : null;
}

/** The logged-in profile, its Pages, and which of them posts are published as. */
export function useAccount(notify: (s: string) => void, onAccountChanged: (message: string) => void, reloadGroups: () => Promise<void>) {
  const [profile, setProfile] = useState<Profile>({});
  const [pages, setPages] = useState<Identity[]>([]);
  const [activePage, setActivePage] = useState<Identity | null>(null);
  const [refreshingPages, setRefreshingPages] = useState(false);
  // While Facebook is in Page mode GET_PROFILE can return only a bare uid and generic name,
  // which must not overwrite the real profile shown in the header.
  const lastRealProfile = useRef<Profile>({});
  const pageSyncRunning = useRef(false);

  const profileIdentity = useMemo<Identity>(
    () => ({ type: 'profile', name: profile.name || DEFAULT_NAME, avatar: profile.avatar || '', id: profile.id || null }),
    [profile],
  );
  const identity = activePage ?? profileIdentity;

  const hardReset = useCallback(
    async (reply?: EngineReply) => {
      setPages([]);
      setActivePage(null);
      setProfile({});
      lastRealProfile.current = {};
      await chrome.storage.local.remove(ACCOUNT_SCOPED_KEYS).catch(() => {});
      onAccountChanged(reply?.error || 'Facebook account changed. Everything was reset — sync again for the new account.');
    },
    [onAccountChanged],
  );

  const loadProfile = useCallback(async () => {
    const reply = await send({ type: 'GET_PROFILE' }).catch(() => undefined);
    if (reply?.accountChanged) return hardReset(reply);
    const incoming = reply?.profile ?? {};
    const name = String(incoming.name ?? '').trim();
    const generic = !name || name === '—' || /^facebook\s+account$/i.test(name);
    if (String(incoming.id ?? '').trim() && !generic) {
      lastRealProfile.current = incoming;
      setProfile(incoming);
    } else {
      setProfile(lastRealProfile.current.id || lastRealProfile.current.name ? lastRealProfile.current : incoming);
    }
  }, [hardReset]);

  const refreshPages = useCallback(async () => {
    setRefreshingPages(true);
    pageSyncRunning.current = true;
    try {
      const reply = await send({ type: 'SYNC_PAGES' });
      if (reply?.accountChanged) return await hardReset(reply);
      if (!reply?.success) throw new Error(reply?.error || 'Could not read Facebook Pages.');
      const list = cleanPages(reply.pages);
      await chrome.storage.local.set({ fb_managed_pages: list }).catch(() => {});
      setPages(list);
      setActivePage(await savedPage(list));
    } catch (e) {
      // Keep the last known list: a failed refresh must not erase Pages that synced earlier.
      notify(`Could not refresh Facebook Pages: ${errorText(e)}`);
    } finally {
      pageSyncRunning.current = false;
      setRefreshingPages(false);
    }
  }, [hardReset, notify]);

  const switchTo = useCallback(
    async (target: Identity) => {
      notify(`Switching Facebook identity to “${target.name}”…`);
      try {
        const reply = await send({ type: 'SWITCH_FACEBOOK_IDENTITY', identity: target });
        if (reply?.accountChanged) return await hardReset(reply);
        if (!reply?.success) throw new Error(reply?.error || 'Facebook did not confirm the switch.');
        const confirmed: Identity =
          target.type === 'page'
            ? { ...target, id: reply.activePageId || target.id || null }
            : { ...target, id: reply.userId || target.id || profile.id || null };
        await chrome.storage.local.set({ fb_posting_identity: confirmed }).catch(() => {});
        setActivePage(target.type === 'page' ? confirmed : null);
        await reloadGroups();
        notify(reply.alreadyActive ? `Already posting as “${target.name}”.` : `Now posting as “${target.name}”.`);
      } catch (e) {
        notify(`Could not switch to “${target.name}”: ${errorText(e)}`);
      }
    },
    [hardReset, notify, profile.id, reloadGroups],
  );

  useEffect(() => {
    void loadProfile();
    chrome.storage.local.get('fb_managed_pages').then(async ({ fb_managed_pages }) => {
      const list = cleanPages(fb_managed_pages);
      setPages(list);
      setActivePage(await savedPage(list));
    });
    const timer = setInterval(() => {
      if (!pageSyncRunning.current) void loadProfile();
    }, 30000);
    // The engine wipes account-scoped storage the moment c_user changes; mirror that here
    // so the previous account's groups and Pages never stay on screen.
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const binding = changes.fb_account_binding?.newValue as { reset?: boolean } | undefined;
      if (area === 'local' && binding?.reset === true) void hardReset().then(loadProfile);
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      clearInterval(timer);
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, [hardReset, loadProfile]);

  return { profile, pages, identity, profileIdentity, refreshingPages, refreshPages, switchTo, hardReset, loadProfile };
}
