// Facebook automation engine: profile. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { state } from './state';
import { findFacebookTab } from './core';
import { closeRealPostingWindows } from './posting';
import { cancelActiveSync } from './sync';
import { isFacebookAssetUrl } from '../lib/groups';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForComplete(tabId, timeout = 12e4) {
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (t?.status === 'complete') {
    await sleep(400);
    return;
  }
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const timer = setTimeout(finish, timeout);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  await sleep(400);
}

export const isValidFacebookUserId = (id) => {
  const s = String(id ?? '').trim();
  return /^\d{5,}$/.test(s) && !/^(0+)$/.test(s);
};

export async function extractProfileFromFacebookTab(tabId) {
  const r = await chrome.scripting.executeScript({
    target: {
      tabId: tabId,
    },
    world: 'MAIN',
    func: () => {
      const clean = (v) =>
        String(v ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      const http = (u) => {
        u = String(u ?? '').trim();
        return /^https?:\/\//i.test(u) ? u : null;
      };
      const pickUrl = (v) => {
        if (!v) return null;
        if (typeof v === 'string') return http(v);
        if (typeof v !== 'object') return null;
        const keys = [
          'uri',
          'url',
          'src',
          'image',
          'image_uri',
          'imageUrl',
          'profile_picture',
          'PROFILE_PICTURE',
        ];
        for (const k of keys) {
          const u = pickUrl(v[k]);
          if (u) return u;
        }
        return null;
      };
      const looksLikeRealAvatar = (u) => {
        u = http(u);
        if (!u) return false;
        return /(?:scontent|fbcdn|fbsbx|profile|graph\.facebook\.com)/i.test(u);
      };
      let id = null,
        name = null,
        avatar = null;
      try {
        if (typeof require === 'function') {
          const d = require('CurrentUserInitialData');
          id = d?.USER_ID || null;
          name = d?.NAME || d?.SHORT_NAME || null;
          const profilePicture = d?.PROFILE_PICTURE || d?.profile_picture || d?.profile_picture_48 || null;
          avatar = pickUrl(profilePicture);
          if (!avatar) {
            for (const item of [
              d?.PROFILE_PICTURE,
              d?.profile_picture,
              d?.profile_picture_48,
              d?.viewer,
              d?.user,
            ]) {
              const u = pickUrl(item);
              if (u) {
                avatar = u;
                break;
              }
            }
          }
        }
      } catch {}
      const pageMode = /(?:^|;\s*)i_user=\d+/.test(String(document.cookie || ''));
      const srcOf = (el) => {
        if (!el) return '';
        if (el.tagName === 'IMG') return http(el.currentSrc || el.src || el.getAttribute('src')) || '';
        if (String(el.tagName || '').toLowerCase() === 'image')
          return http(el.getAttribute('href') || el.getAttribute('xlink:href')) || '';
        const m = String(el.getAttribute?.('style') || '').match(/url\(["']?(.*?)["']?\)/i);
        return m ? http(m[1]) || '' : '';
      };
      const isCdn = (u) => {
        try {
          return /(^|\.)(fbcdn\.net|fbsbx\.com)$/i.test(new URL(u, location.href).hostname);
        } catch {
          return false;
        }
      };
      const junk = /rsrc\.php|static\.xx|sprite|emoji|\.svg(?:$|[?#])|\/images\//i;
      const squareAvatar = (el) => {
        const r = el?.getBoundingClientRect?.();
        if (!r || r.width < 20 || r.width > 320 || r.height < 20 || r.height > 320) return false;
        return Math.abs(r.width - r.height) <= Math.max(8, r.width * 0.3);
      };
      const usable = (el) => {
        const u = srcOf(el);
        return u && isCdn(u) && !junk.test(u) && squareAvatar(el) ? u : '';
      };
      const mediaAll = (root) => [
        ...(root.querySelectorAll?.('img') || []),
        ...(root.querySelectorAll?.('image') || []),
        ...(root.querySelectorAll?.('[style*="background-image"]') || []),
      ];
      const nlow = clean(name || '').toLowerCase();
      let avatarSource = avatar ? 'current-user-initial-data' : '';
      if (nlow) {
        for (const el of mediaAll(document)) {
          const alt = clean(el.getAttribute?.('alt') || el.getAttribute?.('aria-label') || '').toLowerCase();
          if (alt !== nlow) continue;
          const u = usable(el);
          if (u) {
            avatar = u;
            avatarSource = 'alt-exact-name';
            break;
          }
        }
      }
      if (!avatar && id) {
        const sid = String(id);
        const selfHref = (h) => {
          const v = String(h || '');
          if (!v) return false;
          if (v.includes('/profile.php?id=' + sid)) return true;
          try {
            const u = new URL(v, location.href);
            if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return false;
            if (u.searchParams.get('id') === sid) return true;
            return /^\/(?:me)\/?$/i.test(u.pathname);
          } catch {
            return false;
          }
        };
        for (const a of document.querySelectorAll('a[href]')) {
          if (!selfHref(a.getAttribute('href'))) continue;
          const inside = mediaAll(a).map(usable).filter(Boolean);
          if (inside.length && inside.length <= 2) {
            avatar = inside[0];
            avatarSource = 'self-profile-link';
            break;
          }
        }
      }
      if (!avatar && !pageMode) {
        const banner = document.querySelector('[role="banner"]');
        if (banner) {
          const btns = [...banner.querySelectorAll('[role="button"],[aria-haspopup="menu"],a[href]')]
            .filter((b) => mediaAll(b).some((x) => usable(x)))
            .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
          for (const b of btns) {
            const inside = mediaAll(b).map(usable).filter(Boolean);
            if (inside.length === 1) {
              avatar = inside[0];
              avatarSource = 'banner-account-button';
              break;
            }
          }
        }
      }
      if (!avatar) {
        avatar = null;
        avatarSource = 'none';
      }
      if (
        pageMode &&
        !/^(?:current-user-initial-data|alt-exact-name|self-profile-link)$/.test(avatarSource)
      ) {
        avatar = null;
        avatarSource = 'page-mode-blocked';
      }
      if (!name) {
        const candidates = [
          document.querySelector('[data-pagelet="ProfileTilesFeed"] a')?.textContent,
          document.querySelector('a[href*="/profile.php?id="]')?.textContent,
        ]
          .map(clean)
          .filter(Boolean);
        name = candidates.find((x) => !/^your profile$/i.test(x) && !/^account$/i.test(x)) || null;
      }
      return {
        id: id,
        name: name,
        avatar: avatar,
        avatarSource: avatarSource,
        pageMode: pageMode,
      };
    },
  });
  return r?.[0]?.result || {};
}

export async function avatarUrlToDataUrlViaTab(tabId, url) {
  const u = String(url || '').trim();
  if (/^data:image\//i.test(u)) return u;
  if (!isFacebookAssetUrl(u)) return null;
  if (!tabId) return null;
  try {
    const r = await chrome.scripting
      .executeScript({
        target: {
          tabId: Number(tabId),
        },
        world: 'MAIN',
        args: [u],
        func: async (src) => {
          const toData = (blob) =>
            new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result || ''));
              fr.onerror = () => rej(new Error('read failed'));
              fr.readAsDataURL(blob);
            });
          for (const init of [
            {
              credentials: 'omit',
              cache: 'force-cache',
            },
            {
              credentials: 'omit',
              cache: 'default',
            },
          ]) {
            try {
              const resp = await fetch(src, init);
              if (!resp.ok) continue;
              const b = await resp.blob();
              if (!/^image\//i.test(b.type || '') || b.size < 200) continue;
              return await toData(b);
            } catch {}
          }
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            img.src = src;
            await (img.decode
              ? img.decode()
              : new Promise((res, rej) => {
                  img.onload = res;
                  img.onerror = rej;
                }));
            const w = img.naturalWidth || 0,
              h = img.naturalHeight || 0;
            if (!w || !h) return null;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            c.getContext('2d').drawImage(img, 0, 0);
            return c.toDataURL('image/jpeg', 0.92);
          } catch {}
          return null;
        },
      })
      .catch(() => []);
    const v = r?.[0]?.result;
    return typeof v === 'string' && /^data:image\//i.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function avatarUrlToDataUrl(url) {
  const u = String(url || '').trim();
  if (/^data:image\//i.test(u)) return u;
  if (!isFacebookAssetUrl(u)) return null;
  try {
    const r = await fetch(u, {
      credentials: 'omit',
      cache: 'force-cache',
      referrerPolicy: 'no-referrer',
    });
    if (!r.ok) throw new Error(`Avatar HTTP ${r.status}`);
    const blob = await r.blob();
    if (!/^image\//i.test(blob.type || '')) throw new Error('Avatar response is not an image');
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const mime = blob.type || 'image/jpeg';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (e) {
    console.warn('[Profile] background avatar conversion failed:', e?.message || e);
    return null;
  }
}

export async function getFacebookPageCookieId() {
  try {
    const c = await chrome.cookies.get({
      url: 'https://www.facebook.com/',
      name: 'i_user',
    });
    const v = String(c?.value || '').trim();
    return /^\d{5,}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export async function enforceAccountBinding() {
  if (state.__fbAccountGuardRunning) return null;
  state.__fbAccountGuardRunning = true;
  try {
    const cookieUserId = await getFacebookCookieUserId();
    const binding =
      (await chrome.storage.local.get('fb_account_binding').catch(() => ({}))).fb_account_binding || {};
    if (!cookieUserId) return null;
    if (isValidFacebookUserId(binding.userId) && String(binding.userId) !== String(cookieUserId)) {
      return await resetForAccountChange(binding.userId, cookieUserId);
    }
    if (!isValidFacebookUserId(binding.userId)) {
      await chrome.storage.local
        .set({
          fb_account_binding: {
            userId: String(cookieUserId),
            name: binding.name || '',
            boundAt: binding.boundAt || Date.now(),
            updatedAt: Date.now(),
            reset: false,
          },
        })
        .catch(() => {});
    }
    return null;
  } catch {
    return null;
  } finally {
    state.__fbAccountGuardRunning = false;
  }
}

export async function getFacebookCookieUserId() {
  try {
    const c = await chrome.cookies.get({
      url: 'https://www.facebook.com/',
      name: 'c_user',
    });
    return isValidFacebookUserId(c?.value) ? String(c.value) : null;
  } catch {
    return null;
  }
}

export async function resetForAccountChange(previousId, currentId) {
  const old = String(previousId || '').trim(),
    next = String(currentId || '').trim();
  if (state.realPostJob) {
    state.realPostJob.stopped = true;
    await closeRealPostingWindows(state.realPostJob).catch(() => {});
  }
  await cancelActiveSync('Facebook account changed.').catch(() => {});
  await chrome.storage.local
    .remove([
      'fb_groups_list',
      'fb_groups_by_identity',
      'fb_groups_stats',
      'fb_sync_progress',
      'fb_sync_user_paused',
      'fb_scheduled_post',
      'fb_schedule_last_run',
      'fb_profile_cache',
      'fb_profile_last_check',
      'fb_managed_pages',
      'fb_page_sync_progress',
      'fb_posting_identity',
      'fb_composer_media_ids',
      'fb_last_facebook_tab_id',
      'lastUpdated',
      'source',
    ])
    .catch(() => {});
  await chrome.storage.local
    .set({
      fb_account_binding: {
        userId: next || null,
        changedAt: Date.now(),
        previousUserId: old || null,
        reset: true,
      },
    })
    .catch(() => {});
  return {
    success: false,
    accountChanged: true,
    previousUserId: old || null,
    userId: next || null,
    error:
      'Facebook account changed. Saved groups, Pages and schedules were reset. Click “Sync from Facebook” to load data for the new account.',
  };
}

export async function extractRealProfileFromAccountMenu(tabId, userId = '') {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId: Number(tabId) },
      world: 'MAIN',
      args: [String(userId || '')],
      func: async (uid) => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const vis = (e) => {
          if (!e) return false;
          const r = e.getBoundingClientRect?.();
          if (!r || r.width < 8 || r.height < 8) return false;
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
        };
        const imgSrc = (el) => {
          if (!el) return '';
          const u = el.currentSrc || el.src || el.getAttribute?.('src') || el.getAttribute?.('href') || '';
          return /^https?:\/\//i.test(u) ? u : '';
        };
        const avatarOf = (row) =>
          [...row.querySelectorAll('img,image')]
            .map(imgSrc)
            .find((u) => u && /(?:fbcdn|fbsbx|scontent)/i.test(u)) || '';
        const clickers = [
          ...document.querySelectorAll(
            '[role="banner"] [role="button"], [role="banner"] button, [role="banner"] [aria-haspopup="menu"]',
          ),
        ]
          .filter(vis)
          .sort((a, b) => (b.getBoundingClientRect().right || 0) - (a.getBoundingClientRect().right || 0));
        const find = () => {
          const roots = [
            ...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"]'),
          ].filter(vis);
          for (const root of roots) {
            const links = [...root.querySelectorAll('a[href]')].filter(vis);
            const exact = uid
              ? links.find((a) => {
                  try {
                    const u = new URL(a.href, location.href);
                    return (
                      u.searchParams.get('id') === uid ||
                      (/\/profile\.php$/i.test(u.pathname) && u.searchParams.get('id') === uid)
                    );
                  } catch {
                    return false;
                  }
                })
              : null;
            if (exact) {
              const row = exact.closest('[role="menuitem"],[role="option"],a,button') || exact;
              const lines = clean(row.innerText || row.textContent || '')
                .split(/\n+/)
                .map(clean)
                .filter(Boolean);
              const name =
                lines.find(
                  (x) =>
                    x.length >= 2 &&
                    x.length <= 120 &&
                    !/^(?:see all profiles?|see all pages?|settings|help|log out|meta business suite|display|report a problem|switch)$/i.test(
                      x,
                    ),
                ) || '';
              if (name) return { name, avatar: avatarOf(row), source: 'account-menu-profile-link' };
            }
            // Some builds render the profile row without profile.php but keep
            // the real c_user ID in data-hovercard-id / data-user-id. Accept only
            // a row carrying that exact UID; never guess from the first Page row.
            const rows = [...root.querySelectorAll('[role="menuitem"],[role="option"],a,button,div')].filter(
              vis,
            );
            for (const row of rows) {
              const html = String(row.outerHTML || '');
              if (!uid || !html.includes(uid)) continue;
              const text = clean(row.innerText || row.textContent || '');
              const lines = text.split(/\n+/).map(clean).filter(Boolean);
              if (
                !lines.length ||
                lines.some((x) =>
                  /^(?:see all pages?|see all profiles?|meta business suite|settings|help|report a problem|log out|display|accessibility)$/i.test(
                    x,
                  ),
                )
              )
                continue;
              const av = avatarOf(row);
              if (!av) continue;
              const name = lines.find(
                (x) =>
                  x.length >= 2 && x.length <= 120 && !/^(?:switch|use as|select|page|profile)$/i.test(x),
              );
              if (name) return { name, avatar: av, source: 'account-menu-profile-uid-row' };
            }
          }
          return null;
        };
        let result = find();
        if (!result) {
          const opener = clickers[0];
          if (opener) {
            try {
              opener.click();
            } catch {}
            await new Promise((r) => setTimeout(r, 700));
            result = find();
            try {
              document.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'Escape',
                  code: 'Escape',
                  bubbles: true,
                  cancelable: true,
                }),
              );
            } catch {}
          }
        }
        return result || { name: '', avatar: '', source: 'none' };
      },
    });
    return r?.[0]?.result || { name: '', avatar: '' };
  } catch {
    return { name: '', avatar: '' };
  }
}

export async function getProfileInternal() {
  const cookieUserId = await getFacebookCookieUserId();
  const binding = (await chrome.storage.local.get('fb_account_binding')).fb_account_binding || {};
  if (
    isValidFacebookUserId(binding.userId) &&
    cookieUserId &&
    String(binding.userId) !== String(cookieUserId)
  ) {
    return await resetForAccountChange(binding.userId, cookieUserId);
  }
  const activePageId = await getFacebookPageCookieId();
  if (activePageId && cookieUserId) {
    const cache =
      (await chrome.storage.local.get('fb_profile_cache').catch(() => ({}))).fb_profile_cache || {};
    let c = cache?.[String(cookieUserId)] || null;
    let resolved = { name: String(c?.name || ''), avatar: String(c?.avatarDataUrl || '') };
    if (!resolved.name || /^Facebook Account$/i.test(resolved.name)) {
      const fbTab = await findFacebookTab();
      if (fbTab?.id) {
        const fromMenu = await extractRealProfileFromAccountMenu(fbTab.id, String(cookieUserId));
        if (fromMenu?.name)
          resolved = {
            name: String(fromMenu.name),
            avatar: String(fromMenu.avatar || resolved.avatar || ''),
          };
      }
    }
    if (resolved.name) {
      cache[String(cookieUserId)] = {
        ...(c || {}),
        v: 2,
        id: String(cookieUserId),
        name: resolved.name,
        ...(resolved.avatar
          ? { avatarDataUrl: resolved.avatar, avatarSource: 'account-menu-profile-row' }
          : {}),
        updatedAt: Date.now(),
      };
      c = cache[String(cookieUserId)];
      await chrome.storage.local.set({ fb_profile_cache: cache }).catch(() => {});
    }
    const av = /^data:image\//i.test(String(c?.avatarDataUrl || '')) ? String(c.avatarDataUrl) : null;
    return {
      success: true,
      pageModeActive: true,
      activePageId: activePageId,
      profile: {
        id: String(cookieUserId),
        name: String(c?.name || resolved.name || 'Facebook Account'),
        avatar: av,
        avatarDataUrl: av,
      },
      fromCache: !!c,
    };
  }
  let tab = await findFacebookTab();
  let openedByChecking = false;
  if (!tab?.id) {
    try {
      const cached = (await chrome.storage.local.get('fb_profile_cache')).fb_profile_cache || {};
      const entries = Object.values(cached).filter(
        (x) => isValidFacebookUserId(x?.id) && Number(x?.v || 0) >= 2,
      );
      const matching = cookieUserId ? entries.filter((x) => String(x.id) === String(cookieUserId)) : entries;
      if (matching.length) {
        matching.sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
        const c = matching[0];
        return {
          success: true,
          profile: {
            id: String(c.id),
            name: String(c.name || 'Facebook Account'),
            avatar: /^data:image\//i.test(String(c.avatarDataUrl || '')) ? c.avatarDataUrl : null,
            avatarDataUrl: /^data:image\//i.test(String(c.avatarDataUrl || '')) ? c.avatarDataUrl : null,
          },
          fromCache: true,
        };
      }
    } catch {}
    if (cookieUserId) {
      const now = Date.now();
      await chrome.storage.local
        .set({
          fb_account_binding: {
            userId: String(cookieUserId),
            name: '',
            boundAt: binding.boundAt || now,
            updatedAt: now,
            reset: false,
          },
        })
        .catch(() => {});
      return {
        success: true,
        profile: {
          id: String(cookieUserId),
          name: 'Facebook Account',
          avatar: null,
          avatarDataUrl: null,
        },
        fromCookie: true,
      };
    }
    openedByChecking = true;
    try {
      const directUrl = 'https://www.facebook.com/';
      tab = await chrome.tabs.create({
        url: directUrl,
        active: true,
      });
      if (!tab?.id)
        return {
          success: false,
          error: 'Could not open Facebook for profile checking.',
        };
      await waitForComplete(tab.id, 45e3);
      await sleep(1800);
    } catch (e) {
      return {
        success: false,
        error: e?.message || String(e),
      };
    }
  }
  try {
    let profile = await extractProfileFromFacebookTab(tab.id);
    if (!isValidFacebookUserId(profile.id)) {
      const refreshed = await findFacebookTab();
      if (refreshed?.id && refreshed.id !== tab.id) {
        await waitForComplete(refreshed.id, 15e3).catch(() => {});
        profile = await extractProfileFromFacebookTab(refreshed.id).catch(() => ({}));
      }
    }
    if (!isValidFacebookUserId(profile.id)) {
      return {
        success: false,
        error: openedByChecking
          ? 'Facebook opened, but the current account could not be recognized. Make sure Facebook is logged in and click Refresh Connection.'
          : 'Facebook account information is not available on the current Facebook tab. Click Refresh Connection.',
      };
    }
    profile.id = String(profile.id).trim();
    const currentBinding = (await chrome.storage.local.get('fb_account_binding')).fb_account_binding || {};
    if (
      isValidFacebookUserId(currentBinding.userId) &&
      String(currentBinding.userId) !== String(profile.id)
    ) {
      return await resetForAccountChange(currentBinding.userId, profile.id);
    }
    await chrome.storage.local
      .set({
        fb_account_binding: {
          userId: profile.id,
          name: profile.name || '',
          boundAt: currentBinding.boundAt || Date.now(),
          updatedAt: Date.now(),
          reset: false,
        },
      })
      .catch(() => {});
    const trustedSource =
      /^(?:current-user-initial-data|alt-exact-name|self-profile-link|banner-account-button)$/.test(
        String(profile.avatarSource || ''),
      );
    let dataUrl = trustedSource
      ? await avatarUrlToDataUrlViaTab(tab.id, profile.avatar).catch(() => null)
      : null;
    if (trustedSource && !dataUrl) dataUrl = await avatarUrlToDataUrl(profile.avatar).catch(() => null);
    if (!dataUrl) {
      const cached = (await chrome.storage.local.get('fb_profile_cache')).fb_profile_cache || {};
      const cachedForUser = cached?.[profile.id];
      if (
        Number(cachedForUser?.v || 0) >= 2 &&
        /^data:image\//i.test(String(cachedForUser?.avatarDataUrl || ''))
      ) {
        dataUrl = cachedForUser.avatarDataUrl;
      } else if (cachedForUser) {
        delete cached[profile.id];
        await chrome.storage.local
          .set({
            fb_profile_cache: cached,
          })
          .catch(() => {});
      }
    }
    if (dataUrl) {
      profile.avatar = dataUrl;
      profile.avatarDataUrl = dataUrl;
      const cached = (await chrome.storage.local.get('fb_profile_cache')).fb_profile_cache || {};
      cached[profile.id] = {
        v: 2,
        id: profile.id,
        name: profile.name || cached?.[profile.id]?.name || '',
        avatarDataUrl: dataUrl,
        avatarSource: String(profile.avatarSource || ''),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({
        fb_profile_cache: cached,
      });
    } else {
      profile.avatar = null;
      profile.avatarDataUrl = null;
      const cache = (await chrome.storage.local.get('fb_profile_cache')).fb_profile_cache || {};
      cache[profile.id] = {
        ...(cache?.[profile.id] || {}),
        v: 2,
        id: profile.id,
        name: profile.name || cache?.[profile.id]?.name || '',
        avatarDataUrl: String(cache?.[profile.id]?.avatarDataUrl || ''),
        avatarSource: String(profile.avatarSource || ''),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({ fb_profile_cache: cache }).catch(() => {});
    }
    return {
      success: true,
      profile: profile,
    };
  } catch (e) {
    return {
      success: false,
      error: e?.message || String(e),
    };
  }
}

export async function getProfile() {
  if (state.profileCheckPromise) return state.profileCheckPromise;
  state.profileCheckPromise = (async () => {
    try {
      return await getProfileInternal();
    } finally {
      state.profileCheckPromise = null;
    }
  })();
  return state.profileCheckPromise;
}

export async function runInstallProfileChecking(reason) {
  try {
    const existing = await findFacebookTab();
    if (existing?.id) {
      console.log('[Profile] Existing Facebook tab found; using original tab logic immediately.', reason);
      const result = await getProfile();
      await chrome.storage.local.set({
        fb_profile_last_check: {
          reason: reason,
          result: result,
          updatedAt: Date.now(),
        },
      });
      return result;
    }
    const cookieUserId = await getFacebookCookieUserId();
    if (reason === 'install' && cookieUserId) {
      const profileUrl = `https://www.facebook.com/profile.php?id=${encodeURIComponent(cookieUserId)}`;
      console.log('[Profile] Install: opening authenticated profile URL:', profileUrl);
      const tab = await chrome.tabs.create({
        url: profileUrl,
        active: true,
      });
      if (tab?.id) {
        await waitForComplete(tab.id, 45e3).catch(() => {});
        await sleep(1800);
      }
      const result = await getProfile();
      await chrome.storage.local.set({
        fb_profile_last_check: {
          reason: reason,
          result: result,
          updatedAt: Date.now(),
        },
      });
      return result;
    }
    console.log('[Profile] No Facebook tab; keeping cookie-only/original checking path.', reason);
    const result = await getProfile();
    await chrome.storage.local.set({
      fb_profile_last_check: {
        reason: reason,
        result: result,
        updatedAt: Date.now(),
      },
    });
    return result;
  } catch (e) {
    const result = {
      success: false,
      error: e?.message || String(e),
    };
    await chrome.storage.local
      .set({
        fb_profile_last_check: {
          reason: reason,
          result: result,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    return result;
  }
}
