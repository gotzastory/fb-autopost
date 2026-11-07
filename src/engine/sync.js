// Facebook automation engine: sync. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { state } from './state';
import { FB_PAGE_SYNC_WORKER_TABS } from './core';
import { enrichGroupCovers } from './covers';
import { scanJoinedGroupsBatched } from './groups';
import { closeRealPostingWindows } from './posting';
import { getFacebookCookieUserId, getFacebookPageCookieId, sleep, waitForComplete } from './profile';

export async function setWorkerFavicon(tabId) {
  if (!tabId) return;
  const iconUrl = chrome.runtime.getURL('icons/icon16.png');
  await chrome.scripting
    .executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      args: [iconUrl],
      func: (url) => {
        try {
          let link = document.querySelector('link[data-fbmp-worker-favicon]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.setAttribute('data-fbmp-worker-favicon', '1');
            document.head?.appendChild(link);
          }
          link.href = url;
        } catch {}
      },
    })
    .catch(() => {});
}

export function attachSyncLifeline(port) {
  if (!port || port.name !== 'FBMP_SYNC_LIFELINE') return;
  state.syncLifelinePort = port;
  port.onDisconnect.addListener(() => {
    if (state.syncLifelinePort !== port) return;
    state.syncLifelinePort = null;
    if (state.realPostJob) {
      state.realPostJob.stopped = true;
      closeRealPostingWindows(state.realPostJob).catch(() => {});
    }
    cancelActiveSync('Dashboard page was reloaded or closed.').catch(() => {});
  });
}

export function isSyncCancelled() {
  return !!state.activeSyncJob?.cancelled;
}

export async function setSyncPageControl(job, control) {
  const tabId = job?.scanTabId || job?.workerTabId;
  if (!tabId) return;
  await chrome.scripting
    .executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      func: (c) => {
        window.__FBMP_SYNC_CONTROL__ = String(c || 'RUN').toUpperCase();
      },
      args: [control],
    })
    .catch(() => {});
}

export async function closeSyncPopup(job) {
  const wid = job?.windowId;
  if (wid) {
    try {
      await chrome.windows.remove(wid);
    } catch {}
  }
  job.windowId = null;
  job.scanTabId = null;
  job.workerTabId = null;
}

export async function closeGroupSyncWorker(job) {
  const tabId = job?.scanTabId || job?.workerTabId;
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {}
  }
  job.scanTabId = null;
  job.workerTabId = null;
}

export async function cancelActiveSync(reason = 'Sync stopped by user') {
  const job = state.activeSyncJob;
  if (!job) return;
  job.cancelled = true;
  job.reason = reason;
  await setSyncPageControl(job, 'STOP');
  await closeGroupSyncWorker(job);
  await chrome.storage.local
    .set({
      fb_sync_progress: {
        phase: 'cancelled',
        error: reason,
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
}

export async function pauseActiveSync() {
  const job = state.activeSyncJob;
  if (!job || job.cancelled)
    return {
      success: false,
      error: 'No group sync is running.',
    };
  job.paused = true;
  await chrome.storage.local
    .set({
      fb_sync_user_paused: true,
    })
    .catch(() => {});
  await setSyncPageControl(job, 'PAUSE');
  const saved = (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || [];
  await chrome.storage.local
    .set({
      fb_sync_progress: {
        phase: 'paused',
        pass: job.pass || 1,
        foundGroups: Array.isArray(saved) ? saved.length : 0,
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
  return {
    success: true,
  };
}

export async function resumeActiveSync() {
  const job = state.activeSyncJob;
  if (!job || job.cancelled)
    return {
      success: false,
      error: 'No group sync is paused.',
    };
  job.paused = false;
  await chrome.storage.local
    .set({
      fb_sync_user_paused: false,
    })
    .catch(() => {});
  await chrome.storage.local
    .set({
      fb_sync_progress: {
        phase: 'resuming',
        pass: job.pass || 1,
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
  return {
    success: true,
  };
}

export async function setCoverPageControl(job, control) {
  const ids = [...(job?.tabIds || [])];
  if (job?.tabId) ids.push(job.tabId);
  await Promise.all(
    [...new Set(ids)].map((tabId) =>
      chrome.scripting
        .executeScript({
          target: {
            tabId: tabId,
          },
          world: 'MAIN',
          func: (c) => {
            window.__FBMP_COVER_CONTROL__ = String(c || 'RUN').toUpperCase();
          },
          args: [control],
        })
        .catch(() => {}),
    ),
  );
}

export async function closeCoverPopup(job) {
  const wid = job?.windowId;
  if (wid) {
    try {
      await chrome.windows.remove(wid);
    } catch {}
  }
  job.windowId = null;
  job.tabIds = [];
}

export async function pauseActiveCover() {
  const job = state.activeCoverJob;
  if (!job || job.cancelled)
    return {
      success: false,
      error: 'No cover sync is running.',
    };
  job.paused = true;
  await setCoverPageControl(job, 'PAUSE');
  await closeCoverPopup(job);
  await chrome.storage.local
    .set({
      fb_sync_progress: {
        phase: 'cover-paused',
        index: job.index || 0,
        total: job.total || 0,
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
  return {
    success: true,
  };
}

export async function resumeActiveCover() {
  const job = state.activeCoverJob;
  if (!job || job.cancelled)
    return {
      success: false,
      error: 'No cover sync is paused.',
    };
  job.paused = false;
  await chrome.storage.local
    .set({
      fb_sync_progress: {
        phase: 'cover-resuming',
        index: job.index || 0,
        total: job.total || 0,
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
  return {
    success: true,
  };
}

export async function syncGroupCoversOnly(selectedIds = []) {
  if (state.activeCoverJob) state.activeCoverJob.cancelled = true;
  const stored = (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || [];
  const selectedSet = new Set((selectedIds || []).map(String));
  if (!selectedSet.size)
    return {
      success: false,
      error: 'Select at least one group to sync covers.',
    };
  const groups = Array.isArray(stored)
    ? stored.filter((g) => g?.id && g?.url && selectedSet.has(String(g.id)))
    : [];
  if (!groups.length)
    return {
      success: false,
      error: 'No saved groups found. Click “Sync from Facebook” first.',
    };
  let tab = null;
  try {
    tab = await chrome.tabs.create({
      url: 'https://www.facebook.com/groups/',
      active: false,
    });
    if (!tab?.id) throw new Error('Could not create the background cover worker.');
    await waitForComplete(tab.id, 6e4);
    state.activeCoverJob = {
      cancelled: false,
      paused: false,
      tabId: tab.id,
      index: 0,
      total: groups.length,
    };
    const first = await enrichGroupCovers(groups, tab.id, 1);
    const latest = (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || first.groups;
    const second = await enrichGroupCovers(latest, tab.id, 2);
    const completed =
      (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || second.groups;
    await chrome.storage.local.set({
      fb_groups_list: {
        groups: completed,
        lastUpdated: Date.now(),
        source: 'facebook-groups-dom',
        coverPasses: 2,
      },
    });
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'cover-complete',
        index: completed.length,
        total: completed.length,
        coverPasses: 2,
        updatedAt: Date.now(),
      },
    });
    return {
      success: true,
      count: completed.length,
      groups: completed,
      covers: {
        pass1Loaded: first.loaded,
        pass1Fallback: first.failed,
        pass2Loaded: second.loaded,
        pass2Fallback: second.failed,
      },
    };
  } catch (e) {
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'error',
        error: e.message || String(e),
        updatedAt: Date.now(),
      },
    });
    return {
      success: false,
      error: e.message || String(e),
    };
  } finally {
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
    }
    if (state.activeCoverJob?.tabId === tab?.id) state.activeCoverJob = null;
  }
}

export async function verifyMissingGroupNames(groups, tabId) {
  const missing = (groups || []).filter((g) => {
    const n = String(g?.name || '').trim();
    return (
      !n ||
      /^(?:resolving group name…?|you|your content|your groups|facebook user)$/iu.test(n) ||
      (/^\d+$/.test(n) && String(n) === String(g?.id || ''))
    );
  });
  if (!missing.length) return groups || [];
  const out = [...(groups || [])];
  for (let i = 0; i < missing.length; i++) {
    const target = missing[i];
    try {
      await chrome.tabs.update(tabId, {
        url: String(target.url || `https://www.facebook.com/groups/${target.id}/`),
        active: false,
      });
      await waitForComplete(tabId, 3e4);
      await sleep(700);
      const r = await chrome.scripting.executeScript({
        target: {
          tabId: tabId,
        },
        world: 'MAIN',
        func: (targetId) => {
          const clean = (v) =>
            String(v ?? '')
              .replace(/\s+/g, ' ')
              .trim();
          const bad =
            /^(?:groups?|see all|your groups|discover|your feed|groups you manage|groups you.?ve joined|create new group|facebook groups|view group|see group|open group|group|join|joined|leave|members?|posts?|private|public|public group|all groups you.?ve joined(?:\s*\(\d+\))?|посмотреть группу|просмотреть группу|открыть группу|показать группу|группа|все группы,? к которым вы присоединились(?:\s*\(\d+\))?)$/iu;
          const valid = (v) => {
            const s = clean(v);
            return s.length >= 2 && s.length <= 180 && !bad.test(s) && !/^(?:https?:\/\/|\d+$)/i.test(s);
          };
          const vals = [];
          const add = (v, score) => {
            const s = clean(v);
            if (valid(s) && (!/^\d+$/.test(s) || s !== targetId))
              vals.push({
                s: s,
                score: score,
              });
          };
          for (const sel of [
            '[role="main"] h1',
            '[role="main"] h2',
            '[role="main"] h3',
            'main h1',
            'main h2',
            'main h3',
          ])
            for (const el of document.querySelectorAll(sel)) add(el.innerText || el.textContent, 1e3);
          for (const m of document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]'))
            add(m.content, 950);
          add(document.title, 900);
          vals.sort((a, b) => b.score - a.score);
          return vals[0]?.s || '';
        },
        args: [String(target.id || '')],
      });
      const name = String(r?.[0]?.result || '').trim();
      if (name) {
        const ix = out.findIndex((g) => String(g.id) === String(target.id));
        if (ix >= 0)
          out[ix] = {
            ...out[ix],
            name: name,
            nameSource: 'canonical-facebook-group-page',
            nameStatus: 'verified-canonical',
          };
      }
    } catch {}
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'names',
        pass: 2,
        index: i + 1,
        total: missing.length,
        foundGroups: out.length,
        groupName: String(target.name || target.id || ''),
        updatedAt: Date.now(),
      },
    });
    await chrome.storage.local.set({
      fb_groups_list: {
        groups: out,
        lastUpdated: Date.now(),
        source: 'facebook-groups-dom',
        scanPasses: 2,
        coverPasses: 0,
      },
    });
  }
  return out;
}

export const JOINED_SYNC_ALLOWED_MISSING = 5;

export async function createFacebookSyncWorker(url, sourceWindowId = null, existingExtensionTabId = null) {
  const target = String(url || 'https://www.facebook.com/groups/joins/');
  const isPagesSync = /facebook\.com\/pages\/?\?category=your_pages/i.test(target);
  // Reuse the one active Page-sync tab if a refresh request races with an
  // existing sync. This prevents the dashboard refresh button from ever
  // creating a second Pages tab.
  if (isPagesSync && state.FB_PAGE_SYNC_ACTIVE_TAB_ID) {
    const active = await chrome.tabs.get(state.FB_PAGE_SYNC_ACTIVE_TAB_ID).catch(() => null);
    if (active?.id) {
      FB_PAGE_SYNC_WORKER_TABS.add(Number(active.id));
      return {
        windowId: active.windowId ?? null,
        tabId: active.id,
        extensionTab: false,
        normalTab: true,
        reused: true,
      };
    }
    state.FB_PAGE_SYNC_ACTIVE_TAB_ID = null;
  }
  if (isPagesSync) {
    const existing = await chrome.tabs
      .query({ url: 'https://www.facebook.com/pages/?category=your_pages*' })
      .catch(() => []);
    const candidate = existing.find((t) => t?.id && !t.discarded);
    if (candidate?.id) {
      state.FB_PAGE_SYNC_ACTIVE_TAB_ID = Number(candidate.id);
      FB_PAGE_SYNC_WORKER_TABS.add(Number(candidate.id));
      return {
        windowId: candidate.windowId ?? null,
        tabId: candidate.id,
        extensionTab: false,
        normalTab: true,
        reused: true,
        externallyOwned: true,
      };
    }
  }
  let windowId = sourceWindowId;
  if (windowId == null) {
    try {
      windowId = (await chrome.windows.getCurrent()).id || null;
    } catch {}
  }
  if (windowId == null && existingExtensionTabId) {
    try {
      windowId = (await chrome.tabs.get(existingExtensionTabId)).windowId || null;
    } catch {}
  }
  let tab = null;
  try {
    const opts = { url: target, active: true };
    if (windowId != null) opts.windowId = windowId;
    tab = await chrome.tabs.create(opts);
  } catch (e) {
    throw new Error(e?.message || 'Could not open the Facebook sync tab.');
  }
  if (!tab?.id) throw new Error('Could not create the Facebook sync tab.');
  FB_PAGE_SYNC_WORKER_TABS.add(Number(tab.id));
  if (isPagesSync) state.FB_PAGE_SYNC_ACTIVE_TAB_ID = Number(tab.id);
  return {
    windowId: tab.windowId ?? windowId ?? null,
    tabId: tab.id,
    extensionTab: false,
    normalTab: true,
    reused: false,
    externallyOwned: false,
  };
}

export async function closeSyncFacebookTabOnly(tabId, composeTabId = null, composeWindowId = null) {
  if (!tabId) return;
  FB_PAGE_SYNC_WORKER_TABS.delete(Number(tabId));
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  const wid = tab?.windowId;
  if (wid == null) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({
      windowId: wid,
    });
  } catch {}
  const composeUrl = `chrome-extension://${chrome.runtime.id}/dashboard.html`;
  let compose = composeTabId ? tabs.find((t) => t.id === composeTabId) : null;
  if (!compose) compose = tabs.find((t) => String(t.url || '').startsWith(composeUrl));
  if (!compose) {
    try {
      const all = await chrome.tabs.query({
        url: composeUrl,
      });
      compose = all.find((t) => t.windowId === wid) || all[0] || null;
    } catch {}
  }
  if (!compose && tabs.length <= 1) {
    try {
      compose = await chrome.tabs.create({
        windowId: wid,
        url: composeUrl,
        active: false,
      });
    } catch {}
  }
  try {
    await chrome.tabs.remove(tabId);
  } catch {}
  if (composeTabId) {
    try {
      const c = await chrome.tabs.get(composeTabId);
      await chrome.tabs.update(c.id, {
        active: true,
      });
      await chrome.windows.update(c.windowId, {
        focused: true,
      });
    } catch {}
  }
}

export function postingIdentityCacheKey(identity = null) {
  const x = identity || {};
  const type = String(x.type || 'profile') === 'page' ? 'page' : 'profile';
  const raw =
    type === 'page'
      ? String(x.id || '').trim() || String(x.url || '').trim() || String(x.name || '').trim()
      : String(x.id || '').trim() || String(x.name || '').trim();
  if (!raw) return '';
  return `${type}:${raw.toLocaleLowerCase()}`;
}

export async function getCurrentPostingIdentity() {
  const d = await chrome.storage.local.get(['fb_posting_identity', 'fb_account_binding']).catch(() => ({}));
  const saved = d.fb_posting_identity || {};
  if (String(saved.type || '') === 'page') {
    const pageId = String(saved.id || '').trim() || (await getFacebookPageCookieId().catch(() => ''));
    return { ...saved, type: 'page', id: pageId || saved.id || null };
  }
  const uid =
    String(saved.id || '').trim() ||
    String(d.fb_account_binding?.userId || '').trim() ||
    (await getFacebookCookieUserId().catch(() => ''));
  return { ...saved, type: 'profile', id: uid || saved.id || null };
}

export async function mirrorGroupsToIdentityCache(groups, identity = null) {
  const list = Array.isArray(groups) ? groups : [];
  const ident = identity || (await getCurrentPostingIdentity());
  const key = postingIdentityCacheKey(ident);
  if (!key) return;
  const d = await chrome.storage.local.get('fb_groups_by_identity').catch(() => ({}));
  const cache =
    d.fb_groups_by_identity && typeof d.fb_groups_by_identity === 'object' ? d.fb_groups_by_identity : {};
  cache[key] = {
    identity: {
      type: ident.type === 'page' ? 'page' : 'profile',
      id: ident.id || null,
      name: String(ident.name || ''),
    },
    groups: list,
    lastUpdated: Date.now(),
  };
  await chrome.storage.local.set({ fb_groups_by_identity: cache }).catch(() => {});
}

export async function loadGroupsForCurrentIdentity() {
  const ident = await getCurrentPostingIdentity();
  const key = postingIdentityCacheKey(ident);
  const d = await chrome.storage.local.get(['fb_groups_by_identity', 'fb_groups_list']).catch(() => ({}));
  const cache =
    d.fb_groups_by_identity && typeof d.fb_groups_by_identity === 'object' ? d.fb_groups_by_identity : {};
  const hit = key && cache[key] && Array.isArray(cache[key].groups) ? cache[key].groups : null;
  const legacy = Array.isArray(d.fb_groups_list?.groups)
    ? d.fb_groups_list.groups
    : Array.isArray(d.fb_groups_list)
      ? d.fb_groups_list
      : [];
  return {
    success: true,
    identity: ident,
    key,
    // Never show the profile's group list while a Page identity is active.
    // A Page gets an empty list until that Page has actually synced its own
    // joined groups, preventing accidental posting to the wrong identity's groups.
    groups: hit || (ident.type === 'page' ? [] : legacy),
  };
}

export async function syncGroups(existingExtensionTabId = null) {
  if (state.activeSyncJob) await cancelActiveSync('Previous group sync cancelled.');
  // Keep the exact extension dashboard Compose tab alive. Open /groups/joins/
  // as a normal tab in the same browser window; never replace/close Compose.
  let worker = null;
  let sourceWindowId = null;
  let composeTabId = existingExtensionTabId || null;
  try {
    sourceWindowId = (await chrome.windows.getCurrent()).id || null;
  } catch {}
  if (!existingExtensionTabId) {
    try {
      const tabs = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/dashboard.html` });
      const active = tabs.find((t) => t.active) || tabs[0];
      existingExtensionTabId = active?.id || null;
      composeTabId = existingExtensionTabId || composeTabId;
      if (active?.windowId != null) sourceWindowId = active.windowId;
    } catch {}
  } else {
    composeTabId = existingExtensionTabId || composeTabId;
    try {
      const t = await chrome.tabs.get(existingExtensionTabId);
      if (t?.windowId != null) sourceWindowId = t.windowId;
    } catch {}
  }
  worker = await createFacebookSyncWorker(
    'https://www.facebook.com/groups/joins/',
    sourceWindowId,
    existingExtensionTabId,
  );
  if (!worker?.tabId) return { success: false, error: 'Could not open Facebook for group sync.' };
  let fb = { id: worker.tabId };
  let scanTabId = worker.tabId,
    scanTabExisting = false,
    originalScanUrl = 'https://www.facebook.com/groups/joins/';
  const syncJob = {
    cancelled: false,
    paused: false,
    scanTabId: worker.tabId,
    workerTabId: worker.tabId,
    workerWindowId: worker.windowId,
    extensionTab: !!worker.extensionTab,
    reason: '',
    pass: 1,
  };
  await chrome.storage.local.set({ fb_sync_user_paused: false }).catch(() => {});
  state.activeSyncJob = syncJob;
  const guard = () => {
    if (syncJob.cancelled) throw new Error(syncJob.reason || 'Group sync cancelled.');
  };
  try {
    guard();
    syncJob.scanTabId = scanTabId;
    syncJob.workerTabId = scanTabId;
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'groups',
        pass: 1,
        index: 0,
        total: 0,
        foundGroups: 0,
        updatedAt: Date.now(),
      },
    });
    guard();
    await waitForComplete(scanTabId, 180000);
    guard();
    await sleep(300);
    guard();
    const existing = (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || [];
    const oldById = new Map(existing.map((g) => [String(g?.id), g]));
    const merged = new Map();
    const savePartial = async (list, meta) => {
      const pass = Number(meta?.pass || 1);
      for (const g of list || []) {
        const id = String(g?.id || '').trim();
        if (!id) continue;
        const old = merged.get(id);
        const mergedManaged = !!(g?.managed || old?.managed);
        const candidate = {
          ...(old || {}),
          ...g,
          managed: mergedManaged,
          groupSource: mergedManaged ? 'managed' : g?.groupSource || old?.groupSource || 'joined-list',
        };
        if (
          !old ||
          (!old.name && g.name) ||
          Number(g.nameScore || 0) > Number(old.nameScore || 0) ||
          mergedManaged
        )
          merged.set(id, candidate);
      }
      const rows = [...merged.values()].map((g) => {
        const old = oldById.get(String(g.id));
        const name = String(g.name || '').trim();
        return {
          ...g,
          id: String(g.id),
          groupId: String(g.groupId || g.id),
          url: String(g.url || `https://www.facebook.com/groups/${g.id}/`),
          name,
          nameStatus: name ? 'verified-from-facebook-list' : 'needs-name-verification',
          managed: !!g.managed,
          groupSource: g.groupSource || (g.managed ? 'managed' : 'joined-list'),
          ...(old?.cover ? { cover: old.cover } : {}),
        };
      });
      await chrome.storage.local.set({
        fb_groups_list: {
          groups: rows,
          lastUpdated: Date.now(),
          source: 'facebook-groups-dom',
          scanPasses: pass,
          coverPasses: 0,
        },
      });
      await chrome.storage.local.set({
        fb_sync_progress: {
          phase: meta?.phase || 'groups',
          pass,
          index: Number(meta?.index || 0),
          total: Number(meta?.expected || 0),
          foundGroups: rows.length,
          withNames: rows.filter((g) => g.name).length,
          needsNames: rows.filter((g) => !g.name).length,
          atBottom: !!meta?.atBottom,
          updatedAt: Date.now(),
        },
      });
    };
    const runPass = async (pass) => {
      syncJob.pass = pass;
      let resume = false;
      for (;;) {
        guard();
        const pauseState = await chrome.storage.local.get('fb_sync_user_paused').catch(() => ({}));
        if (syncJob.paused || pauseState.fb_sync_user_paused) {
          syncJob.paused = true;
          await setSyncPageControl(syncJob, 'PAUSE');
          await chrome.storage.local
            .set({
              fb_sync_progress: {
                phase: 'paused',
                pass,
                index: 0,
                total: 0,
                foundGroups: merged.size,
                expected: 0,
                updatedAt: Date.now(),
              },
            })
            .catch(() => {});
          while (syncJob.paused && !syncJob.cancelled) await sleep(120);
          guard();
          if (syncJob.paused) continue;
          await setSyncPageControl(syncJob, 'RUN');
          resume = true;
          continue;
        }
        syncJob.paused = false;
        const r = await scanJoinedGroupsBatched(scanTabId, pass, savePartial, resume);
        guard();
        if (r.paused) {
          await chrome.storage.local.set({
            fb_sync_progress: {
              phase: 'paused',
              pass,
              index: r.iterations || 0,
              total: r.expected || 0,
              foundGroups: merged.size,
              expected: r.expected || 0,
              updatedAt: Date.now(),
            },
          });
          while (syncJob.paused && !syncJob.cancelled) await sleep(120);
          guard();
          if (syncJob.paused) continue;
          await setSyncPageControl(syncJob, 'RUN');
          resume = true;
          continue;
        }
        if (r.stopped) throw new Error(syncJob.reason || 'Group sync stopped by user.');
        return r;
      }
    };
    guard();
    const first = await runPass(1);
    guard();
    // v4.69 full-scan behavior: always perform a second independent traversal.
    // Facebook's joined list is virtualized, so a single traversal can finish
    // before every card has been hydrated. The second pass starts from the top
    // and merges by Group ID; it never duplicates records.
    let second = first;
    const firstExpected = Number(first.expected || 0);
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'groups',
        pass: 2,
        index: 0,
        total: firstExpected || 0,
        foundGroups: merged.size,
        updatedAt: Date.now(),
      },
    });
    second = await runPass(2);
    guard();

    // First finish the joined-groups scan, including any recovery traversals.
    // Recovery MUST happen while the worker is still on /groups/joins/. The old
    // order switched to the managed view first, which could make a joined-list
    // recovery pass scan the wrong Facebook section.
    let final = [...merged.values()].map((g) => {
      const old = oldById.get(String(g.id));
      const name = String(g.name || '').trim();
      return {
        ...g,
        id: String(g.id),
        groupId: String(g.groupId || g.id),
        url: String(g.url || `https://www.facebook.com/groups/${g.id}/`),
        name,
        nameStatus: name ? 'verified-from-facebook-list' : 'needs-name-verification',
        managed: !!g.managed,
        groupSource: g.groupSource || 'joined-list',
        ...(old?.cover ? { cover: old.cover } : {}),
      };
    });
    const expected = Math.max(Number(first.expected || 0), Number(second.expected || 0));
    let verifiedFinal = final;
    let recovery = 0;
    // If the second traversal already recovered the complete expected count,
    // accept immediately. No reload/F5 recovery is used anywhere in joined sync.
    const initialJoinedGap = Math.max(0, expected - verifiedFinal.length);
    const initialJoinedWithinTolerance = expected > 0 && initialJoinedGap <= JOINED_SYNC_ALLOWED_MISSING;
    if (!initialJoinedWithinTolerance) {
      // v5.54: exhaustive recovery is scroll-only. Never F5/reload/navigate the
      // joined-groups page while scanning; this preserves Facebook's hydrated
      // virtual-list state and prevents lower groups from disappearing.
      while (expected > 0 && verifiedFinal.length < expected && recovery < 20) {
        recovery++;
        await chrome.storage.local.set({
          fb_sync_progress: {
            phase: 'groups-scroll-recovery',
            pass: 2 + recovery,
            index: 0,
            total: expected,
            foundGroups: verifiedFinal.length,
            recoveryPasses: recovery,
            updatedAt: Date.now(),
          },
        });
        guard();
        // v5.54: keep the SAME Facebook document alive. Give the virtualized
        // joined-list a short hydration window before each additional traversal.
        await sleep(350);
        guard();
        const extra = await runPass(2 + recovery);
        guard();
        // runPass updates merged/savePartial; rebuild from the authoritative merged map.
        verifiedFinal = [...merged.values()];
        for (const g of extra.groups || []) {
          const id = String(g?.id || '').trim();
          if (!id) continue;
          const ix = verifiedFinal.findIndex((x) => String(x.id) === id);
          if (ix < 0) verifiedFinal.push(g);
          else if (!verifiedFinal[ix].name && g.name) verifiedFinal[ix] = g;
        }
        const gap = Math.max(0, expected - verifiedFinal.length);
        if (expected > 0 && gap <= JOINED_SYNC_ALLOWED_MISSING) break;
      }
    }
    const joinedMissing = Math.max(0, expected - verifiedFinal.length);
    let joinedWithinTolerance = expected > 0 && joinedMissing <= JOINED_SYNC_ALLOWED_MISSING;
    if (expected > 0 && !joinedWithinTolerance) {
      await chrome.storage.local.set({
        fb_sync_progress: {
          phase: 'error',
          error: `Facebook reports ${expected} joined groups, but only ${verifiedFinal.length} unique groups were recovered. Missing ${joinedMissing} groups exceeds the allowed tolerance of ${JOINED_SYNC_ALLOWED_MISSING}. Sync was NOT marked complete.`,
          foundGroups: verifiedFinal.length,
          expected,
          missing: joinedMissing,
          allowedMissing: JOINED_SYNC_ALLOWED_MISSING,
          updatedAt: Date.now(),
        },
      });
      return {
        success: false,
        error: `Incomplete sync: Facebook reports ${expected} groups, but only ${verifiedFinal.length} were recovered. Missing ${joinedMissing} groups exceeds the allowed tolerance of ${JOINED_SYNC_ALLOWED_MISSING}. Please retry.`,
      };
    }

    // Once count-complete, close the dedicated /groups/joins/ worker immediately.
    const joinedAcceptedShortfall = joinedWithinTolerance;
    const needsCanonicalNameVerify = verifiedFinal.some((g) => {
      const n = String(g?.name || '').trim();
      return (
        !n ||
        /^(?:resolving group name…?|you|your content|your groups|facebook user)$/iu.test(n) ||
        (/^\d+$/.test(n) && String(n) === String(g?.id || ''))
      );
    });
    if (joinedAcceptedShortfall) {
      const missing = Math.max(0, expected - verifiedFinal.length);
      await chrome.storage.local
        .set({
          fb_sync_progress: {
            phase: 'groups-accepted',
            pass: 2 + recovery,
            index: verifiedFinal.length,
            total: expected,
            foundGroups: verifiedFinal.length,
            expected,
            acceptedShortfall: missing,
            allowedMissing: JOINED_SYNC_ALLOWED_MISSING,
            recoveryPasses: recovery,
            updatedAt: Date.now(),
          },
        })
        .catch(() => {});
      if (worker?.extensionTab) {
        // Keep the extension tab alive; it is temporarily showing /groups/joins/.
      } else if (needsCanonicalNameVerify) {
        // Keep the same Facebook document alive long enough to resolve suspicious
        // names such as the generic label "You" from the canonical group page.
      } else {
        // IMPORTANT: never remove the browser window here. The Facebook sync tab
        // is opened in the user's existing Chrome window, so only that tab may
        // be closed. Removing worker.windowId would close the entire Chrome window.
        if (scanTabId) {
          await closeSyncFacebookTabOnly(scanTabId, composeTabId, sourceWindowId);
        }
        scanTabId = null;
        worker = null;
        syncJob.scanTabId = null;
        syncJob.workerTabId = null;
        syncJob.workerWindowId = null;
      }
    }

    // Verify any group names that the joined-list cards did not expose. This
    // prevents the dashboard from displaying "Resolving group name…" after a
    // successful count-complete sync. Only unresolved records are opened.
    const missingBeforeNameVerify = verifiedFinal.filter((g) => {
      const n = String(g?.name || '').trim();
      return (
        !n ||
        /^(?:resolving group name…?|you|your content|your groups|facebook user)$/iu.test(n) ||
        (/^\d+$/.test(n) && String(n) === String(g?.id || ''))
      );
    }).length;
    if (missingBeforeNameVerify && scanTabId) {
      verifiedFinal = await verifyMissingGroupNames(verifiedFinal, scanTabId);
    }

    // v5.20: Sync from Facebook is intentionally LIMITED to /groups/joins/ only.
    // Do not navigate to /groups/feed/, do not open Groups You Manage, and do not
    // run a second Facebook source after the joined-groups scan. The existing
    // Joined Groups scanner/scroll-only exhaustive recovery/tolerance logic above remains unchanged.
    // Close ONLY the Facebook /groups/joins/ tab after the joined sync is finished.
    // Never close the Chrome window and never touch the Compose dashboard tab.
    if (scanTabId) {
      await closeSyncFacebookTabOnly(scanTabId, composeTabId, sourceWindowId);
    }
    scanTabId = null;
    worker = null;
    syncJob.scanTabId = null;
    syncJob.workerTabId = null;
    syncJob.workerWindowId = null;

    if (!verifiedFinal.length)
      throw new Error('No Facebook group IDs were found. Open Facebook and try again.');
    const withNames = verifiedFinal.filter((g) => String(g.name || '').trim()).length;
    // Name completeness is separate from count completeness. We never substitute
    // a section/CTA label as a group name. Unresolved names remain explicit rather
    // than being silently corrupted.
    const unresolved = verifiedFinal.filter((g) => !String(g.name || '').trim()).length;
    await chrome.storage.local.set({
      fb_groups_list: {
        groups: verifiedFinal,
        lastUpdated: Date.now(),
        source: 'facebook-groups-dom-fast',
        scanPasses: 2 + recovery,
        coverPasses: 0,
      },
      fb_groups_stats: {
        total: verifiedFinal.length,
        joined: verifiedFinal.filter((g) => !g.managed).length,
        managed: verifiedFinal.filter((g) => g.managed).length,
        withNames: withNames,
        needsNames: unresolved,
        expected,
      },
    });
    // Persist the completed joined-group list under the CURRENT posting identity.
    // F5/reload must restore the same identity's groups; a Page must never inherit
    // the Profile's list and vice versa.
    await mirrorGroupsToIdentityCache(verifiedFinal, await getCurrentPostingIdentity()).catch(() => {});
    await chrome.storage.local.set({
      fb_sync_progress: {
        phase: 'complete',
        index: verifiedFinal.length,
        total: verifiedFinal.length,
        foundGroups: verifiedFinal.length,
        joinedGroups: verifiedFinal.filter((g) => !g.managed).length,
        managedGroups: verifiedFinal.filter((g) => g.managed).length,
        withNames,
        needsNames: unresolved,
        coverPasses: 0,
        scanPasses: 2 + recovery,
        firstPass: first.groups.length,
        secondPass: second.groups.length,
        managedPass1: 0,
        managedPass2: 0,
        expected,
        recoveryPasses: recovery,
        updatedAt: Date.now(),
      },
    });
    return {
      success: true,
      count: verifiedFinal.length,
      groups: verifiedFinal,
      stats: {
        total: verifiedFinal.length,
        joined: verifiedFinal.filter((g) => !g.managed).length,
        managed: verifiedFinal.filter((g) => g.managed).length,
        withNames,
        needsNames: unresolved,
        expected,
      },
      passes: {
        first: first.groups.length,
        second: second.groups.length,
        managedPass1: 0,
        managedPass2: 0,
        merged: verifiedFinal.length,
        recovery,
      },
      covers: { separate: true },
    };
  } catch (e) {
    const msg = e?.message || String(e);
    const cancelled = syncJob.cancelled || /cancelled|stopped by user/i.test(msg);
    await chrome.storage.local
      .set({
        fb_sync_progress: { phase: cancelled ? 'cancelled' : 'error', error: msg, updatedAt: Date.now() },
      })
      .catch(() => {});
    return { success: false, cancelled, error: msg };
  } finally {
    // Never close the extension dashboard tab reused for /groups/joins/. If Sync
    // exits early while that tab is still on Facebook, restore it to the dashboard.
    // Dedicated fallback worker windows retain the previous cleanup behavior.
    // Always close only the temporary Facebook sync tab. Never close or
    // navigate the Extension Compose dashboard tab/window.
    if (scanTabId) {
      await closeSyncFacebookTabOnly(scanTabId, composeTabId, sourceWindowId);
    }

    if (state.activeSyncJob === syncJob) state.activeSyncJob = null;
    await chrome.storage.local.set({ fb_sync_user_paused: false }).catch(() => {});
  }
}
