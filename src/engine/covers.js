// Facebook automation engine: covers. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { state } from './state';
import { sleep, waitForComplete } from './profile';
import { mirrorGroupsToIdentityCache } from './sync';

export async function extractGroupCoverPhotoHrefFromTab(tabId, groupName) {
  if (!tabId) return '';
  try {
    const r = await chrome.scripting.executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      func: (groupName) => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const abs = (u) => {
          try {
            return new URL(String(u || ''), location.href).href;
          } catch {
            return '';
          }
        };
        const wanted = clean(groupName).toLowerCase();
        const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')];
        const title =
          headings.find((e) => clean(e.textContent).toLowerCase() === wanted) ||
          headings.find((e) => {
            const t = clean(e.textContent).toLowerCase();
            return t && wanted.length > 3 && (t.includes(wanted) || wanted.includes(t));
          });
        const titleRect = title?.getBoundingClientRect?.() || null;
        const anchors = [...document.querySelectorAll('a[href*="/photo/"]')];
        const scored = [];
        for (const a of anchors) {
          const href = abs(a.getAttribute('href') || a.href || '');
          if (!/\/photo\//i.test(href)) continue;
          const r = a.getBoundingClientRect?.();
          if (!r || r.width < 450 || r.height < 140 || r.bottom < 0) continue;
          const imgs = [...a.querySelectorAll('img')];
          const hasWideImg = imgs.some((img) => {
            const ir = img.getBoundingClientRect?.();
            const ratio = Math.max(
              (ir?.width || 0) / Math.max(1, ir?.height || 1),
              (img.naturalWidth || 0) / Math.max(1, img.naturalHeight || 1),
            );
            return (ir?.width || 0) >= 400 && ratio >= 1.25;
          });
          let score = 0;
          if (r.width >= 700) score += 120;
          if (r.height >= 250) score += 80;
          const ratio = r.width / Math.max(1, r.height);
          if (ratio >= 1.35) score += 50;
          if (ratio >= 1.7) score += 70;
          if (r.top >= -50 && r.top < 700) score += 80;
          if (hasWideImg) score += 180;
          if (titleRect) {
            const dy = Math.abs(r.bottom - titleRect.top);
            if (dy < 500) score += 80;
            if (r.left >= titleRect.left - 150 && r.right <= titleRect.right + 150) score += 30;
          }
          const label = clean(a.getAttribute('aria-label') || a.getAttribute('title') || '');
          if (/cover|header|group photo/i.test(label)) score += 300;
          scored.push({
            href: href,
            score: score,
          });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.href || '';
      },
      args: [String(groupName || '')],
    });
    return String(r?.[0]?.result || '').trim();
  } catch {
    return '';
  }
}

export async function extractCoverFromPhotoPage(tabId, photoHref, maxAttempts = 3) {
  if (!tabId || !photoHref) return '';
  try {
    await chrome.tabs.update(tabId, {
      url: photoHref,
      active: false,
    });
    await waitForComplete(tabId, 6e4);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const r = await chrome.scripting.executeScript({
        target: {
          tabId: tabId,
        },
        world: 'MAIN',
        func: async (attempt) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const abs = (u) => {
            try {
              return new URL(String(u || ''), location.href).href;
            } catch {
              return '';
            }
          };
          const bad = (u) =>
            /(?:profile_picture|profile-pic|avatar|profile%5Fpicture|\/picture\?type=)/i.test(
              String(u || ''),
            );
          const candidates = [];
          const add = (u, score) => {
            u = abs(u);
            if (!/^https?:\/\//i.test(u) || bad(u)) return;
            const old = candidates.find((x) => x.url === u);
            if (old) old.score = Math.max(old.score, score);
            else
              candidates.push({
                url: u,
                score: score,
              });
          };
          for (const m of document.querySelectorAll(
            'meta[property="og:image"],meta[property="og:image:url"],meta[name="twitter:image"]',
          ))
            add(m.getAttribute('content'), 900);
          for (const img of document.images) {
            const r = img.getBoundingClientRect?.(),
              nw = img.naturalWidth || 0,
              nh = img.naturalHeight || 0;
            const ratio = Math.max((r?.width || 0) / Math.max(1, r?.height || 1), nw / Math.max(1, nh));
            if (nw >= 600 && nh >= 250 && ratio >= 1.25) {
              let score = 400;
              if (nw >= 1200) score += 120;
              if (ratio >= 1.7) score += 100;
              add(img.currentSrc || img.src, score);
            }
          }
          for (const e of document.querySelectorAll('[style*="background-image"]')) {
            const bg = getComputedStyle(e).backgroundImage || '';
            const m = bg.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
            if (!m) continue;
            const r = e.getBoundingClientRect?.(),
              ratio = (r?.width || 0) / Math.max(1, r?.height || 1);
            if ((r?.width || 0) >= 600 && (r?.height || 0) >= 200 && ratio >= 1.25)
              add(m[1], 350 + (ratio >= 1.7 ? 100 : 0));
          }
          try {
            for (const e of performance.getEntriesByType('resource')) {
              const u = String(e?.name || '');
              if (/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(u) || /scontent|fbcdn|fbsbx/i.test(u))
                add(u, 180);
            }
          } catch {}
          await sleep(attempt === 1 ? 700 : 1100);
          candidates.sort((a, b) => b.score - a.score);
          return candidates[0]?.url || '';
        },
        args: [attempt],
      });
      const u = String(r?.[0]?.result || '').trim();
      if (u) return u;
      await sleep(500);
    }
  } catch {}
  return '';
}

export async function enrichGroupCovers(groups, sharedTabId = null, pass = 1) {
  const input = Array.isArray(groups) ? groups.filter((g) => g?.id && g?.url) : [];
  if (!input.length) return { groups: [], loaded: 0, failed: 0 };
  let tab = null;
  let owned = false;
  const fallbackCover = chrome.runtime.getURL('assets/group-cover-fallback.svg');
  const currentMap = new Map(input.map((g) => [String(g.id), { ...g }]));
  let loaded = 0,
    failed = 0;
  try {
    if (sharedTabId) {
      tab = { id: sharedTabId };
    } else {
      tab = await chrome.tabs.create({ url: 'https://www.facebook.com/groups/', active: true });
      owned = true;
    }
    if (!tab?.id) throw new Error('Could not create the background cover worker.');
    state.activeCoverJob = { cancelled: false, paused: false, tabId: tab.id, index: 0, total: groups.length };
    const total = input.length;
    await chrome.storage.local.set({
      fb_sync_progress: { phase: 'covers', pass, index: 0, total, foundGroups: total, updatedAt: Date.now() },
    });
    for (let index = 0; index < input.length; index++) {
      const group = input[index];
      let cover = '';
      try {
        if (state.activeCoverJob?.paused) {
          state.activeCoverJob.index = index;
          state.activeCoverJob.total = input.length;
          await chrome.storage.local
            .set({
              fb_sync_progress: {
                phase: 'cover-paused',
                pass,
                index,
                total,
                groupId: String(group.id),
                groupName: String(group.name || ''),
                updatedAt: Date.now(),
              },
            })
            .catch(() => {});
          while (state.activeCoverJob?.paused && !state.activeCoverJob?.cancelled) await sleep(250);
          if (state.activeCoverJob?.cancelled) throw new Error('Cover sync stopped by user.');
        }
        if (state.activeCoverJob) state.activeCoverJob.index = index;
        // A cache-busting query on the verification pass forces a fresh page load
        // without changing the stored canonical group URL.
        const targetUrl =
          pass > 1
            ? `${String(group.url).replace(/[?#].*$/, '')}?__fbmg_cover_retry=${Date.now()}_${index}`
            : group.url;
        await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
        await waitForComplete(tab.id, 30000);

        for (let attempt = 1; attempt <= 3 && !cover; attempt++) {
          const r = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async (groupName, attempt) => {
              const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
              const clean = (v) =>
                String(v ?? '')
                  .replace(/\s+/g, ' ')
                  .trim();
              const abs = (u) => {
                try {
                  return new URL(String(u || ''), location.href).href;
                } catch {
                  return '';
                }
              };
              const http = (u) => /^https?:\/\//i.test(String(u || ''));
              const badUrl = (u) =>
                /(?:profile_picture|profile-pic|avatar|profile%5Fpicture|\/picture\?type=)/i.test(
                  String(u || ''),
                );
              const badLabel = (t) =>
                /profile|avatar|member photo|profile picture|group icon/i.test(clean(t));
              const candidates = [];
              const add = (u, score, meta = {}) => {
                u = abs(u);
                if (!http(u) || badUrl(u)) return;
                const old = candidates.find((x) => x.url === u);
                if (old) {
                  old.score = Math.max(old.score, score);
                  return;
                }
                candidates.push({ url: u, score, ...meta });
              };
              const srcset = (s) =>
                String(s || '')
                  .split(',')
                  .map((x) => x.trim().split(/\s+/)[0])
                  .filter(Boolean);
              const imgUrls = (img) =>
                [
                  img.currentSrc,
                  img.src,
                  img.getAttribute('src'),
                  ...srcset(img.srcset || img.getAttribute('srcset')),
                  img.getAttribute('data-src'),
                  img.getAttribute('data-original'),
                  img.getAttribute('data-lazy-src'),
                ].filter(Boolean);
              const bgUrls = (e) => {
                const out = [];
                for (const v of [getComputedStyle(e).backgroundImage, e.style?.backgroundImage]) {
                  const m = String(v || '').match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
                  if (m) out.push(m[1]);
                }
                return out;
              };
              const visible = (e) => {
                if (!e) return false;
                const r = e.getBoundingClientRect?.(),
                  s = getComputedStyle(e);
                return (
                  !!r &&
                  r.width >= 120 &&
                  r.height >= 50 &&
                  s.display !== 'none' &&
                  s.visibility !== 'hidden' &&
                  s.opacity !== '0'
                );
              };
              const inspect = (container) => {
                if (!container) return;
                const cr = container.getBoundingClientRect?.();
                if (!cr || cr.width < 280) return;
                for (const el of container.querySelectorAll('img')) {
                  if (!visible(el)) continue;
                  const r = el.getBoundingClientRect(),
                    nw = el.naturalWidth || 0,
                    nh = el.naturalHeight || 0,
                    ratio = Math.max(r.width / Math.max(1, r.height), nw / Math.max(1, nh));
                  if (r.width < 240 || r.height < 70 || ratio < 1.2) continue;
                  const label = el.alt || el.getAttribute('aria-label') || el.title || '';
                  let score = 90;
                  if (ratio >= 1.45) score += 60;
                  if (ratio >= 1.8) score += 45;
                  if (r.width >= 500) score += 50;
                  if (r.top < 650) score += 35;
                  if (/cover|header|group photo/i.test(label)) score += 180;
                  if (badLabel(label)) score -= 300;
                  for (const u of imgUrls(el)) add(u, score, { w: r.width, h: r.height, ratio });
                }
                for (const el of container.querySelectorAll('div,span,a,[role="img"]')) {
                  if (!visible(el)) continue;
                  const r = el.getBoundingClientRect(),
                    ratio = r.width / Math.max(1, r.height);
                  if (r.width < 300 || r.height < 80 || ratio < 1.2) continue;
                  const label = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '';
                  let score = 75;
                  if (ratio >= 1.5) score += 50;
                  if (ratio >= 1.9) score += 40;
                  if (r.width >= 500) score += 45;
                  if (/cover|header|group photo/i.test(label)) score += 190;
                  if (badLabel(label)) score -= 300;
                  for (const u of bgUrls(el)) add(u, score, { w: r.width, h: r.height, ratio });
                }
              };
              // Highest-confidence source: Facebook commonly wraps the visible
              // group cover in an /photo/?fbid=... anchor. Prefer its own image/
              // background over generic header/feed images.
              for (const a of document.querySelectorAll('a[href*="/photo/"]')) {
                if (!visible(a)) continue;
                const ar = a.getBoundingClientRect();
                if (ar.width < 450 || ar.height < 140 || ar.bottom < 0) continue;
                const ratio = ar.width / Math.max(1, ar.height);
                let score = 600;
                if (ar.width >= 700) score += 120;
                if (ar.height >= 250) score += 80;
                if (ratio >= 1.35) score += 70;
                if (ratio >= 1.7) score += 100;
                if (ar.top >= -50 && ar.top < 700) score += 90;
                const label = clean(a.getAttribute?.('aria-label') || a.getAttribute?.('title') || '');
                if (/cover|header|group photo/i.test(label)) score += 300;
                for (const img of a.querySelectorAll('img')) {
                  const ir = img.getBoundingClientRect?.();
                  const iratio = Math.max(
                    (ir?.width || 0) / Math.max(1, ir?.height || 1),
                    (img.naturalWidth || 0) / Math.max(1, img.naturalHeight || 1),
                  );
                  if ((ir?.width || 0) >= 400 && iratio >= 1.25) score += 250;
                  for (const u of imgUrls(img))
                    add(u, score + 80, {
                      w: ir?.width || 0,
                      h: ir?.height || 0,
                      ratio: iratio,
                      authoritative: true,
                    });
                }
                for (const u of bgUrls(a))
                  add(u, score + 60, { w: ar.width, h: ar.height, ratio, authoritative: true });
                for (const el of a.querySelectorAll('div,span,[role="img"]')) {
                  const er = el.getBoundingClientRect?.();
                  if (!er || er.width < 400 || er.height < 120) continue;
                  for (const u of bgUrls(el))
                    add(u, score + 40, {
                      w: er.width,
                      h: er.height,
                      ratio: er.width / Math.max(1, er.height),
                      authoritative: true,
                    });
                }
              }

              // Metadata is deliberately low priority; rendered header/cover media wins.
              const metaImages = [
                ...document.querySelectorAll(
                  'meta[property="og:image"],meta[name="twitter:image"],meta[property="og:image:url"]',
                ),
              ]
                .map((m) => abs(m.getAttribute('content') || ''))
                .filter(Boolean);
              for (const u of metaImages) add(u, 60, { meta: true });
              for (const e of document.querySelectorAll('link[rel="image_src"][href]')) {
                const u = abs(e.getAttribute('href') || '');
                if (u) add(u, 70, { meta: true });
              }
              for (const u of [...new Set(metaImages)].slice(0, 4)) {
                try {
                  const probe = await new Promise((resolve) => {
                    const im = new Image();
                    const done = () =>
                      resolve({ w: Number(im.naturalWidth || 0), h: Number(im.naturalHeight || 0) });
                    im.onload = done;
                    im.onerror = () => resolve({ w: 0, h: 0 });
                    im.src = u;
                    setTimeout(done, 4500);
                  });
                  const ratio = Number(probe.w || 0) / Math.max(1, Number(probe.h || 0));
                  if (probe.w >= 500 && probe.h >= 180 && ratio >= 1.25)
                    add(u, 1450, { metaWide: true, w: probe.w, h: probe.h, ratio });
                } catch {}
              }
              const wanted = clean(groupName);
              const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')];
              let title =
                headings.find((e) => clean(e.textContent).toLowerCase() === wanted.toLowerCase()) ||
                headings.find((e) => {
                  const t = clean(e.textContent).toLowerCase();
                  return (
                    t &&
                    wanted.length > 3 &&
                    (t.includes(wanted.toLowerCase()) || wanted.toLowerCase().includes(t))
                  );
                });
              if (title) {
                let node = title.parentElement;
                for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
                  const r = node.getBoundingClientRect?.();
                  if (r && r.width >= 450 && r.height >= 100) inspect(node);
                }
              }
              for (const el of document.querySelectorAll(
                '[aria-label],[role="banner"],header,[data-pagelet],[data-visualcompletion]',
              )) {
                const label =
                  clean(el.getAttribute?.('aria-label') || '') +
                  ' ' +
                  clean(el.getAttribute?.('data-pagelet') || '') +
                  ' ' +
                  clean(el.getAttribute?.('data-visualcompletion') || '');
                if (/cover|header|group photo/i.test(label) || el.tagName === 'HEADER') inspect(el);
              }
              for (const el of document.querySelectorAll(
                '[aria-label*="cover" i],[title*="cover" i],[data-testid*="cover" i]',
              ))
                inspect(el.parentElement || el);
              try {
                window.scrollTo(0, 0);
                window.dispatchEvent(new Event('scroll'));
                await sleep(attempt === 1 ? 700 : 1000);
              } catch {}
              if (title) {
                let node = title.parentElement;
                for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) inspect(node);
              }
              try {
                for (const e of performance.getEntriesByType('resource')) {
                  const u = String(e?.name || '');
                  if (/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(u) || /scontent|fbcdn|fbsbx/i.test(u))
                    add(u, 120, { resource: true });
                }
              } catch {}
              candidates.sort((a, b) => b.score - a.score);
              return candidates[0]?.url || '';
            },
            args: [String(group.name || ''), attempt],
          });
          cover = String(r?.[0]?.result || '').trim();
        }
        // AUTHORITATIVE FALLBACK: if the rendered group page did not expose a
        // usable cover URL, follow the exact /photo/?fbid=... link for the
        // header cover and read the photo page's og:image/full-size image.
        if (!cover) {
          const photoHref = await extractGroupCoverPhotoHrefFromTab(tab.id, String(group.name || ''));
          if (photoHref) {
            cover = await extractCoverFromPhotoPage(tab.id, photoHref, 3);
            await chrome.tabs.update(tab.id, { url: group.url, active: false }).catch(() => {});
            await waitForComplete(tab.id, 45000).catch(() => {});
          }
        }
        if (!cover) {
          // Independent fallback: use the second cover extractor if the primary
          // DOM scorer did not expose a usable header image.
          cover = await extractGroupCoverFromTab(tab.id, String(group.name || ''), 3).catch(() => {});
        }
      } catch {}
      const d = await chrome.storage.local.get('fb_groups_list');
      const current = d.fb_groups_list?.groups || [];
      const existing = current.find((g) => String(g?.id) === String(group.id)) || group;
      let finalCover = cover || existing.cover || '';
      if (cover) {
        loaded++;
      } else if (!finalCover) {
        finalCover = fallbackCover;
        failed++;
      }
      currentMap.set(String(group.id), { ...existing, ...group, cover: finalCover });
      const updated = current.map((g) =>
        String(g?.id) === String(group.id) ? { ...g, ...group, cover: finalCover } : g,
      );
      await chrome.storage.local.set({
        fb_groups_list: {
          ...(d.fb_groups_list || {}),
          groups: updated,
          lastUpdated: Date.now(),
          source: 'facebook-groups-dom',
          coverPass: pass,
        },
      });
      await mirrorGroupsToIdentityCache(updated).catch(() => {});
      await chrome.storage.local.set({
        fb_sync_progress: {
          phase: 'covers',
          pass,
          index: index + 1,
          total,
          groupId: String(group.id),
          groupName: String(group.name || ''),
          coverLoaded: !!cover,
          fallbackUsed: !cover && !existing.cover,
          updatedAt: Date.now(),
        },
      });
    }
  } finally {
    if (owned && tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
    }
  }
  return { groups: [...currentMap.values()], loaded, failed };
}

export async function extractGroupCoverFromTab(tabId, groupName, maxAttempts = 3) {
  if (!tabId) return '';
  let cover = '';
  for (let attempt = 1; attempt <= maxAttempts && !cover; attempt++) {
    try {
      const r = await chrome.scripting.executeScript({
        target: {
          tabId: tabId,
        },
        world: 'MAIN',
        func: async (groupName, attempt) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const clean = (v) =>
            String(v ?? '')
              .replace(/\s+/g, ' ')
              .trim();
          const abs = (u) => {
            try {
              return new URL(String(u || ''), location.href).href;
            } catch {
              return '';
            }
          };
          const http = (u) => /^https?:\/\//i.test(String(u || ''));
          const badUrl = (u) =>
            /(?:profile_picture|profile-pic|avatar|profile%5Fpicture|\/picture\?type=)/i.test(
              String(u || ''),
            );
          const badLabel = (t) => /profile|avatar|member photo|profile picture|group icon/i.test(clean(t));
          const candidates = [];
          const add = (u, score, meta = {}) => {
            u = abs(u);
            if (!http(u) || badUrl(u)) return;
            const old = candidates.find((x) => x.url === u);
            if (old) {
              old.score = Math.max(old.score, score);
              return;
            }
            candidates.push({
              url: u,
              score: score,
              ...meta,
            });
          };
          const srcset = (s) =>
            String(s || '')
              .split(',')
              .map((x) => x.trim().split(/\s+/)[0])
              .filter(Boolean);
          const imgUrls = (img) =>
            [
              img.currentSrc,
              img.src,
              img.getAttribute('src'),
              ...srcset(img.srcset || img.getAttribute('srcset')),
              img.getAttribute('data-src'),
              img.getAttribute('data-original'),
              img.getAttribute('data-lazy-src'),
            ].filter(Boolean);
          const bgUrls = (e) => {
            const out = [];
            for (const v of [getComputedStyle(e).backgroundImage, e.style?.backgroundImage]) {
              const m = String(v || '').match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
              if (m) out.push(m[1]);
            }
            return out;
          };
          const visible = (e) => {
            if (!e) return false;
            const r = e.getBoundingClientRect?.(),
              s = getComputedStyle(e);
            return (
              !!r &&
              r.width >= 120 &&
              r.height >= 50 &&
              s.display !== 'none' &&
              s.visibility !== 'hidden' &&
              s.opacity !== '0'
            );
          };
          const inspect = (container) => {
            if (!container) return;
            const cr = container.getBoundingClientRect?.();
            if (!cr || cr.width < 280) return;
            for (const el of container.querySelectorAll('img')) {
              if (!visible(el)) continue;
              const r = el.getBoundingClientRect(),
                nw = el.naturalWidth || 0,
                nh = el.naturalHeight || 0,
                ratio = Math.max(r.width / Math.max(1, r.height), nw / Math.max(1, nh));
              if (r.width < 240 || r.height < 70 || ratio < 1.2) continue;
              const label = el.alt || el.getAttribute('aria-label') || el.title || '';
              let score = 90;
              if (ratio >= 1.45) score += 60;
              if (ratio >= 1.8) score += 45;
              if (r.width >= 500) score += 50;
              if (r.top < 650) score += 35;
              if (/cover|header|group photo/i.test(label)) score += 180;
              if (badLabel(label)) score -= 300;
              for (const u of imgUrls(el))
                add(u, score, {
                  w: r.width,
                  h: r.height,
                  ratio: ratio,
                });
            }
            for (const el of container.querySelectorAll('div,span,a,[role="img"]')) {
              if (!visible(el)) continue;
              const r = el.getBoundingClientRect(),
                ratio = r.width / Math.max(1, r.height);
              if (r.width < 300 || r.height < 80 || ratio < 1.2) continue;
              const label = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '';
              let score = 75;
              if (ratio >= 1.5) score += 50;
              if (ratio >= 1.9) score += 40;
              if (r.width >= 500) score += 45;
              if (/cover|header|group photo/i.test(label)) score += 190;
              if (badLabel(label)) score -= 300;
              for (const u of bgUrls(el))
                add(u, score, {
                  w: r.width,
                  h: r.height,
                  ratio: ratio,
                });
            }
          };
          for (const m of document.querySelectorAll(
            'meta[property="og:image"],meta[name="twitter:image"],meta[property="og:image:url"]',
          ))
            add(m.getAttribute('content'), 40, {
              meta: true,
            });
          const wanted = clean(groupName);
          const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')];
          let title =
            headings.find((e) => clean(e.textContent).toLowerCase() === wanted.toLowerCase()) ||
            headings.find((e) => {
              const t = clean(e.textContent).toLowerCase();
              return (
                t &&
                wanted.length > 3 &&
                (t.includes(wanted.toLowerCase()) || wanted.toLowerCase().includes(t))
              );
            });
          if (title) {
            let node = title.parentElement;
            for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
              const r = node.getBoundingClientRect?.();
              if (r && r.width >= 450 && r.height >= 100) inspect(node);
            }
          }
          for (const el of document.querySelectorAll(
            '[aria-label],[role="banner"],header,[data-pagelet],[data-visualcompletion]',
          )) {
            const label =
              clean(el.getAttribute?.('aria-label') || '') +
              ' ' +
              clean(el.getAttribute?.('data-pagelet') || '') +
              ' ' +
              clean(el.getAttribute?.('data-visualcompletion') || '');
            if (/cover|header|group photo/i.test(label) || el.tagName === 'HEADER') inspect(el);
          }
          for (const el of document.querySelectorAll(
            '[aria-label*="cover" i],[title*="cover" i],[data-testid*="cover" i]',
          ))
            inspect(el.parentElement || el);
          try {
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event('scroll'));
            await sleep(attempt === 1 ? 700 : 1e3);
          } catch {}
          if (title) {
            let node = title.parentElement;
            for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) inspect(node);
          }
          candidates.sort((a, b) => b.score - a.score);
          return candidates[0]?.url || '';
        },
        args: [String(groupName || ''), attempt],
      });
      cover = String(r?.[0]?.result || '').trim();
    } catch {}
  }
  return cover;
}

export async function extractAuthoritativeGroupNamesFromActiveTab(tabId) {
  if (!tabId) return {};
  try {
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
        const bad =
          /^(?:groups?|see all|your groups|discover|your feed|groups you manage|groups you.?ve joined|create new group|facebook groups|view group|see group|open group|group|join|joined|leave|members?|posts?|private|public|public group|посмотреть группу|просмотреть группу|открыть группу|показать группу|группа|все группы,? к которым вы присоединились(?:\s*\(\d+\))?|عرض المجموعة|مشاهدة المجموعة|رؤية المجموعة|المجموعة|ver grupo|ver el grupo|voir le groupe|groupe|gruppe ansehen|gruppe|grubu görüntüle|grubu gör|xem nhóm|nhóm)$/iu;
        const noise =
          /(?:\b(?:see all|view group|open group|join|joined|leave)\b|\b\d+\s+(?:members?|posts?|new posts?)\b|\b(?:last visited|last active|visited)\b)/iu;
        const excluded = new Set([
          'feed',
          'discover',
          'joins',
          'notifications',
          'settings',
          'create',
          'search',
          'membership_questions',
          'pending_posts',
          'member-requests',
          'pending',
          'reported',
          'files',
          'media',
          'events',
          'announcements',
          'members',
          'about',
          'discussion',
          'buy_sell_discussion',
        ]);
        const groupId = (href) => {
          try {
            const u = new URL(href, location.href),
              p = u.pathname.split('/').filter(Boolean);
            if (p.length < 2 || p[0].toLowerCase() !== 'groups') return null;
            const id = p[1];
            if (!id || excluded.has(id.toLowerCase()) || !/^[A-Za-z0-9._-]+$/.test(id)) return null;
            return id;
          } catch {
            return null;
          }
        };
        const valid = (v) => {
          const s = clean(v);
          return (
            s.length >= 2 &&
            s.length <= 180 &&
            !bad.test(s) &&
            !noise.test(s) &&
            !/^https?:\/\//i.test(s) &&
            !/^[\d.,]+$/.test(s)
          );
        };
        const out = new Map();
        const score = (s, type, depth) => {
          let n = 0;
          if (type === 'same-href') n += 500;
          else if (type === 'heading') n += 470;
          else if (type === 'img-alt') n += 430;
          else if (type === 'aria') n += 410;
          else if (type === 'title') n += 400;
          else if (type === 'card') n += 300;
          else if (type === 'line') n += 220;
          else n += 100;
          if (s.length <= 90) n += 20;
          if (depth === 0) n += 20;
          if (s.length > 140) n -= 20;
          return n;
        };
        const add = (id, value, type, depth = 0) => {
          const s = clean(value);
          if (!valid(s)) return;
          const n = score(s, type, depth);
          const old = out.get(id);
          if (!old || n > old.score)
            out.set(id, {
              name: s,
              score: n,
              source: type,
            });
        };
        const anchors = [...document.querySelectorAll('a[href*="/groups/"]')];
        for (const a of anchors) {
          const id = groupId(a.getAttribute('href') || '');
          if (!id) continue;
          const direct = clean(a.innerText || a.textContent);
          if (valid(direct)) add(id, direct, 'anchor');
          const img = a.querySelector('img');
          if (img) {
            add(id, img.alt, 'img-alt');
            add(id, img.title, 'img-alt');
          }
          add(id, a.getAttribute('aria-label'), 'aria');
          add(id, a.getAttribute('title'), 'title');
          let node = a;
          for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
            const role = (node.getAttribute?.('role') || '').toLowerCase();
            const isCard =
              role === 'article' ||
              role === 'listitem' ||
              depth >= 2 ||
              /group|list|card/i.test(node.getAttribute?.('data-pagelet') || '');
            if (!isCard) continue;
            for (const h of node.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
              add(id, h.innerText || h.textContent, 'heading', depth);
            for (const x of node.querySelectorAll('a[href*="/groups/"]')) {
              const xid = groupId(x.getAttribute('href') || '');
              if (xid !== id) continue;
              add(id, x.innerText || x.textContent, 'same-href', depth);
              add(id, x.getAttribute('aria-label'), 'same-href', depth);
              add(id, x.getAttribute('title'), 'same-href', depth);
            }
            const lines = clean(node.innerText || node.textContent)
              .split(/\n+/)
              .map(clean)
              .filter(Boolean);
            for (const line of lines) {
              if (line === direct) continue;
              if (valid(line)) add(id, line, 'line', depth);
            }
            if (out.get(id)?.score >= 500) break;
          }
        }
        return Object.fromEntries(out);
      },
    });
    return r?.[0]?.result || {};
  } catch {
    return {};
  }
}

export async function applyAuthoritativeActiveTabNames(tabId, groups) {
  const map = await extractAuthoritativeGroupNamesFromActiveTab(tabId);
  if (!map || !Object.keys(map).length) return groups;
  const resolved = groups.map((g) => {
    const hit = map[String(g.id)];
    if (!hit?.name) return g;
    return {
      ...g,
      name: hit.name,
      nameSource: 'active-facebook-dom',
    };
  });
  return resolved;
}
