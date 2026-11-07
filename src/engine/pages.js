// Facebook automation engine: pages. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { pickIdentityFromAccountMenu, waitForIdentityCookie } from './identity';
import {
  avatarUrlToDataUrl,
  avatarUrlToDataUrlViaTab,
  enforceAccountBinding,
  getFacebookCookieUserId,
  getFacebookPageCookieId,
  getProfile,
  sleep,
  waitForComplete,
} from './profile';
import { closeSyncFacebookTabOnly, createFacebookSyncWorker } from './sync';

export async function switchFacebookIdentityInTab(tabId, identity) {
  const wantPage = String(identity?.type || '') === 'page';
  const name = normalizeManagedPageName(identity?.name);
  const wantPageId = String(identity?.id || '').match(/^\d{5,}$/) ? String(identity.id) : '';
  if (!tabId || !name) return { success: false, error: 'No Facebook posting tab or identity was supplied.' };

  // CRITICAL POSTING RULE: identity switching for a real post is performed
  // inside the existing posting popup. Never open /pages/?category=your_pages,
  // never create a second switch tab, and never route the post through the
  // Page-sync workflow.
  const activePageId = await getFacebookPageCookieId().catch(() => '');
  if (wantPage && activePageId && (!wantPageId || String(activePageId) === wantPageId)) {
    return { success: true, alreadyActive: true, type: 'page', name };
  }
  if (!wantPage && !activePageId) {
    return { success: true, alreadyActive: true, type: 'profile', name };
  }

  const clicked = await pickIdentityFromAccountMenu(tabId, name).catch(() => false);
  if (!clicked) {
    return { success: false, error: `Facebook identity "${name}" was not found in the account menu.` };
  }
  const confirmed = await waitForIdentityCookie(wantPage, wantPageId, 15e3);
  if (confirmed === null) {
    return { success: false, error: `Facebook did not confirm switching to "${name}".` };
  }
  await chrome.storage.local
    .set({
      fb_posting_identity: {
        type: wantPage ? 'page' : 'profile',
        name,
        id: wantPage ? wantPageId || null : null,
        avatar: String(identity?.avatar || ''),
        updatedAt: Date.now(),
      },
    })
    .catch(() => {});
  return { success: true, type: wantPage ? 'page' : 'profile', name, activePageId: confirmed };
}

export async function scrapeManagedPagesInTab(tabId) {
  const run = async () =>
    chrome.scripting.executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      func: async () => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const sleepLocal = (ms) => new Promise((r) => setTimeout(r, ms));
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect?.();
          if (!r || r.width <= 0 || r.height <= 0) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
        };
        const text = (el) =>
          clean(
            el?.innerText ||
              el?.textContent ||
              el?.getAttribute?.('aria-label') ||
              el?.getAttribute?.('title') ||
              '',
          );
        const abs = (u) => {
          try {
            return new URL(String(u || ''), location.href).href;
          } catch {
            return '';
          }
        };
        const ignored =
          /^(?:pages|your pages|pages you manage|create page|discover|followed pages|invites|meta business suite|settings|privacy|help|report a problem|log out|facebook|home|reels|marketplace|create post|promote|notifications?|messages?|more|see all pages|see all profiles|back to previous page)$/i;
        const pageUrl = (href) => {
          try {
            const u = new URL(String(href || ''), location.href);
            if (!/facebook\.com$/i.test(u.hostname) && !/\.facebook\.com$/i.test(u.hostname)) return '';
            if (/^\/pages\/$/i.test(u.pathname) && /category=your_pages/i.test(u.search)) return '';
            return u.href;
          } catch {
            return '';
          }
        };
        const avatarCandidate = (img) => {
          if (!visible(img)) return null;
          const r = img.getBoundingClientRect?.() || {};
          const src = abs(img.currentSrc || img.src || img.getAttribute('src') || '');
          if (!src || r.width < 24 || r.height < 24 || r.width > 220 || r.height > 220) return null;
          const nw = Number(img.naturalWidth || 0),
            nh = Number(img.naturalHeight || 0);
          if (nw && nh && (nw < 24 || nh < 24)) return null;
          const ratio = r.width / Math.max(1, r.height);
          if (ratio < 0.65 || ratio > 1.5) return null;
          if (/sprite|emoji|data:image\/svg|staticxx/i.test(src)) return null;
          return {
            src: src,
            area: r.width * r.height,
          };
        };
        const imageCandidates = (el) =>
          [...el.querySelectorAll('img')]
            .map(avatarCandidate)
            .filter(Boolean)
            .sort((a, b) => b.area - a.area);
        const linksIn = (el) =>
          [...el.querySelectorAll('a[href]')]
            .map((a) => ({
              a: a,
              href: pageUrl(a.href),
              text: text(a),
            }))
            .filter((x) => x.href);
        const pageId = (href) =>
          String(href || '').match(/[?&]id=(\d{5,})/i)?.[1] ||
          String(href || '').match(/\/pages\/[^/?#]+\/(\d{5,})(?:[/?#]|$)/i)?.[1] ||
          '';
        const looksLikeCard = (el) => {
          if (!visible(el)) return false;
          const t = text(el);
          if (t.length < 8 || t.length > 2200) return false;
          if (!/\bcreate\s+post\b/i.test(t) || !/\bpromote\b/i.test(t)) return false;
          const imgs = imageCandidates(el);
          if (!imgs.length) return false;
          const pageLinks = linksIn(el).filter(
            (x) => x.text && x.text.length >= 2 && x.text.length <= 140 && !ignored.test(x.text),
          );
          if (!pageLinks.length) return false;
          const r = el.getBoundingClientRect?.();
          return !!r && r.width >= 240 && r.height >= 70 && r.height <= 900;
        };
        const bestCardFor = (control) => {
          let best = null,
            node = control;
          for (let depth = 0; depth < 20 && node; depth++, node = node.parentElement) {
            if (looksLikeCard(node)) {
              const r = node.getBoundingClientRect();
              const score =
                r.width * r.height +
                text(node).length * 250 +
                node.querySelectorAll('button,a,[role="button"]').length * 2500;
              if (!best || score < best.score)
                best = {
                  node: node,
                  score: score,
                };
            }
          }
          return best?.node || null;
        };
        const extractFromCard = (card) => {
          const links = linksIn(card).filter(
            (x) => x.text && x.text.length >= 2 && x.text.length <= 140 && !ignored.test(x.text),
          );
          const headings = [...card.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"]')]
            .map(text)
            .filter((x) => x.length >= 2 && x.length <= 140 && !ignored.test(x));
          let name = headings[0] || links.sort((a, b) => a.text.length - b.text.length)[0]?.text || '';
          if (!name) {
            name =
              clean(card.innerText || '')
                .split(/\n+/)
                .map(clean)
                .find((x) => x.length >= 2 && x.length <= 140 && !ignored.test(x)) || '';
          }
          if (!name || ignored.test(name)) return null;
          const exact = links.find((x) => x.text.toLocaleLowerCase() === name.toLocaleLowerCase());
          const link = (exact || links[0])?.href || '';
          const imgs = imageCandidates(card);
          if (!imgs.length) return null;
          return {
            id: pageId(link) || null,
            name: name,
            avatar: imgs[0].src,
            url: link || null,
            type: 'page',
          };
        };
        const collect = () => {
          const controls = [...document.querySelectorAll('button,a,[role="button"]')]
            .filter(visible)
            .filter((el) => /^create\s+post$/i.test(text(el)));
          const cards = [];
          for (const control of controls) {
            const card = bestCardFor(control);
            if (card) cards.push(card);
          }
          const out = [],
            seen = new Set();
          for (const card of [...new Set(cards)]) {
            const item = extractFromCard(card);
            if (!item) continue;
            const key = String(item.id || item.name).toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
          }
          return out;
        };
        for (let i = 0; i < 16; i++) {
          const found = collect();
          if (found.length) return found.slice(0, 100);
          await sleepLocal(750);
        }
        return collect().slice(0, 100);
      },
    });
  const r = await run();
  return Array.isArray(r?.[0]?.result) ? r[0].result : [];
}

export async function collectNetworkPageCandidates(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: {
        tabId: Number(tabId),
      },
      world: 'MAIN',
      func: () => {
        try {
          return typeof window.__FBMP_GET_PAGE_NETWORK_CANDIDATES__ === 'function'
            ? window.__FBMP_GET_PAGE_NETWORK_CANDIDATES__()
            : [];
        } catch {
          return [];
        }
      },
    });
    return Array.isArray(r?.[0]?.result) ? r[0].result : [];
  } catch {
    return [];
  }
}

export const FBMP_BLOCKED_PAGE_UI_NAME =
  /^(?:chat(?:\s+history(?:\s+is\s+missing)?)?|chat\s+history|invitations?(?:\s+\d+\s+(?:new|pending))?|invites?(?:\s+\d+\s+(?:new|pending))?|messages?(?:\s+\d+)?|notifications?(?:\s+\d+)?|messenger|see\s+all\s+(?:pages?|profiles?)|pages?|your\s+pages|pages\s+you\s+manage|create\s+page|create\s+post|promote|switch\s+now|switch\s+back|activate|deactivated\s+and\s+deleted\s+pages|discover|followed\s+pages|meta\s+business\s+suite|inbox|insights|live\s+video|photo\/?video|reel|home|marketplace|report\s+a\s+problem|professional\s+dashboard|settings(?:\s*&\s*privacy)?|privacy|help(?:\s*&\s*support)?|display\s*&\s*accessibility|back\s+to\s+previous\s+page|log\s+out|dashboard|edit\s+profile)$/i;

export function normalizeManagedPageName(value) {
  let name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return '';
  const cutPatterns = [
    /\s+(?:\d+\s+)?notifications?\b.*$/i,
    /\s+(?:\d+\s+)?messages?\b.*$/i,
    /\s+(?:switch\s*now|switch\s*back|activate)\b.*$/i,
  ];
  for (const re of cutPatterns) {
    const m = name.match(re);
    if (m && m.index > 1) name = name.slice(0, m.index).trim();
  }
  name = name.replace(/^[/•·▪◦\-–—_]+\s*/, '').trim();
  return name;
}

export function isBlockedManagedPageUiName(value) {
  const n = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return true;
  if (FBMP_BLOCKED_PAGE_UI_NAME.test(n)) return true;
  if (/^chat\s+history\b/i.test(n)) return true;
  return false;
}

export function isUsableManagedPageName(value) {
  const n = normalizeManagedPageName(value);
  if (!n || n.length < 2 || n.length > 160) return false;
  if (isBlockedManagedPageUiName(n)) return false;
  return !/^(?:pages?|your pages|pages you manage|create page|create post|promote|switch now|switch back|activate|deactivated and deleted pages|notifications?|messages?|chats?|messenger|discover|followed pages|invites?|invitations?|meta business suite|inbox|insights|live video|photo\/?video|reel|home|marketplace|report a problem|professional dashboard|settings|see all pages|see all profiles|back to previous page|log out|dashboard|edit profile)$/i.test(
    n,
  );
}

export function safeFacebookPageUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (!/^https?:$/i.test(u.protocol) || !/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
    if (u.search || u.hash) return '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (
      parts.length === 1 &&
      /^[A-Za-z0-9._-]{2,80}$/.test(parts[0]) &&
      !/^(?:pages?|groups?|watch|reels?|marketplace|events?|messages?|notifications?|settings|help|privacy|logout|log_out)$/i.test(
        parts[0],
      )
    )
      return `https://www.facebook.com/${parts[0]}/`;
    if (parts.length === 2 && /^pages$/i.test(parts[0]) && /^[A-Za-z0-9._-]{2,120}$/.test(parts[1]))
      return `https://www.facebook.com/pages/${parts[1]}/`;
    if (
      parts.length === 3 &&
      /^pages$/i.test(parts[0]) &&
      /^[A-Za-z0-9._-]{2,120}$/.test(parts[1]) &&
      /^\d{5,}$/.test(parts[2])
    )
      return `https://www.facebook.com/pages/${parts[1]}/${parts[2]}`;
  } catch {}
  return '';
}

export function pagePictureEndpoint(page) {
  try {
    const u = new URL(String(page?.url || ''));
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
    const parts = u.pathname.split('/').filter(Boolean);
    let key = '';
    if (parts.length === 1 && /^[A-Za-z0-9._-]{2,80}$/.test(parts[0])) key = parts[0];
    else if (parts.length >= 3 && /^pages$/i.test(parts[0]) && /^\d{5,}$/.test(parts[2])) key = parts[2];
    else if (parts.length === 2 && /^pages$/i.test(parts[0]) && /^\d{5,}$/.test(parts[1])) key = parts[1];
    if (!key) return '';
    return `https://www.facebook.com/${encodeURIComponent(key)}/picture?type=large`;
  } catch {
    return '';
  }
}

export async function resolveExactPageAvatarInWorkerTab(tabId, page) {
  const endpoint = pagePictureEndpoint(page);
  if (!endpoint) return '';
  try {
    const r = await chrome.scripting.executeScript({
      target: {
        tabId: Number(tabId),
      },
      world: 'MAIN',
      args: [endpoint],
      func: async (url) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const test = () =>
          new Promise((resolve) => {
            const img = new Image();
            img.referrerPolicy = 'strict-origin-when-cross-origin';
            img.decoding = 'async';
            const done = () =>
              resolve({
                src: String(img.currentSrc || img.src || '').trim(),
                naturalWidth: Number(img.naturalWidth || 0),
                naturalHeight: Number(img.naturalHeight || 0),
              });
            img.onload = done;
            img.onerror = () =>
              resolve({
                src: '',
                naturalWidth: 0,
                naturalHeight: 0,
              });
            img.src = url;
            setTimeout(done, 9e3);
          });
        for (let i = 0; i < 2; i++) {
          const x = await test();
          if (x.src && x.naturalWidth >= 40 && x.naturalHeight >= 40) return x;
          await sleep(250);
        }
        return {
          src: '',
          naturalWidth: 0,
          naturalHeight: 0,
        };
      },
    });
    const x = r?.[0]?.result || {};
    return /^https?:\/\//i.test(String(x.src || '')) ? String(x.src) : '';
  } catch {
    return '';
  }
}

export async function verifyManagedPageInTempTab(page, windowId) {
  return page;
}

export async function verifyManagedPagesFast(pages, windowId, sourceTabId = null) {
  const list = Array.isArray(pages) ? pages : [];
  const out = list.map((x) => ({
    ...x,
  }));
  if (!sourceTabId) return out;
  const concurrency = 5;
  for (let i = 0; i < out.length; i += concurrency) {
    const batch = out.slice(i, i + concurrency);
    const resolved = await Promise.all(
      batch.map(async (p) => {
        const src = await resolveExactPageAvatarInWorkerTab(sourceTabId, p);
        if (src) {
          const data = await avatarUrlToDataUrl(src).catch(() => null);
          return data
            ? {
                ...p,
                avatar: data,
                avatarSource: 'facebook-picture-endpoint',
                verifiedAvatar: true,
              }
            : {
                ...p,
                avatar: src,
                avatarSource: 'facebook-picture-endpoint',
                verifiedAvatar: true,
              };
        }
        return {
          ...p,
          avatarSource: p?.avatar ? 'page-card' : 'none',
        };
      }),
    );
    for (let j = 0; j < resolved.length; j++) out[i + j] = resolved[j];
    await chrome.storage.local
      .set({
        fb_managed_pages: mergeManagedPages([], out),
        fb_page_sync_progress: {
          phase: 'verify-avatar',
          index: Math.min(i + resolved.length, out.length),
          total: list.length,
          foundPages: list.length,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
  }
  return out;
}

export function mergeManagedPages(base, incoming) {
  const map = new Map();
  const add = (x) => {
    const rawName = String(x?.name || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (isBlockedManagedPageUiName(rawName)) return;
    const name = normalizeManagedPageName(rawName);
    if (!isUsableManagedPageName(name)) return;
    const id = String(x?.id || '').trim();
    const url = safeFacebookPageUrl(x?.url) || String(x?.url || '').trim();
    const key = id || url || name.toLocaleLowerCase();
    const old = map.get(key) || {};
    const oldSource = String(old?.source || '');
    const newSource = String(x?.source || '');
    const preferNewName = /dom-card|page-card|verified/i.test(newSource) || !oldSource;
    const newAv = String(x?.avatar || '').trim(),
      oldAv = String(old?.avatar || '').trim();
    const isData = (v) => /^data:image\//i.test(v);
    const preferNewAvatar =
      !!newAv &&
      (!oldAv || isData(newAv) || (!isData(oldAv) && /dom-card|page-card|verified/i.test(newSource)));
    map.set(key, {
      ...(old || {}),
      ...(x || {}),
      name: preferNewName ? name : normalizeManagedPageName(old?.name || name),
      type: 'page',
      avatar: preferNewAvatar ? newAv : oldAv || newAv,
      url: url || old?.url || null,
    });
  };
  (Array.isArray(base) ? base : []).forEach(add);
  (Array.isArray(incoming) ? incoming : []).forEach(add);
  return [...map.values()];
}

export async function waitTabComplete(tabId, timeout = 15e3) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) break;
    if (t.status === 'complete') return t;
    await new Promise((r) => setTimeout(r, 350));
  }
  return await chrome.tabs.get(tabId).catch(() => null);
}

export async function pageDomCards(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId: Number(tabId) },
      world: 'ISOLATED',
      func: () => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const normalizeManagedPageName = (value) => {
          let name = clean(value);
          if (!name) return '';
          const cutPatterns = [
            /\s+(?:\d+\s+)?notifications?\b.*$/i,
            /\s+(?:\d+\s+)?messages?\b.*$/i,
            /\s+(?:create\s+post|promote|advertise|advertising|advertisement)\b.*$/i,
            /\s+(?:create\s+post\s+promote)\b.*$/i,
          ];
          for (const re of cutPatterns) {
            const m = name.match(re);
            if (m && m.index > 1) name = name.slice(0, m.index).trim();
          }
          return name.replace(/^[/•·▪◦\-–—_]+\s*/, '').trim();
        };
        const isUsableManagedPageName = (value) => {
          const n = normalizeManagedPageName(value);
          if (!n || n.length < 2 || n.length > 160) return false;
          return !/^(?:pages?|your pages|pages you manage|create page|create post|promote|advertise|advertising|advertisement|notifications?|messages?|discover|followed pages|invites?|meta business suite|inbox|insights|live video|photo\/?video|reel|home|marketplace|report a problem|professional dashboard|settings|see all pages|see all profiles|back to previous page|log out|dashboard|edit profile)$/i.test(
            n,
          );
        };
        const vis = (e) => {
          if (!e) return false;
          const r = e.getBoundingClientRect?.();
          if (!r || r.width <= 0 || r.height <= 0) return false;
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden';
        };
        const imgs = (e) =>
          [...e.querySelectorAll('img')]
            .filter(vis)
            .map((i) => String(i.currentSrc || i.src || '').trim())
            .filter((u) => /^https?:\/\//i.test(u) && !/emoji|sprite|staticxx/i.test(u));
        const lines = (e) =>
          clean(e?.innerText || e?.textContent || '')
            .split(/\n+/)
            .map(clean)
            .filter(Boolean);
        const out = [];
        const seen = new Set();
        const controls = [...document.querySelectorAll('button,a,[role="button"],[role="link"]')].filter(vis);
        for (const c of controls) {
          if (
            !/create\s+post/i.test(clean(c.innerText || c.textContent || c.getAttribute('aria-label') || ''))
          )
            continue;
          let n = c,
            card = null;
          for (let i = 0; i < 10 && n; i++, n = n.parentElement) {
            const tx = clean(n.innerText || n.textContent || '');
            if (tx && /create\s+post/i.test(tx) && /promote/i.test(tx) && imgs(n).length) {
              card = n;
              break;
            }
          }
          if (!card) continue;
          const ls = lines(card);
          const name = (() => {
            for (const sel of ['h1', 'h2', 'h3', '[role="heading"]']) {
              for (const e of card.querySelectorAll(sel)) {
                const t = normalizeManagedPageName(e.textContent);
                if (isUsableManagedPageName(t)) return t;
              }
            }
            const xs = ls.map(normalizeManagedPageName).filter((v) => isUsableManagedPageName(v));
            xs.sort((a, b) => a.length - b.length);
            return xs[0] || '';
          })();
          if (
            !name ||
            /^(?:live video|photo\/?video|reel|dashboard|edit profile|advertise|advertising|advertisement)$/i.test(
              name,
            )
          )
            continue;
          const nlow = name.toLowerCase();
          const ranked = imgs(card)
            .map((src) => {
              const img = [...card.querySelectorAll('img')].find(
                (i) => String(i.currentSrc || i.src || '').trim() === src,
              );
              const r = img?.getBoundingClientRect?.() || { width: 0, height: 0, top: 9999 };
              const alt = clean(img?.alt || img?.getAttribute?.('aria-label') || '').toLowerCase();
              let score = 30;
              if (alt && nlow && alt.includes(nlow.slice(0, Math.min(30, nlow.length)))) score += 650;
              if (r.width >= 40 && r.width <= 320 && r.height >= 40 && r.height <= 320) score += 170;
              if (Math.abs(r.width - r.height) < 60) score += 120;
              if (r.top < 520) score += 30;
              if (/sprite|emoji|staticxx|pixel|placeholder|default[_-]?profile|icon/i.test(src)) score -= 220;
              return { src, score };
            })
            .sort((a, b) => b.score - a.score);
          const av = ranked[0]?.src || '';
          const href =
            [...card.querySelectorAll('a[href]')]
              .map((a) => a.href)
              .find(
                (h) =>
                  /facebook\.com/i.test(h) &&
                  !/facebook\.com\/(?:pages|groups|watch|reels|marketplace|events|notifications|messages)/i.test(
                    h,
                  ),
              ) || '';
          const key = (href || name).toLocaleLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: null,
            name,
            avatar: av || null,
            url: href || null,
            type: 'page',
            source: 'page-card',
          });
        }
        return out.slice(0, 100);
      },
    });
    return Array.isArray(r?.[0]?.result) ? r[0].result : [];
  } catch {
    return [];
  }
}

export async function scrollFacebookPagesTab(tabId, passes = 18) {
  let merged = [];
  let stable = 0;
  let lastHeight = 0;
  for (let i = 0; i < passes; i++) {
    merged = mergeManagedPages(merged, await collectNetworkPageCandidates(tabId));
    merged = mergeManagedPages(merged, await pageDomCards(tabId));
    const state = await chrome.scripting
      .executeScript({
        target: {
          tabId: Number(tabId),
        },
        world: 'ISOLATED',
        func: () => {
          const y = window.scrollY || 0;
          const h = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
          const vh = window.innerHeight || 800;
          window.scrollBy(0, Math.max(vh * 0.85, 550));
          return {
            y: y,
            h: h,
          };
        },
      })
      .catch(() => []);
    const h = Number(state?.[0]?.result?.h || 0);
    const y = Number(state?.[0]?.result?.y || 0);
    if (h === lastHeight && y > h - 800) stable++;
    else stable = 0;
    lastHeight = h;
    await new Promise((r) => setTimeout(r, 700));
    const after = await collectNetworkPageCandidates(tabId);
    merged = mergeManagedPages(merged, after);
    if (stable >= 3 || (h && y >= h - 50)) {
      await new Promise((r) => setTimeout(r, 900));
      merged = mergeManagedPages(merged, await collectNetworkPageCandidates(tabId));
      merged = mergeManagedPages(merged, await pageDomCards(tabId));
      break;
    }
  }
  return merged;
}

export async function scanManagedFacebookPages(tabId, pass = 1) {
  const r = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: 'MAIN',
    args: [Number(pass || 1)],
    func: async (pass) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const clean = (v) =>
        String(v ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      // HARD UI BLOCKLIST: these are Facebook account/navigation items, never Pages.
      const FB_UI_BLOCKED = new Set([
        'chat',
        'chat history',
        'chat history is missing',
        'invitations',
        'invites',
        'messages',
        'messenger',
        'notifications',
        'see all pages',
        'see all profiles',
        'pages',
        'your pages',
        'pages you manage',
        'create page',
        'create post',
        'promote',
        'switch now',
        'switch back',
        'activate',
        'deactivated and deleted pages',
        'meta business suite',
        'inbox',
        'insights',
        'live video',
        'photo/video',
        'reel',
        'home',
        'marketplace',
        'report a problem',
        'professional dashboard',
        'settings',
        'privacy',
        'help',
        'display & accessibility',
        'back to previous page',
        'log out',
        'dashboard',
        'edit profile',
      ]);
      const isHardBlockedUI = (v) => FB_UI_BLOCKED.has(clean(v).toLocaleLowerCase());
      // IMPORTANT: executeScript serializes this function into Facebook's MAIN world.
      // It cannot see extension-scope helpers, so every helper used below must be local.
      const normalizeManagedPageName = (value) => {
        let name = clean(value);
        if (!name) return '';
        const cutPatterns = [
          /\s+(?:\d+\s+)?notifications?\b.*$/i,
          /\s+(?:\d+\s+)?messages?\b.*$/i,
          /\s+(?:create\s+post|promote|advertise|advertising|advertisement)\b.*$/i,
          /\s+(?:create\s+post\s+promote)\b.*$/i,
          /\s+(?:switch\s*now|switch\s*back|activate)\b.*$/i,
        ];
        for (const re of cutPatterns) {
          const m = name.match(re);
          if (m && m.index > 1) name = name.slice(0, m.index).trim();
        }
        name = name.replace(/^[/•·▪◦\-–—_]+\s*/, '').trim();
        return name;
      };
      const isUsableManagedPageName = (value) => {
        const n = normalizeManagedPageName(value);
        if (!n || n.length < 2 || n.length > 160) return false;
        return !/^(?:pages?|your pages|pages you manage|create page|create post|promote|switch now|switch back|activate|deactivated and deleted pages|notifications?|messages?|chats?|messenger|discover|followed pages|invites?|invitations?|meta business suite|inbox|insights|live video|photo\/?video|reel|home|marketplace|report a problem|professional dashboard|settings|see all pages|see all profiles|back to previous page|log out|dashboard|edit profile)$/i.test(
          n,
        );
      };
      const safeFacebookPageUrl = (value) => {
        try {
          const u = new URL(String(value || ''));
          if (!/^https?:$/i.test(u.protocol) || !/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
          if (u.search || u.hash) return '';
          const parts = u.pathname.split('/').filter(Boolean);
          if (
            parts.length === 1 &&
            /^[A-Za-z0-9._-]{2,80}$/.test(parts[0]) &&
            !/^(?:pages?|groups?|watch|reels?|marketplace|events?|messages?|notifications?|settings|help|privacy|logout|log_out)$/i.test(
              parts[0],
            )
          )
            return `https://www.facebook.com/${parts[0]}/`;
          if (parts.length === 2 && /^pages$/i.test(parts[0]) && /^[A-Za-z0-9._-]{2,120}$/.test(parts[1]))
            return `https://www.facebook.com/pages/${parts[1]}/`;
          if (
            parts.length === 3 &&
            /^pages$/i.test(parts[0]) &&
            /^[A-Za-z0-9._-]{2,120}$/.test(parts[1]) &&
            /^\d{5,}$/.test(parts[2])
          )
            return `https://www.facebook.com/pages/${parts[1]}/${parts[2]}`;
        } catch {}
        return '';
      };
      const abs = (u) => {
        try {
          return new URL(String(u || ''), location.href).href.split('#')[0];
        } catch {
          return '';
        }
      };
      const http = (u) => /^https?:\/\//i.test(String(u || ''));
      // IMPORTANT FIX: "rendered" must NOT mean "currently inside the viewport".
      // The sync loop scrolls the list in big jumps; a card that already scrolled
      // past the top is still in the DOM, so getName() keeps working, but the old
      // viewport-bound visible() rejected every <img> inside it -> name OK, avatar
      // empty. That was the main reason avatars went missing.
      const rendered = (e) => {
        if (!e) return false;
        const r = e.getBoundingClientRect?.();
        if (!r || r.width < 8 || r.height < 8) return false;
        const s = getComputedStyle(e);
        return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
      };
      const visible = rendered;
      const inViewport = (e) => {
        const r = e?.getBoundingClientRect?.();
        return !!r && r.bottom > -400 && r.top < innerHeight + 400;
      };
      // Only accept real Facebook CDN media as an avatar. rsrc.php / static.xx are
      // UI sprites (Create Post, Promote, Advertise icons) and must never win.
      const isCdnMedia = (u) => {
        try {
          const h = new URL(String(u || ''), location.href).hostname;
          return /(^|\.)(fbcdn\.net|fbsbx\.com)$/i.test(h);
        } catch {
          return false;
        }
      };
      const badMedia =
        /sprite|emoji|rsrc\.php|static\.xx|\/images\/|data:image\/svg|\.svg(?:$|[?#])|placeholder/i;
      const absSrc = (u) => {
        try {
          return new URL(String(u || '').trim(), location.href).href;
        } catch {
          return '';
        }
      };
      // Facebook renders page avatars in three different ways depending on the
      // build: <img>, <svg><image xlink:href> (masked circular photo) and
      // <div style="background-image:url(...)">. Only reading <img> loses many of them.
      const mediaIn = (root) => {
        const out = [];
        const push = (el, raw) => {
          const src = absSrc(raw);
          if (!src || !/^https?:/i.test(src) || badMedia.test(src) || !isCdnMedia(src)) return;
          if (!rendered(el)) return;
          const r = el.getBoundingClientRect();
          out.push({
            el,
            src,
            r,
            alt: clean(el.getAttribute?.('alt') || el.getAttribute?.('aria-label') || ''),
            nw: Number(el.naturalWidth || 0),
            nh: Number(el.naturalHeight || 0),
          });
        };
        try {
          for (const el of root.querySelectorAll('img'))
            push(el, el.currentSrc || el.src || el.getAttribute('src'));
          for (const el of root.querySelectorAll('image'))
            push(el, el.getAttribute('xlink:href') || el.getAttribute('href'));
          for (const el of root.querySelectorAll('[style*="background-image"]')) {
            const m = String(el.getAttribute('style') || '').match(/url\((['"]?)(.*?)\1\)/i);
            if (m) push(el, m[2]);
          }
        } catch {}
        return out;
      };
      const badName =
        /^(?:pages?|pages you manage|create page|create post|promote|switch now|switch back|activate|deactivated and deleted pages|chats?|messenger|invitations?|notifications?|messages?|discover|followed pages|invites?|meta business suite|inbox|insights|live video|photo\/?video|reel|home|marketplace|report a problem|professional dashboard|settings|see all pages|see all profiles)$/i;
      const badPath =
        /\/(?:pages|groups|watch|reels|marketplace|events|notifications|messages|settings|help)(?:[/?]|$)/i;
      const validName = (v) => {
        const s = clean(v);
        return (
          s.length >= 2 &&
          s.length <= 160 &&
          !badName.test(s) &&
          !/^\d+$/.test(s) &&
          !/^(?:https?:\/\/)/i.test(s)
        );
      };
      const imgs = (el) =>
        mediaIn(el).map((x) => ({ img: x.el, src: x.src, alt: x.alt, r: x.r, nw: x.nw, nh: x.nh }));
      const getName = (card) => {
        for (const sel of ['h1', 'h2', 'h3', '[role="heading"]']) {
          const els = [...card.querySelectorAll(sel)];
          for (const e of els) {
            const t = normalizeManagedPageName(e.textContent);
            if (isUsableManagedPageName(t)) return t;
          }
        }
        const anchors = [...card.querySelectorAll('a[href]')];
        for (const a of anchors) {
          const t = normalizeManagedPageName(a.innerText || a.textContent || '');
          if (isUsableManagedPageName(t) && !/create\s+post|promote/i.test(t)) return t;
        }
        // The Page title is always the FIRST text line of the card. Sorting by
        // length used to return "Messages" / "Switch Now" instead of the name.
        const lines = String(card.innerText || card.textContent || '')
          .split(/\n+/)
          .map((v) => normalizeManagedPageName(v))
          .filter((v) => isUsableManagedPageName(v) && !/^(?:\d+\s+)?(?:notifications?|messages?)$/i.test(v));
        return lines[0] || '';
      };
      const getUrl = (card) => {
        const name = getName(card).toLowerCase();
        const anchors = [...card.querySelectorAll('a[href]')].filter((a) => visible(a));
        const exact = anchors
          .map((a) => ({ href: abs(a.href), text: clean(a.innerText || a.textContent || '') }))
          .find((x) => x.href && x.text && normalizeManagedPageName(x.text).toLowerCase() === name);
        if (exact?.href) {
          const safe = safeFacebookPageUrl(exact.href);
          if (safe) return safe;
        }
        const cands = anchors
          .map((a) => abs(a.href))
          .filter((u) => http(u) && /facebook\.com\//i.test(u) && !badPath.test(new URL(u).pathname));
        return (
          cands.sort((a, b) => {
            const score = (u) => {
              let n = 0;
              try {
                const p = new URL(u).pathname.toLowerCase();
                if (/^\/[A-Za-z0-9._-]+\/?$/.test(p)) n += 500;
                if (/^\/pages\/[^/]+(?:\/\d+)?\/?$/.test(p)) n += 420;
                if (/\/posts\//.test(p)) n -= 300;
                if (/create|promote|notifications|messages/.test(p)) n -= 500;
              } catch {}
              return n;
            };
            return score(b) - score(a);
          })[0] || ''
        );
      };
      // ---------------------------------------------------------------------
      // getAvatar(card): take the Page avatar from the <img>/<svg image>/CSS
      // background that lives inside the Page card itself. No Graph API, no
      // /picture endpoint, no opening the Page in a tab.
      // ---------------------------------------------------------------------
      const findNameNode = (card, name) => {
        const nlow = normalizeManagedPageName(name).toLowerCase();
        if (!nlow) return null;
        const sels = ['h1', 'h2', 'h3', '[role="heading"]', 'strong', 'b', 'span', 'a'];
        let exact = null,
          prefix = null;
        for (const sel of sels) {
          for (const e of card.querySelectorAll(sel)) {
            if (e.querySelector && e.querySelector(sel)) continue; // prefer leaf nodes
            const t = normalizeManagedPageName(e.textContent).toLowerCase();
            if (!t) continue;
            if (t === nlow) {
              exact = exact || e;
            } else if (!prefix && (t.startsWith(nlow + ' ') || t.startsWith(nlow + '\u00a0'))) prefix = e;
          }
          if (exact) break;
        }
        return exact || prefix || null;
      };
      const getAvatar = (card) => {
        const name = getName(card);
        const nlow = name.toLowerCase();
        const nameNode = findNameNode(card, name);
        const nr = nameNode?.getBoundingClientRect?.() || null;

        // Rank every media node found anywhere in the card, then hard-filter.
        const pool = mediaIn(card);
        if (!pool.length) return '';

        const scored = pool
          .map((x) => {
            const r = x.r || { width: 0, height: 0, top: 9999, left: 9999 };
            const w = r.width,
              h = r.height;
            const alt = String(x.alt || '').toLowerCase();
            let score = 0;

            // --- hard gates -----------------------------------------------------
            // An avatar is a small-ish square. Cover photos, banners and ad
            // creatives are not. Anything outside this box is disqualified.
            const squareish = w > 0 && h > 0 && Math.abs(w - h) <= Math.max(8, w * 0.28);
            const sized = w >= 20 && w <= 260 && h >= 20 && h <= 260;
            if (!squareish || !sized) return { src: x.src, score: -1, r, el: x.el };
            // Loaded bitmap must itself be square-ish (guards against 1x1 trackers
            // and wide logos scaled into a square box).
            if (x.nw && x.nh && (x.nw < 20 || x.nh < 20)) return { src: x.src, score: -1, r, el: x.el };

            score = 100;
            // --- alt / aria text -------------------------------------------------
            if (alt && nlow) {
              if (alt === nlow) score += 2000;
              else if (alt.includes(nlow) || nlow.includes(alt)) score += 1200;
            }
            if (/profile picture|profile photo|page photo|\bavatar\b/i.test(alt)) score += 600;
            // --- DOM relationship with the Page-name node ------------------------
            if (nameNode) {
              // Closest common ancestor: the avatar and the name normally sit in the
              // same small header block. Fewer hops up == stronger signal.
              let hops = 0,
                node = x.el;
              while (node && hops < 8 && !node.contains(nameNode)) {
                node = node.parentElement;
                hops++;
              }
              if (node && node.contains(nameNode)) score += 900 - hops * 90;
              // The avatar is rendered before the name in document order.
              try {
                const pos = x.el.compareDocumentPosition(nameNode);
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) score += 260;
              } catch {}
              // ...and to its left, roughly on the same line.
              if (nr) {
                if (r.left <= nr.left + 8) score += 240;
                if (Math.abs(r.top + h / 2 - (nr.top + nr.height / 2)) <= Math.max(48, h)) score += 300;
                if (Math.abs(r.left - nr.left) < 320) score += 120;
              }
            }
            // Same anchor as the Page link is a very strong signal.
            try {
              const a = x.el.closest?.('a[href]');
              if (a && normalizeManagedPageName(a.innerText || a.textContent || '').toLowerCase() === nlow)
                score += 800;
            } catch {}
            // --- size preference --------------------------------------------------
            if (w >= 48 && w <= 160) score += 200;
            if (w < 28) score -= 150; // tiny badges / verified ticks
            if (/\/p\d+x\d+\//.test(x.src)) score += 80; // fbcdn resized profile asset
            if (!x.nw && !x.nh) score -= 60; // not decoded yet, less trusted
            return { src: x.src, score, r, el: x.el };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.r.top - b.r.top || a.r.left - b.r.left);

        if (scored[0]) return scored[0].src;

        // Fallback: the first square CDN image in the card, top-left first.
        const positional = pool
          .filter(
            (x) =>
              x.r &&
              x.r.width >= 20 &&
              x.r.width <= 260 &&
              Math.abs(x.r.width - x.r.height) <= Math.max(8, x.r.width * 0.35),
          )
          .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
        return positional[0]?.src || '';
      };
      // Facebook lazy-loads card avatars; an <img> that has never been near the
      // viewport has no usable src yet. Force them to decode before harvesting.
      try {
        for (const im of document.querySelectorAll('img[loading="lazy"]')) {
          try {
            im.loading = 'eager';
            im.decoding = 'sync';
          } catch {}
        }
        const pending = [...document.querySelectorAll('img')]
          .filter((im) => !im.complete || !im.naturalWidth)
          .slice(0, 80);
        if (pending.length)
          await Promise.race([
            Promise.all(pending.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()))),
            sleep(1200),
          ]);
        await new Promise((r) => requestAnimationFrame(() => r()));
      } catch {}
      // Facebook's current /pages/?category=your_pages layout renders each Page as
      // [avatar] [name] [N notifications] [Messages] [Switch Now]. The old gate
      // required "Create post" + "Promote", which no longer exists there, so the
      // scan returned zero Pages. Accept any of the known card controls instead.
      const CARD_CTRL =
        /^(?:switch\s*now|switch\s*back|create\s+post|promote|chuyển\s*ngay|tạo\s*bài\s*viết|đăng\s*bài)$/i;
      const CARD_TEXT =
        /(?:switch\s*now|switch\s*back|create\s+post|promote|chuyển\s*ngay|tạo\s*bài\s*viết)/i;
      const out = new Map();
      const addCard = (card) => {
        const text = clean(card.innerText || card.textContent || '');
        if (!CARD_TEXT.test(text)) return;
        // "Deactivated and deleted Pages" uses an Activate button - never a Page we manage.
        if (/\bactivate\b/i.test(text) && !CARD_TEXT.test(text.replace(/activate/gi, ''))) return;
        const name = getName(card);
        if (!validName(name) || isHardBlockedUI(name)) return;
        const url = getUrl(card);
        const avatar = getAvatar(card);
        if (!url && !avatar) return;
        const key = (url || name).toLowerCase();
        const old = out.get(key) || {};
        out.set(key, {
          ...old,
          id: old.id || null,
          name,
          url: url || old.url || null,
          avatar: avatar || old.avatar || null,
          type: 'page',
          source: 'dom-card',
        });
      };
      const controls = [...document.querySelectorAll('a,button,[role="button"],[role="link"]')].filter(
        visible,
      );
      for (const c of controls) {
        const label = clean(c.innerText || c.textContent || c.getAttribute('aria-label') || '');
        if (!CARD_CTRL.test(label)) continue;
        // Walk up to the smallest ancestor that also carries a Page name + avatar.
        let n = c;
        for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
          const t = clean(n.innerText || n.textContent || '');
          if (!t || t.length > 900) continue;
          if (!CARD_TEXT.test(t)) continue;
          if (!getName(n)) continue;
          addCard(n);
          break;
        }
      }
      // Some builds render the card without a native button; inspect semantic containers.
      for (const n of document.querySelectorAll('div,section,article,[role="article"]')) {
        if (!visible(n)) continue;
        const t = clean(n.innerText || '');
        if (t.length > 900) continue;
        if (CARD_TEXT.test(t)) addCard(n);
      }
      const _vals = [...out.values()];
      return {
        pages: _vals,
        debug: {
          cards: _vals.length,
          withAvatar: _vals.filter((x) => x.avatar).length,
          noAvatar: _vals
            .filter((x) => !x.avatar)
            .map((x) => x.name)
            .slice(0, 20),
        },
        scroll: {
          y: window.scrollY || 0,
          height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
          client: window.innerHeight || 800,
        },
        pass,
      };
    },
  });
  return r?.[0]?.result || { pages: [], scroll: {} };
}

export async function syncManagedFacebookPages(existingExtensionTabId = null) {
  const guard = await enforceAccountBinding().catch(() => null);
  if (guard && guard.accountChanged) return { ...guard, pages: [] };
  let sourceWindowId = null,
    composeTabId = existingExtensionTabId || null,
    worker = null;
  try {
    if (!existingExtensionTabId) {
      const tabs = await chrome.tabs
        .query({ url: `chrome-extension://${chrome.runtime.id}/dashboard.html` })
        .catch(() => []);
      const active = tabs.find((t) => t.active) || tabs[0];
      existingExtensionTabId = active?.id || null;
      composeTabId = existingExtensionTabId || null;
      if (active?.windowId != null) sourceWindowId = active.windowId;
    } else {
      const t = await chrome.tabs.get(existingExtensionTabId).catch(() => null);
      if (t?.windowId != null) sourceWindowId = t.windowId;
    }
    if (sourceWindowId == null)
      try {
        sourceWindowId = (await chrome.windows.getCurrent()).id || null;
      } catch {}
    worker = await createFacebookSyncWorker(
      'https://www.facebook.com/pages/?category=your_pages',
      sourceWindowId,
      existingExtensionTabId,
    );
    const tabId = worker.tabId;
    if (!tabId) throw new Error('Could not open Facebook Pages for sync.');
    await chrome.storage.local
      .set({
        fb_page_sync_progress: {
          phase: 'pages',
          pass: 1,
          index: 0,
          total: 0,
          foundPages: 0,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    await waitForComplete(tabId, 180000);
    await sleep(1400);
    // Facebook renders /pages/?category=your_pages asynchronously (and sometimes
    // after a login/interstitial redirect). Wait until the Page cards really
    // exist before the first scan, otherwise the whole sync returns 0 Pages.
    for (let wait = 0; wait < 30; wait++) {
      const probe = await chrome.scripting
        .executeScript({
          target: { tabId: Number(tabId) },
          world: 'MAIN',
          func: () => {
            const clean = (v) =>
              String(v ?? '')
                .replace(/\s+/g, ' ')
                .trim();
            const CTRL =
              /^(?:switch\s*now|switch\s*back|create\s+post|promote|chuyển\s*ngay|tạo\s*bài\s*viết)$/i;
            const n = [...document.querySelectorAll('div[role="button"],button,a,[role="link"]')].filter(
              (e) => CTRL.test(clean(e.innerText || e.textContent || e.getAttribute('aria-label') || '')),
            ).length;
            return {
              cards: n,
              path: location.pathname + location.search,
              loggedOut: /login|checkpoint/i.test(location.pathname),
            };
          },
        })
        .catch(() => []);
      const st = probe?.[0]?.result || {};
      if (st.loggedOut) throw new Error('Facebook is not logged in (redirected to login/checkpoint).');
      if (Number(st.cards || 0) > 0) break;
      if (wait === 12) {
        // Re-navigate once: Facebook sometimes lands on a stale cached shell.
        await chrome.tabs
          .update(tabId, { url: 'https://www.facebook.com/pages/?category=your_pages' })
          .catch(() => {});
        await waitForComplete(tabId, 60000).catch(() => {});
      }
      await sleep(1000);
    }
    const old = (await chrome.storage.local.get('fb_managed_pages').catch(() => ({}))).fb_managed_pages;
    let all = [],
      stableBottom = 0,
      lastHeight = 0,
      lastCount = 0,
      lastLoadMore = 0;
    for (let pass = 1; pass <= 60; pass++) {
      const r = await scanManagedFacebookPages(tabId, pass);
      all = mergeManagedPages(all, Array.isArray(r?.pages) ? r.pages : []);
      const more = await chrome.scripting
        .executeScript({
          target: { tabId: Number(tabId) },
          world: 'MAIN',
          func: () => {
            const clean = (v) =>
              String(v ?? '')
                .replace(/\s+/g, ' ')
                .trim();
            const vis = (e) => {
              if (!e) return false;
              const r = e.getBoundingClientRect?.();
              if (!r || r.width < 20 || r.height < 15 || r.bottom < 0 || r.top > innerHeight + 160)
                return false;
              const s = getComputedStyle(e);
              return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
            };
            const exact = [...document.querySelectorAll('button,[role="button"],a,[role="link"]')]
              .filter(vis)
              .filter((e) =>
                /^load more$/i.test(
                  clean(
                    e.innerText ||
                      e.textContent ||
                      e.getAttribute('aria-label') ||
                      e.getAttribute('title') ||
                      '',
                  ),
                ),
              )
              .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
            if (!exact) return { clicked: false };
            exact.scrollIntoView({ block: 'center', inline: 'nearest' });
            try {
              exact.click();
            } catch {}
            return { clicked: true };
          },
        })
        .catch(() => []);
      const clicked = !!more?.[0]?.result?.clicked;
      if (clicked) {
        lastLoadMore++;
        await sleep(1000);
      }
      await chrome.storage.local
        .set({
          fb_managed_pages: all,
          lastUpdated: Date.now(),
          fb_page_sync_progress: {
            phase: 'pages',
            pass,
            index: all.length,
            total: 0,
            foundPages: all.length,
            loadMoreClicks: lastLoadMore,
            updatedAt: Date.now(),
          },
        })
        .catch(() => {});
      const state = await chrome.scripting
        .executeScript({
          target: { tabId: Number(tabId) },
          world: 'MAIN',
          func: () => {
            const se = document.scrollingElement || document.documentElement;
            const h = Math.max(
              document.documentElement.scrollHeight,
              document.body?.scrollHeight || 0,
              se?.scrollHeight || 0,
            );
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            const client = innerHeight || 800;
            const remaining = Math.max(0, h - (y + client));
            if (remaining > 120) window.scrollBy(0, Math.max(client * 0.88, 650));
            return { h, y, client, remaining };
          },
        })
        .catch(() => []);
      const st = state?.[0]?.result || { h: 0, y: 0, client: 800, remaining: 9999 };
      await sleep(700);
      const nowCount = all.length,
        nowHeight = Number(st.h || 0),
        remaining = Number(st.remaining || 0);
      if (nowCount === lastCount && nowHeight === lastHeight && remaining <= 120 && !clicked) stableBottom++;
      else stableBottom = 0;
      lastCount = nowCount;
      lastHeight = nowHeight;
      if (stableBottom >= 3) break;
    }
    const cleaned = await chrome.scripting
      .executeScript({
        target: { tabId: Number(tabId) },
        world: 'MAIN',
        func: (items) => {
          const bad =
            /^(?:advertise|advertising|advertisement|create post|promote|create post promote|live video|photo\/?video|reel|dashboard|edit profile|report a problem|notifications?|messages?|more|home|reels|marketplace|discover|followed pages|invites?|meta business suite|settings|privacy|help|log out|facebook|pages?|pages you manage)$/i;
          const clean = (v) =>
            String(v ?? '')
              .replace(/\s+/g, ' ')
              .trim();
          const m = new Map();
          for (const p of Array.isArray(items) ? items : []) {
            const name = clean(p?.name);
            if (
              !name ||
              bad.test(name) ||
              /^chat(?:\s+history)?\b/i.test(name) ||
              /^invitations?\b/i.test(name) ||
              /^invites?\b/i.test(name) ||
              /^messages?\b/i.test(name) ||
              /^notifications?\b/i.test(name) ||
              name.length < 2 ||
              name.length > 160
            )
              continue;
            const key = name.toLowerCase();
            const old = m.get(key) || {};
            m.set(key, {
              ...old,
              ...p,
              name,
              type: 'page',
              avatar: String(p?.avatar || old?.avatar || ''),
              url: p?.url || old?.url || null,
            });
          }
          return [...m.values()];
        },
        args: [all],
      })
      .catch(() => []);
    all = Array.isArray(cleaned?.[0]?.result) ? cleaned[0].result : all;
    all = mergeManagedPages([], all);
    // Convert the exact avatar image already present on each Pages-you-manage card.
    // Do NOT navigate/click/open each Page just to obtain its avatar.
    if (all.length) {
      const withData = [];
      const concurrency = 8;
      for (let i = 0; i < all.length; i += concurrency) {
        const batch = all.slice(i, i + concurrency);
        const resolved = await Promise.all(
          batch.map(async (p) => {
            const src = String(p?.avatar || '').trim();
            if (!src || /^data:image\//i.test(src)) return p;
            // Convert inside the Facebook tab first (signed fbcdn URL is already
            // cached there); only then fall back to the service-worker fetch.
            let data = await avatarUrlToDataUrlViaTab(tabId, src).catch(() => null);
            if (!data) data = await avatarUrlToDataUrl(src).catch(() => null);
            return data
              ? { ...p, avatar: data, avatarSource: 'pages-you-manage-card' }
              : { ...p, avatar: src, avatarSource: 'pages-you-manage-card-url' };
          }),
        );
        withData.push(...resolved);
        await chrome.storage.local
          .set({
            fb_managed_pages: mergeManagedPages([], withData.concat(all.slice(i + concurrency))),
            fb_page_sync_progress: {
              phase: 'avatars',
              index: Math.min(i + resolved.length, all.length),
              total: all.length,
              foundPages: all.length,
              updatedAt: Date.now(),
            },
          })
          .catch(() => {});
      }
      all = mergeManagedPages([], withData);
    }
    all = mergeManagedPages([], all);
    await chrome.storage.local
      .set({
        fb_managed_pages: all,
        lastUpdated: Date.now(),
        source: 'facebook-pages-cards-load-more-scroll',
        fb_page_sync_progress: {
          phase: 'complete',
          pass: 60,
          index: all.length,
          total: all.length,
          foundPages: all.length,
          loadMoreClicks: lastLoadMore,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    let prof = {};
    try {
      const cookieId = await getFacebookCookieUserId();
      const cache =
        (await chrome.storage.local.get('fb_profile_cache').catch(() => ({}))).fb_profile_cache || {};
      const c = cookieId ? cache?.[String(cookieId)] : null;
      if (c && Number(c.v || 0) >= 2)
        prof = { name: String(c.name || ''), avatar: String(c.avatarDataUrl || '') };
    } catch {}
    return { success: true, profile: prof, pages: all, source: 'facebook-pages-cards-load-more-scroll' };
  } catch (e) {
    await chrome.storage.local
      .set({
        fb_page_sync_progress: { phase: 'error', error: e?.message || String(e), updatedAt: Date.now() },
      })
      .catch(() => {});
    const cached = (await chrome.storage.local.get('fb_managed_pages').catch(() => ({}))).fb_managed_pages;
    let prof = {};
    try {
      const pr = await getProfile();
      if (pr?.profile) prof = pr.profile;
    } catch {}
    return {
      success: false,
      error: e?.message || String(e),
      profile: { name: String(prof?.name || ''), avatar: String(prof?.avatar || '') },
      pages: Array.isArray(cached) ? cached : [],
    };
  } finally {
    if (worker?.tabId)
      await closeSyncFacebookTabOnly(
        worker.tabId,
        composeTabId,
        sourceWindowId,
        !!worker.externallyOwned,
      ).catch(() => {});
    if (composeTabId) await chrome.tabs.update(composeTabId, { active: true }).catch(() => {});
  }
}
