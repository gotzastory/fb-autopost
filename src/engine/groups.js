// Facebook automation engine: groups. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { state } from './state';
import { sleep, waitForComplete } from './profile';

export async function prepareJoinedPage(tabId) {
  await waitForComplete(tabId, 45e3);
  await chrome.scripting
    .executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      func: async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const JOINED_URL = 'https://www.facebook.com/groups/joins/';
        await sleep(2200);
        const joined = /^groups\s*(?:you.?ve|you have)\s*joined$/i;
        const isJoinedPage = /\/groups\/joins(?:\/|$)/i.test(location.pathname);
        if (!isJoinedPage) {
          const candidates = [...document.querySelectorAll('a,button,[role="button"]')];
          const seeAll = candidates.find((el) => {
            const label = clean(el.innerText || el.textContent || el.getAttribute('aria-label'));
            if (!/^see all$/i.test(label)) return false;
            let n = el;
            for (let i = 0; n && i < 10; i++, n = n.parentElement) {
              if (joined.test(clean(n.innerText || n.textContent))) return true;
            }
            return false;
          });
          if (seeAll) {
            try {
              seeAll.scrollIntoView({
                block: 'center',
              });
              seeAll.click();
            } catch {}
            for (let i = 0; i < 25; i++) {
              await sleep(300);
              if (/\/groups\/joins(?:\/|$)/i.test(location.pathname)) break;
            }
          }
        }
        if (!/\/groups\/joins(?:\/|$)/i.test(location.pathname)) {
          try {
            location.href = JOINED_URL;
            return;
          } catch {}
        }
        await sleep(1800);
        for (let i = 0; i < 8; i++) {
          const links = document.querySelectorAll('a[href*="/groups/"]');
          if (links.length >= 8) break;
          await sleep(500);
        }
      },
    })
    .catch(() => {});
  await waitForComplete(tabId, 45e3);
  await sleep(1600);
}

export async function scanJoinedGroups(tabId, pass = 1) {
  const r = await chrome.scripting.executeScript({
    target: {
      tabId: tabId,
    },
    world: 'MAIN',
    func: async (pass) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const clean = (v) =>
        String(v ?? '')
          .replace(/\s+/g, ' ')
          .trim();
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
      const generic =
        /^(?:groups?|see all|your groups|discover|your feed|groups you manage|groups you.?ve joined|create new group|facebook groups|view group|see group|open group|group|join|joined|leave|members?|posts?|private|public|public group|all groups you.?ve joined(?:\s*\(\d+\))?|you|your content|your groups|facebook user|посмотреть группу|просмотреть группу|открыть группу|показать группу|группа|все группы,? к которым вы присоединились(?:\s*\(\d+\))?|عرض المجموعة|مشاهدة المجموعة|رؤية المجموعة|المجموعة|ver grupo|ver el grupo|voir le groupe|groupe|gruppe ansehen|gruppe|grubu görüntüle|grubu gör|xem nhóm|nhóm)$/iu;
      const absolute = (u) => {
        try {
          const x = new URL(u, location.href);
          return x.href.split('?')[0].split('#')[0];
        } catch {
          return null;
        }
      };
      const groupKey = (href) => {
        try {
          const u = new URL(href, location.href),
            p = u.pathname.split('/').filter(Boolean);
          if (p.length < 2 || p[0].toLowerCase() !== 'groups') return null;
          const key = p[1];
          if (!key || excluded.has(key.toLowerCase()) || !/^[A-Za-z0-9._-]+$/.test(key)) return null;
          return key;
        } catch {
          return null;
        }
      };
      const validName = (v) => {
        const s = clean(v);
        return s.length >= 2 && s.length <= 180 && !generic.test(s) && !/^https?:\/\//i.test(s);
      };
      const out = new Map();
      const addId = (a) => {
        const id = groupKey(a?.getAttribute('href') || '');
        if (!id) return false;
        const url = absolute(a.getAttribute('href')) || `https://www.facebook.com/groups/${id}/`;
        let rec = out.get(id);
        if (!rec)
          out.set(id, {
            id: id,
            groupId: id,
            url: url,
            name: '',
            nameSource: '',
          });
        else if (!rec.url) rec.url = url;
        return true;
      };
      const links = () => [...document.querySelectorAll('a[href*="/groups/"]')];
      const collectIds = () => {
        let n = 0;
        for (const a of links()) if (addId(a)) n++;
        return n;
      };
      const candidate = (v, type, score = 0, currentId = '') => {
        const s = clean(v);
        if (!validName(s)) return null;
        if (/^\d+$/.test(s) && String(s) !== String(currentId)) {
        } else if (/^\d+$/.test(s)) return null;
        let n = score;
        if (type === 'heading') n += 1e3;
        else if (type === 'same-href') n += 900;
        else if (type === 'img-alt') n += 850;
        else if (type === 'aria') n += 800;
        else if (type === 'title') n += 780;
        else if (type === 'direct') n += 700;
        else if (type === 'line') n += 500;
        if (s.length <= 100) n += 30;
        if (s.length > 150) n -= 50;
        return {
          name: s,
          score: n,
          source: type,
        };
      };
      const getNameForLink = (a) => {
        const id = groupKey(a.getAttribute('href') || '');
        if (!id) return null;
        let best = null;
        const consider = (v, type, score = 0) => {
          const c = candidate(v, type, score, id);
          if (c && (!best || c.score > best.score)) best = c;
        };
        consider(a.getAttribute('aria-label'), 'aria');
        consider(a.getAttribute('title'), 'title');
        const img = a.querySelector('img');
        if (img) {
          consider(img.getAttribute('alt'), 'img-alt');
          consider(img.getAttribute('title'), 'img-alt');
        }
        let node = a;
        for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
          const role = (node.getAttribute?.('role') || '').toLowerCase();
          const cls = String(node.className || '');
          const rect = node.getBoundingClientRect?.();
          const groupLinks = [...(node.querySelectorAll?.('a[href*="/groups/"]') || [])].filter((x) =>
            groupKey(x.getAttribute('href') || ''),
          );
          const sameCount = groupLinks.filter((x) => groupKey(x.getAttribute('href') || '') === id).length;
          const text = clean(node.innerText || node.textContent);
          const smallCard =
            rect &&
            rect.height >= 35 &&
            rect.height <= 420 &&
            rect.width >= 180 &&
            text.length <= 700 &&
            groupLinks.length <= 4;
          const semantic = role === 'article' || role === 'listitem' || /(card|item|group)/i.test(cls);
          if (!smallCard && !semantic) continue;
          for (const h of node.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
            consider(h.innerText || h.textContent, 'heading', depth === 0 ? 120 : 0);
          for (const x of groupLinks) {
            if (groupKey(x.getAttribute('href') || '') !== id) continue;
            consider(x.innerText || x.textContent, 'same-href', sameCount === 1 ? 80 : 0);
            consider(x.getAttribute('aria-label'), 'same-href');
            consider(x.getAttribute('title'), 'same-href');
          }
          for (const el of node.querySelectorAll('[dir="auto"]')) {
            const t = clean(el.innerText || el.textContent);
            if (t && t.length <= 180) consider(t, 'line', depth === 0 ? 50 : 0);
          }
          if (role === 'article' || role === 'listitem') break;
        }
        return best;
      };
      const assignNames = () => {
        for (const a of links()) {
          const id = groupKey(a.getAttribute('href') || '');
          if (!id) continue;
          const c = getNameForLink(a);
          if (!c?.name) continue;
          const rec = out.get(id);
          if (!rec) continue;
          if (!validName(c.name)) continue;
          if (!rec.name || c.score > Number(rec.nameScore || -1)) {
            rec.name = c.name;
            rec.nameScore = c.score;
            rec.nameSource = 'joined-list-card';
          }
        }
      };
      collectIds();
      assignNames();
      const scrollNodes = [];
      for (const a of links()) {
        let n = a.parentElement;
        for (let d = 0; n && d < 9; d++, n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (n.scrollHeight > n.clientHeight + 120 && /(auto|scroll)/.test(`${cs.overflowY} ${cs.overflow}`))
            scrollNodes.push(n);
        }
      }
      const counts = new Map();
      for (const n of scrollNodes) counts.set(n, (counts.get(n) || 0) + 1);
      let root =
        [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].scrollHeight - a[0].scrollHeight)[0]?.[0] ||
        null;
      const metrics = () =>
        root
          ? {
              top: root.scrollTop,
              height: root.scrollHeight,
              client: root.clientHeight,
            }
          : {
              top: window.scrollY || document.documentElement.scrollTop || 0,
              height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
              client: window.innerHeight,
            };
      const jump = (amount) => {
        if (root) root.scrollTop += amount;
        else window.scrollBy(0, amount);
      };
      const notify = () => {
        try {
          root?.dispatchEvent(
            new Event('scroll', {
              bubbles: true,
            }),
          );
          window.dispatchEvent(new Event('scroll'));
          document.dispatchEvent(new Event('scroll'));
        } catch {}
      };
      const expectedText = clean(document.body?.innerText || '');
      const expectedMatches = [
        expectedText.match(
          /(?:all\s+groups?\s+you(?:'|’)?ve\s+joined|groups?\s+you(?:'|’)?ve\s+joined)[^\d]{0,40}(\d{1,6})/iu,
        ),
        expectedText.match(/(?:все\s+группы[^\n]{0,100}(?:присоединились|joined))[^\d]{0,20}(\d{1,6})/iu),
      ].filter(Boolean);
      const expected = expectedMatches.map((m) => Number(m[1])).find((n) => n > 0) || 0;
      if (root) root.scrollTop = 0;
      else window.scrollTo(0, 0);
      notify();
      await sleep(500);
      collectIds();
      assignNames();
      let stable = 0,
        lastIds = out.size,
        lastHeight = metrics().height,
        lastTop = -1;
      const maxIterations = 1800;
      for (let i = 0; i < maxIterations; i++) {
        const m = metrics();
        const max = Math.max(0, m.height - m.client);
        const remaining = Math.max(0, max - m.top);
        if (remaining <= 4) {
          collectIds();
          assignNames();
          await sleep(500);
          const m2 = metrics();
          collectIds();
          assignNames();
          if (out.size === lastIds && Math.abs(m2.height - lastHeight) < 8) stable++;
          else stable = 0;
          lastIds = out.size;
          lastHeight = m2.height;
          if (stable >= 5) break;
          await sleep(350);
          continue;
        }
        const step = Math.max(650, Math.min(1500, Math.floor(m.client * 0.95)));
        jump(Math.min(step, remaining));
        notify();
        await sleep(pass === 1 ? 120 : 90);
        collectIds();
        assignNames();
        const after = metrics();
        const changed =
          out.size !== lastIds ||
          Math.abs(after.height - lastHeight) >= 8 ||
          Math.abs(after.top - lastTop) > 2;
        if (changed) stable = 0;
        else stable++;
        lastIds = out.size;
        lastHeight = after.height;
        lastTop = after.top;
        if (i % 12 === 0) await sleep(80);
      }
      collectIds();
      assignNames();
      return [...out.values()].map((x) => ({
        id: x.id,
        groupId: x.groupId,
        url: x.url,
        name: x.name || '',
        nameSource: x.nameSource || '',
      }));
    },
    args: [pass],
  });
  return r?.[0]?.result || [];
}

export async function scanManagedGroupsBatched(tabId, pass = 1, onBatch = async () => {}, resume = false) {
  const state = {
    pass: pass,
    groups: new Map(),
    iterations: 0,
    stableBottom: 0,
  };
  const merge = (list) => {
    for (const g of list || []) {
      const id = String(g?.id || '').trim();
      if (!id) continue;
      const prev = state.groups.get(id);
      if (!prev || (!prev.name && g.name) || Number(g.nameScore || 0) > Number(prev.nameScore || 0))
        state.groups.set(id, g);
    }
  };
  let firstChunk = !resume,
    keepGoing = true;
  while (keepGoing) {
    if (state.activeSyncJob?.paused) {
      keepGoing = false;
      return {
        groups: [...state.groups.values()],
        expected: state.expected,
        iterations: state.iterations,
        stableBottom: state.stableBottom,
        paused: true,
        stopped: false,
      };
    }
    if (state.activeSyncJob?.cancelled) {
      keepGoing = false;
      return {
        groups: [...state.groups.values()],
        expected: state.expected,
        iterations: state.iterations,
        stableBottom: state.stableBottom,
        paused: false,
        stopped: true,
      };
    }
    const result = await chrome.scripting.executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      args: [pass, firstChunk],
      func: async (pass, isFirst) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const excluded = new Set([
          'feed',
          'discover',
          'joins',
          'notifications',
          'settings',
          'create',
          'search',
          'members',
          'about',
          'media',
          'events',
          'discussion',
          'pending_posts',
          'member-requests',
          'pending',
          'reported',
          'files',
        ]);
        const generic =
          /^(?:groups?|see all|view all|your groups|discover|your feed|groups you manage|groups you.?ve joined|create new group|facebook groups|view group|see group|open group|group|join|joined|leave|members?|posts?|private|public|public group|you|your content|your groups|facebook user)$/iu;
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
        const validName = (v) => {
          const s = clean(v);
          return s.length >= 2 && s.length <= 180 && !generic.test(s) && !/^(?:https?:\/\/)/i.test(s);
        };
        const stateKey = '__FBMP_MANAGED_SCAN_V3__';
        let saved = window[stateKey];
        if (isFirst || !saved || Number(saved.pass) !== Number(pass)) {
          saved = {
            pass: Number(pass),
            groups: {},
            iterations: 0,
            stable: 0,
            lastSize: 0,
            lastHeight: 0,
            done: false,
          };
          window[stateKey] = saved;
          if (String(window.__FBMP_SYNC_CONTROL__ || 'RUN').toUpperCase() !== 'PAUSE')
            window.__FBMP_SYNC_CONTROL__ = 'RUN';
        }
        const control = () => String(window.__FBMP_SYNC_CONTROL__ || 'RUN').toUpperCase();
        const main = document.querySelector('main,[role="main"]') || document.body;
        const headingText = (e) =>
          clean(e?.innerText || e?.textContent || e?.getAttribute?.('aria-label') || '');
        const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],a,span,div')];
        const managedHeading =
          headings.find((e) => /^groups\s+you\s+manage$/i.test(headingText(e))) ||
          headings.find((e) => /^(groups\s+you\s+manage)$/i.test(headingText(e)));
        const joinedHeading =
          headings.find((e) => /^groups\s+you(?:'|’)?ve\s+joined$/i.test(headingText(e))) ||
          headings.find((e) => /^groups\s+you\s+have\s+joined$/i.test(headingText(e)));
        const isManagedAnchor = (a) => {
          if (!managedHeading) return true;
          const before = !!(managedHeading.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (!before) return false;
          if (!joinedHeading) return true;
          const after = !!(a.compareDocumentPosition(joinedHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
          return after;
        };
        const findRoot = () => {
          const vw = window.innerWidth || document.documentElement.clientWidth || 0,
            c = [];
          const add = (n) => {
            if (!n) return;
            const cs = getComputedStyle(n),
              r = n.getBoundingClientRect?.();
            if (
              !r ||
              r.width < 280 ||
              r.height < 180 ||
              n.scrollHeight <= n.clientHeight + 120 ||
              !/(auto|scroll)/.test(`${cs.overflowY} ${cs.overflow}`)
            )
              return;
            const links = [...n.querySelectorAll('a[href*="/groups/"]')].filter(isManagedAnchor);
            const ids = new Set(links.map((a) => groupId(a.getAttribute('href') || '')).filter(Boolean));
            if (!ids.size) return;
            c.push({
              n: n,
              score:
                ids.size * 800 +
                Math.min(1800, n.clientHeight) +
                Math.min(3e3, Math.floor(n.scrollHeight / 220)) +
                (r.left < vw * 0.7 ? 120 : 0),
              ids: ids.size,
            });
          };
          let n = managedHeading || main;
          for (let i = 0; n && i < 10; i++, n = n.parentElement) add(n);
          for (const el of main.querySelectorAll('div,section,ul,aside,nav')) add(el);
          if (managedHeading) {
            let n = managedHeading.parentElement;
            for (let i = 0; n && i < 8; i++, n = n.parentElement) {
              const links = [...n.querySelectorAll('a[href*="/groups/"]')].filter(isManagedAnchor);
              const ids = new Set(links.map((a) => groupId(a.getAttribute('href') || '')).filter(Boolean));
              if (ids.size)
                c.push({
                  n: n,
                  score: ids.size * 1100 + Math.min(1800, n.clientHeight || 0),
                  ids: ids.size,
                });
            }
          }
          const se = document.scrollingElement || document.documentElement;
          if (se && se.scrollHeight > se.clientHeight + 120) {
            const ids = new Set(
              [...document.querySelectorAll('main a[href*="/groups/"],[role="main"] a[href*="/groups/"]')]
                .filter(isManagedAnchor)
                .map((a) => groupId(a.getAttribute('href') || ''))
                .filter(Boolean),
            );
            if (ids.size)
              c.push({
                n: null,
                score: ids.size * 300,
                ids: ids.size,
              });
          }
          c.sort((a, b) => b.score - a.score || b.ids - a.ids);
          return c[0]?.n || null;
        };
        const root = findRoot();
        const scope = root || main;
        const isPendingRequest = (a, card) => {
          const tx = clean(
            [
              card?.innerText || card?.textContent || '',
              a.parentElement?.innerText || a.parentElement?.textContent || '',
            ].join(' | '),
          );
          return /\bpending\s+group\s+requests?\b|\bmembership\s+request\s+pending\b|\brequest\s+to\s+join\b|\bcancel\s+request\b/i.test(
            tx,
          );
        };
        const map = new Map(Object.entries(saved.groups || {}).map(([id, g]) => [id, g]));
        const getCard = (a, id) => {
          let n = a.parentElement;
          for (let d = 0; n && d < 9; d++, n = n.parentElement) {
            const ids = new Set(
              [...n.querySelectorAll('a[href*="/groups/"]')]
                .map((x) => groupId(x.getAttribute('href') || ''))
                .filter(Boolean),
            );
            const r = n.getBoundingClientRect?.();
            if (ids.size === 1 && ids.has(id) && r && r.width >= 240 && r.height >= 42 && r.height <= 600)
              return n;
            if (ids.size > 1) break;
          }
          return null;
        };
        const collect = () => {
          for (const a of scope.querySelectorAll('a[href*="/groups/"]')) {
            if (!isManagedAnchor(a)) continue;
            const id = groupId(a.getAttribute('href') || '');
            if (!id) continue;
            const card = getCard(a, id);
            if (isPendingRequest(a, card)) continue;
            let name = '';
            let score = 0;
            const pick = (v, s) => {
              const x = clean(v);
              if (validName(x) && s > score) {
                name = x;
                score = s;
              }
            };
            pick(a.getAttribute('aria-label'), 900);
            pick(a.getAttribute('title'), 880);
            pick(a.innerText || a.textContent, 850);
            if (card) {
              for (const h of card.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
                pick(h.innerText || h.textContent, 1200);
              for (const img of card.querySelectorAll('img[alt],img[title]')) {
                pick(img.getAttribute('alt'), 1100);
                pick(img.getAttribute('title'), 1080);
              }
            }
            const old = map.get(id);
            const rec = {
              id: id,
              groupId: id,
              url: `https://www.facebook.com/groups/${id}/`,
              name: name,
              nameScore: score,
              nameSource: 'managed-groups-list',
              managed: true,
              groupSource: 'managed',
            };
            if (!old || (!old.name && name) || (name && score > Number(old.nameScore || 0))) map.set(id, rec);
          }
        };
        const metrics = () =>
          root
            ? {
                top: root.scrollTop,
                height: root.scrollHeight,
                client: root.clientHeight,
              }
            : {
                top: window.scrollY || document.documentElement.scrollTop || 0,
                height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
                client: window.innerHeight || document.documentElement.clientHeight || 0,
              };
        const persist = (done, paused, stopped, expected) => {
          const obj = {
            pass: Number(pass),
            groups: Object.fromEntries(map),
            iterations: Number(saved.iterations || 0),
            stable: Number(saved.stable || 0),
            lastSize: map.size,
            lastHeight: Number(saved.lastHeight || metrics().height),
            done: !!done,
          };
          window[stateKey] = obj;
          return {
            groups: [...map.values()],
            expected: Number(expected || 0),
            iterations: obj.iterations,
            stableBottom: obj.stable,
            atBottom: !!done,
            paused: !!paused,
            stopped: !!stopped,
            scrollTop: root ? root.scrollTop : window.scrollY || document.documentElement.scrollTop || 0,
          };
        };
        if (saved.done) return persist(true, false, false, 0);
        if (isFirst) {
          if (root) root.scrollTop = 0;
          else window.scrollTo(0, 0);
          try {
            root?.dispatchEvent(
              new Event('scroll', {
                bubbles: true,
              }),
            );
            window.dispatchEvent(new Event('scroll'));
          } catch {}
          await sleep(350);
        } else {
          collect();
          await sleep(150);
        }
        let stable = Number(saved.stable || 0),
          lastSize = Number(saved.lastSize || map.size),
          lastHeight = Number(saved.lastHeight || metrics().height),
          done = false;
        for (let i = 0; i < 3; i++) {
          if (control() === 'STOP') {
            saved = {
              ...saved,
              groups: Object.fromEntries(map),
              stable: stable,
              lastSize: map.size,
              lastHeight: lastHeight,
              done: false,
            };
            return persist(false, false, true, 0);
          }
          if (control() === 'PAUSE') {
            saved = {
              ...saved,
              groups: Object.fromEntries(map),
              stable: stable,
              lastSize: map.size,
              lastHeight: lastHeight,
              done: false,
            };
            return persist(false, true, false, 0);
          }
          collect();
          const m = metrics();
          const max = Math.max(0, m.height - m.client),
            remaining = Math.max(0, max - m.top);
          if (remaining <= 6) {
            await sleep(map.size > lastSize ? 180 : 220);
            collect();
            const m2 = metrics();
            if (map.size === lastSize && Math.abs(m2.height - lastHeight) < 10) stable++;
            else stable = 0;
            lastSize = map.size;
            lastHeight = m2.height;
            if (stable >= 3) {
              done = true;
              break;
            }
            await sleep(90);
            continue;
          }
          const step =
            Number(pass) >= 3
              ? Math.max(850, Math.min(2200, Math.floor(m.client * 1.15)))
              : Math.max(2200, Math.min(7200, Math.floor(m.client * 4)));
          const next = Math.min(max, m.top + Math.min(step, remaining));
          if (root) root.scrollTop = next;
          else window.scrollTo(0, next);
          try {
            root?.dispatchEvent(
              new Event('scroll', {
                bubbles: true,
              }),
            );
            window.dispatchEvent(new Event('scroll'));
          } catch {}
          await sleep(Number(pass) >= 3 ? 220 : pass === 1 ? 45 : 35);
          collect();
          saved.iterations = Number(saved.iterations || 0) + 1;
          lastHeight = metrics().height;
          lastSize = map.size;
        }
        saved = {
          ...saved,
          groups: Object.fromEntries(map),
          stable: stable,
          lastSize: map.size,
          lastHeight: lastHeight,
          done: done,
        };
        return persist(done, false, false, 0);
      },
    });
    const r = result?.[0]?.result || {};
    merge(r.groups);
    state.iterations = Number(r.iterations || state.iterations || 0);
    state.stableBottom = Number(r.stableBottom || state.stableBottom || 0);
    await onBatch([...state.groups.values()], {
      pass: pass,
      index: state.iterations,
      count: state.groups.size,
      expected: 0,
      atBottom: !!r.atBottom,
      stableBottom: state.stableBottom,
      paused: !!r.paused,
      stopped: !!r.stopped,
    });
    if (r.paused || r.stopped || r.atBottom) keepGoing = false;
    else firstChunk = false;
  }
  return {
    groups: [...state.groups.values()],
    expected: 0,
    iterations: state.iterations,
    stableBottom: state.stableBottom,
    paused: false,
    stopped: false,
  };
}

export async function scanJoinedGroupsBatched(tabId, pass = 1, onBatch = async () => {}, resume = false) {
  const state = {
    pass: pass,
    done: false,
    groups: new Map(),
    expected: 0,
    iterations: 0,
    stableBottom: 0,
  };
  const merge = (list) => {
    for (const g of list || []) {
      const id = String(g?.id || '').trim();
      if (!id) continue;
      const prev = state.groups.get(id);
      if (!prev || (!prev.name && g.name) || Number(g.nameScore || 0) > Number(prev.nameScore || 0))
        state.groups.set(id, g);
    }
  };
  let keepGoing = true,
    firstChunk = !resume;
  while (keepGoing) {
    if (state.activeSyncJob?.paused) {
      keepGoing = false;
      return {
        groups: [...state.groups.values()],
        expected: 0,
        iterations: state.iterations,
        stableBottom: state.stableBottom,
        paused: true,
        stopped: false,
      };
    }
    if (state.activeSyncJob?.cancelled) {
      keepGoing = false;
      return {
        groups: [...state.groups.values()],
        expected: 0,
        iterations: state.iterations,
        stableBottom: state.stableBottom,
        paused: false,
        stopped: true,
      };
    }
    const result = await chrome.scripting.executeScript({
      target: {
        tabId: tabId,
      },
      world: 'MAIN',
      args: [pass, firstChunk],
      func: async (pass, isFirst) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
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
        const generic =
          /^(?:groups?|see all|view all|your groups|discover|your feed|groups you manage|groups you.?ve joined|create new group|facebook groups|view group|see group|open group|group|join|joined|leave|members?|posts?|private|public|public group|all groups you.?ve joined(?:\s*\([\d,.\s]+\))?|you|your content|your groups|facebook user|กลุ่ม|ดูทั้งหมด|กลุ่มของคุณ|ค้นพบ|ฟีดของคุณ|กลุ่มที่คุณจัดการ|กลุ่มที่คุณเข้าร่วม|กลุ่มทั้งหมดที่คุณเข้าร่วม(?:\s*\([\d,.\s]+\))?|สร้างกลุ่มใหม่|ดูกลุ่ม|เปิดกลุ่ม|เข้าร่วม|เข้าร่วมแล้ว|ออกจากกลุ่ม|สมาชิก|โพสต์|ส่วนตัว|สาธารณะ|กลุ่มสาธารณะ)$/iu;
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
        const validName = (v) => {
          const s = clean(v);
          return (
            s.length >= 2 &&
            s.length <= 180 &&
            !generic.test(s) &&
            !/^https?:\/\//i.test(s) &&
            !/^(?:last active|you(?:'|’)?ve last visited|visited|join|joined|leave|members?|posts?)\b/i.test(
              s,
            )
          );
        };
        const scoreName = (v, type, depth = 0) => {
          const s = clean(v);
          if (!validName(s)) return -1;
          const w = {
            heading: 1300,
            'same-href': 1250,
            'img-alt': 1150,
            title: 1100,
            aria: 1080,
            anchor: 1e3,
            leaf: 900,
          };
          let n = w[type] || 700;
          if (depth === 0) n += 80;
          if (s.length <= 100) n += 40;
          return n;
        };
        const getRoot = () => {
          const main = document.querySelector('main,[role="main"]') || document.body;
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const candidates = [];
          const seen = new Set();
          const add = (n) => {
            if (!n || seen.has(n)) return;
            seen.add(n);
            const cs = getComputedStyle(n);
            const rect = n.getBoundingClientRect?.();
            if (!rect || rect.width < 420 || rect.height < 300) return;
            if (n.scrollHeight <= n.clientHeight + 120) return;
            if (!/(auto|scroll)/.test(`${cs.overflowY} ${cs.overflow}`)) return;
            const ids = new Set(
              [...n.querySelectorAll('a[href*="/groups/"]')]
                .map((a) => groupId(a.getAttribute('href') || ''))
                .filter(Boolean),
            );
            const leftBias = rect.left < viewportWidth * 0.55 ? 0 : 120;
            const score =
              ids.size * 500 +
              Math.min(1800, n.clientHeight) +
              Math.min(2200, Math.floor(n.scrollHeight / 250)) +
              leftBias;
            candidates.push({
              n: n,
              score: score,
              ids: ids.size,
            });
          };
          let n = main;
          for (let i = 0; n && i < 8; i++, n = n.parentElement) add(n);
          for (const el of main.querySelectorAll('div,section,ul')) add(el);
          const se = document.scrollingElement || document.documentElement;
          if (se && se.scrollHeight > se.clientHeight + 120) {
            const ids = new Set(
              [...document.querySelectorAll('main a[href*="/groups/"], [role="main"] a[href*="/groups/"]')]
                .map((a) => groupId(a.getAttribute('href') || ''))
                .filter(Boolean),
            );
            candidates.push({
              n: null,
              score: ids.size * 250 + Math.min(900, se.scrollHeight / 500),
              ids: ids.size,
              window: true,
            });
          }
          candidates.sort((a, b) => b.score - a.score || b.ids - a.ids);
          return candidates[0]?.n || null;
        };
        let root = getRoot();
        const stateKey = '__FBMP_JOINED_SCAN_V4__';
        const rootDescriptor = (node) => {
          if (!node) return null;
          const path = [];
          let cur = node;
          for (let depth = 0; cur && cur !== document.body && depth < 12; depth++, cur = cur.parentElement) {
            const parent = cur.parentElement;
            if (!parent) break;
            path.push(Array.prototype.indexOf.call(parent.children, cur));
          }
          return {
            tag: String(node.tagName || '').toLowerCase(),
            id: String(node.id || ''),
            role: String(node.getAttribute?.('role') || ''),
            aria: String(node.getAttribute?.('aria-label') || ''),
            cls: String(node.className || '')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 4)
              .join(' '),
            path: path.reverse(),
          };
        };
        const resolveRoot = (desc) => {
          if (!desc) return null;
          const usable = (n) => {
            if (!n) return false;
            const cs = getComputedStyle(n),
              rect = n.getBoundingClientRect?.();
            return (
              !!rect &&
              rect.width >= 420 &&
              rect.height >= 300 &&
              n.scrollHeight > n.clientHeight + 120 &&
              /(auto|scroll)/.test(`${cs.overflowY} ${cs.overflow}`)
            );
          };
          if (desc.id) {
            const n = document.getElementById(desc.id);
            if (usable(n)) return n;
          }
          if (desc.aria) {
            const esc = String(desc.aria).replace(/"/g, '\\"');
            const n = document.querySelector(`[aria-label="${esc}"]`);
            if (usable(n)) return n;
          }
          if (Array.isArray(desc.path) && desc.path.length) {
            let n = document.body;
            for (const idx of desc.path) {
              if (!n?.children?.[idx]) {
                n = null;
                break;
              }
              n = n.children[idx];
            }
            if (usable(n)) return n;
          }
          return null;
        };
        let saved = window[stateKey];
        if (isFirst || !saved || Number(saved.pass) !== Number(pass)) {
          saved = {
            pass: Number(pass),
            groups: {},
            expected: 0,
            iterations: 0,
            stable: 0,
            lastSize: 0,
            lastHeight: 0,
            scrollTop: 0,
            rootDescriptor: rootDescriptor(root),
            done: false,
          };
          window[stateKey] = saved;
          window.__FBMP_SYNC_CONTROL__ = 'RUN';
          if (root) root.scrollTop = 0;
          else window.scrollTo(0, 0);
        }
        const control = () => String(window.__FBMP_SYNC_CONTROL__ || 'RUN').toUpperCase();
        if (!isFirst && saved.rootDescriptor) {
          const stableRoot = resolveRoot(saved.rootDescriptor);
          if (stableRoot) root = stableRoot;
        }
        const restoreSavedScroll = () => {
          if (isFirst || !root) return;
          const max = Math.max(0, root.scrollHeight - root.clientHeight);
          const target = Math.min(max, Math.max(0, Number(saved.scrollTop || 0)));
          if (target > 0 && root.scrollTop < target - 80) root.scrollTop = target;
        };
        const map = new Map(Object.entries(saved.groups || {}).map(([id, g]) => [id, g]));
        restoreSavedScroll();
        const scope = root || document.querySelector('main,[role="main"]') || document.body;
        const headingNodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],a,span,div')];
        const headingLabel = (e) =>
          clean(e?.innerText || e?.textContent || e?.getAttribute?.('aria-label') || '');
        const pendingHeading =
          headingNodes.find((e) =>
            /^(?:pending\s+group\s+requests?|คำขอเข้าร่วมกลุ่มที่รอดำเนินการ|คำขอที่รอดำเนินการ)(?:\s*\([\d,.\s]+\))?$/i.test(
              headingLabel(e),
            ),
          ) ||
          headingNodes.find((e) =>
            /\bpending\s+group\s+requests?\b|คำขอเข้าร่วมกลุ่มที่รอดำเนินการ/i.test(headingLabel(e)),
          );
        // Facebook's actual heading is "All groups you've joined (22)" (or Thai equivalent, with commas for 1,000+).
        // The old matcher omitted "All" and formatted counts, so pending cards could
        // pass through when the two sections were rendered in the same root.
        const joinedSectionHeading =
          headingNodes.find((e) =>
            /^(?:all\s+groups?\s+you(?:'|’)?ve\s+joined|กลุ่มทั้งหมดที่คุณเข้าร่วม)(?:\s*\([\d,.\s]+\))?$/i.test(
              headingLabel(e),
            ),
          ) ||
          headingNodes.find((e) =>
            /^(?:groups?\s+you(?:'|’)?ve\s+joined|กลุ่มที่คุณเข้าร่วม)(?:\s*\([\d,.\s]+\))?$/i.test(
              headingLabel(e),
            ),
          ) ||
          headingNodes.find((e) =>
            /\ball\s+groups?\s+you(?:'|’)?ve\s+joined\b|กลุ่มทั้งหมดที่คุณเข้าร่วม/i.test(headingLabel(e)),
          );
        const isPendingRequest = (a, card) => {
          const ay = a.getBoundingClientRect?.().top || 0;
          const py = pendingHeading?.getBoundingClientRect?.().top;
          const jy = joinedSectionHeading?.getBoundingClientRect?.().top;
          if (Number.isFinite(py) && Number.isFinite(jy) && py < jy && ay >= py - 60 && ay < jy - 20)
            return true;
          const nodes = [];
          if (card) nodes.push(card);
          let n = a.parentElement;
          for (let d = 0; n && d < 8; d++, n = n.parentElement) nodes.push(n);
          const text = nodes.map((x) => clean(x.innerText || x.textContent || '')).join(' | ');
          return /\bpending\s+group\s+requests?\b|\bmembership\s+request\s+pending\b|\brequest(?:ed)?\s+to\s+join\b|\bcancel\s+request\b|\banswer\s+questions\b|คำขอเข้าร่วมกลุ่มที่รอดำเนินการ|ส่งคำขอเข้าร่วมแล้ว|ยกเลิกคำขอ|ตอบคำถาม/i.test(
            text,
          );
        };
        const isInJoinedSection = (a, card) => {
          const ay = a.getBoundingClientRect?.().top || 0;
          const jy = joinedSectionHeading?.getBoundingClientRect?.().top;
          if (Number.isFinite(jy) && ay < jy - 20) return false;
          if (isPendingRequest(a, card)) return false;
          const nodes = [];
          if (card) nodes.push(card);
          let n = a.parentElement;
          for (let d = 0; n && d < 8; d++, n = n.parentElement) nodes.push(n);
          const text = nodes.map((x) => clean(x.innerText || x.textContent || '')).join(' | ');
          // Joined cards expose positive membership signals; pending cards expose
          // "Requested to join"/"Answer questions". Never accept the latter.
          if (
            /\brequest(?:ed)?\s+to\s+join\b|\banswer\s+questions\b|\bcancel\s+request\b|ส่งคำขอเข้าร่วมแล้ว|ยกเลิกคำขอ|ตอบคำถาม/i.test(
              text,
            )
          )
            return false;
          if (
            /\byou(?:'|’)?ve\s+last\s+(?:visited|active)\b|\bjoined\s+group\b|\bjoined\b|เข้าชมครั้งล่าสุดเมื่อ|เข้าร่วมเมื่อ|เข้าร่วมแล้ว/i.test(
              text,
            )
          )
            return true;
          return Number.isFinite(jy) || !pendingHeading;
        };
        const getCard = (a, id) => {
          let n = a.parentElement;
          for (let d = 0; n && d < 10; d++, n = n.parentElement) {
            const ids = new Set(
              [...n.querySelectorAll('a[href*="/groups/"]')]
                .map((x) => groupId(x.getAttribute('href') || ''))
                .filter(Boolean),
            );
            const r = n.getBoundingClientRect?.();
            if (ids.size === 1 && ids.has(id) && r && r.width >= 240 && r.height >= 42 && r.height <= 600) {
              const role = String(n.getAttribute?.('role') || '').toLowerCase();
              if (d >= 1 || role === 'article' || role === 'listitem' || role === 'row') return n;
            }
            if (ids.size > 1) break;
          }
          return null;
        };
        const collect = () => {
          for (const a of scope.querySelectorAll('a[href*="/groups/"]')) {
            const id = groupId(a.getAttribute('href') || '');
            if (!id) continue;
            const card = getCard(a, id);
            if (!isInJoinedSection(a, card)) continue;
            let best = null;
            const add = (v, type, depth = 0) => {
              const s = clean(v);
              if (!validName(s) || (/^\d+$/.test(s) && String(s) === String(id))) return;
              const score = scoreName(s, type, depth);
              if (!best || score > best.score)
                best = {
                  name: s,
                  score: score,
                  source: type,
                };
            };
            const ar = a.getAttribute('aria-label');
            const title = a.getAttribute('title');
            if (ar) add(ar, 'aria');
            if (title) add(title, 'title');
            if (card) {
              const cr = card.getBoundingClientRect();
              for (const h of card.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
                const r = h.getBoundingClientRect();
                if (r.width && r.height && r.top >= cr.top - 6 && r.bottom <= cr.bottom + 6)
                  add(h.innerText || h.textContent, 'heading');
              }
              for (const img of card.querySelectorAll('img[alt],img[title]')) {
                add(img.getAttribute('alt'), 'img-alt');
                add(img.getAttribute('title'), 'title');
              }
              for (const el of card.querySelectorAll('span,div,p,a')) {
                if (el === a || el.closest('button,[role="button"]')) continue;
                const t = clean(el.innerText || el.textContent);
                if (!t || t.length > 180) continue;
                const child = [...el.children]
                  .map((c) => clean(c.innerText || c.textContent))
                  .filter(Boolean);
                if (child.length && child.join(' ') === t) continue;
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height || r.top < cr.top - 8 || r.bottom > cr.bottom + 8) continue;
                const fs = parseFloat(getComputedStyle(el).fontSize) || 0,
                  fw = parseInt(getComputedStyle(el).fontWeight, 10) || 400;
                add(t, el.matches?.('a[href]') ? 'same-href' : 'leaf');
                if (best)
                  best.score +=
                    Math.min(220, Math.max(0, (fs - 13) * 35)) + (fw >= 600 ? 100 : fw >= 500 ? 50 : 0);
              }
            }
            const at = clean(a.innerText || a.textContent);
            if (validName(at)) add(at, 'anchor');
            const rec = {
              id: id,
              groupId: id,
              url: `https://www.facebook.com/groups/${id}/`,
              name: best?.name || '',
              nameScore: best?.score || 0,
              nameSource: best?.source || '',
            };
            const old = map.get(id);
            const oldName = clean(old?.name || '');
            const oldNameBad = /^(?:you|your content|your groups|facebook user)$/iu.test(oldName);
            if (
              !old ||
              oldNameBad ||
              (!old.name && rec.name) ||
              (rec.name && rec.nameScore > Number(old.nameScore || 0))
            )
              map.set(id, rec);
          }
        };
        const parseExpectedCount = (raw) => {
          const digits = String(raw || '').replace(/[^\d]/g, '');
          const n = Number(digits);
          return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 0;
        };
        const expectedFromPage = () => {
          const texts = [];
          const push = (v) => {
            const s = clean(v);
            if (s && s.length < 500) texts.push(s);
          };
          push(document.body?.innerText || '');
          for (const e of document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],[aria-label]')) {
            push(e.innerText || e.textContent);
            push(e.getAttribute?.('aria-label'));
          }
          const pats = [
            /(?:all\s+groups?\s+you(?:'|’)?ve\s+joined|groups?\s+you(?:'|’)?ve\s+joined|groups?\s+you\s+have\s+joined|กลุ่มทั้งหมดที่คุณเข้าร่วม|กลุ่มที่คุณเข้าร่วม)\s*[^\d]{0,80}(\d[\d,.\s]{0,9})/iu,
            /(?:all\s+groups?\s+you(?:'|’)?ve\s+joined|กลุ่มทั้งหมดที่คุณเข้าร่วม)[^\d\n]{0,120}\(\s*(\d[\d,.\s]{0,9})\s*\)/iu,
            /(?:groups?\s+you(?:'|’)?ve\s+joined|กลุ่มที่คุณเข้าร่วม)[^\d\n]{0,40}\(\s*(\d[\d,.\s]{0,9})\s*\)/iu,
          ];
          let best = 0;
          for (const t of texts)
            for (const re of pats) {
              const m = t.match(re);
              if (m) best = Math.max(best, parseExpectedCount(m[1]));
            }
          return best;
        };
        const persist = (done, paused, stopped) => {
          const currentTop = root
            ? root.scrollTop || 0
            : window.scrollY || document.documentElement.scrollTop || 0;
          const obj = {
            pass: Number(pass),
            groups: Object.fromEntries(map),
            expected: Number(saved.expected || 0),
            iterations: Number(saved.iterations || 0),
            stable: Number(saved.stable || 0),
            lastSize: map.size,
            lastHeight: saved.lastHeight || 0,
            scrollTop: currentTop,
            rootDescriptor: rootDescriptor(root) || saved.rootDescriptor || null,
            done: !!done,
          };
          window[stateKey] = obj;
          return {
            groups: [...map.values()],
            expected: obj.expected,
            iterations: obj.iterations,
            stableBottom: obj.stable,
            atBottom: !!done,
            paused: !!paused,
            stopped: !!stopped,
            scrollTop: root ? root.scrollTop : window.scrollY || document.documentElement.scrollTop || 0,
          };
        };
        const metrics = () =>
          root
            ? {
                top: root.scrollTop,
                height: root.scrollHeight,
                client: root.clientHeight,
              }
            : {
                top: window.scrollY || document.documentElement.scrollTop || 0,
                height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
                client: window.innerHeight || document.documentElement.clientHeight || 0,
              };
        if (saved.done) return persist(true, false, false);
        if (!isFirst) {
          collect();
          await sleep(120);
        }
        let expected = Math.max(Number(saved.expected || 0), expectedFromPage());
        let stable = Number(saved.stable || 0),
          lastSize = Number(saved.lastSize || map.size),
          lastHeight = Number(saved.lastHeight || metrics().height);
        const maxIterationsPerChunk = 12;
        let done = false;
        for (let i = 0; i < maxIterationsPerChunk; i++) {
          if (control() === 'STOP') {
            saved = {
              ...saved,
              expected: expected,
              iterations: Number(saved.iterations || 0),
              stable: stable,
              groups: Object.fromEntries(map),
              done: false,
            };
            return persist(false, false, true);
          }
          if (control() === 'PAUSE') {
            saved = {
              ...saved,
              expected: expected,
              iterations: Number(saved.iterations || 0),
              stable: stable,
              groups: Object.fromEntries(map),
              done: false,
            };
            return persist(false, true, false);
          }
          collect();
          expected = Math.max(expected, expectedFromPage());
          const m = metrics();
          const max = Math.max(0, m.height - m.client);
          const remaining = Math.max(0, max - m.top);
          if (remaining <= 6) {
            const needMore = expected === 0 || map.size < expected;
            await sleep(needMore ? 320 : 120);
            collect();
            expected = Math.max(expected, expectedFromPage());
            const m2 = metrics();
            if (map.size === lastSize && Math.abs(m2.height - lastHeight) < 10) stable++;
            else stable = 0;
            lastSize = map.size;
            lastHeight = m2.height;
            const requiredStable = expected > 0 && map.size >= expected ? 3 : 6;
            if (stable >= requiredStable) {
              done = true;
              break;
            }
            try {
              if (root) root.scrollTop = max;
              else window.scrollTo(0, max);
              saved.scrollTop = max;
              root?.dispatchEvent(new Event('scroll', { bubbles: true }));
              window.dispatchEvent(new Event('scroll'));
            } catch {}
            await sleep(needMore ? 180 : 60);
            continue;
          }
          const step = Math.max(360, Math.min(5200, Math.floor(m.client * 0.9)));
          const next = Math.min(max, m.top + Math.min(step, remaining));
          if (root) root.scrollTop = next;
          else window.scrollTo(0, next);
          saved.scrollTop = next;
          try {
            root?.dispatchEvent(
              new Event('scroll', {
                bubbles: true,
              }),
            );
            window.dispatchEvent(new Event('scroll'));
          } catch {}
          await sleep(pass === 1 ? 28 : 20);
          if (root && saved.scrollTop > 0 && root.scrollTop < saved.scrollTop - 100) {
            try {
              root.scrollTop = Math.min(saved.scrollTop, Math.max(0, root.scrollHeight - root.clientHeight));
              root.dispatchEvent(
                new Event('scroll', {
                  bubbles: true,
                }),
              );
            } catch {}
          }
          collect();
          expected = Math.max(expected, expectedFromPage());
          const after = metrics();
          if (root && after.top < next - 100) {
            try {
              root.scrollTop = Math.min(next, Math.max(0, root.scrollHeight - root.clientHeight));
              saved.scrollTop = root.scrollTop;
            } catch {}
          }
          if (Math.abs(after.top - m.top) < 2 && remaining > 6) await sleep(70);
          saved.iterations = Number(saved.iterations || 0) + 1;
        }
        saved = {
          ...saved,
          expected: expected,
          iterations: Number(saved.iterations || 0),
          stable: stable,
          lastSize: map.size,
          lastHeight: lastHeight,
          scrollTop: root ? root.scrollTop || 0 : window.scrollY || document.documentElement.scrollTop || 0,
          rootDescriptor: rootDescriptor(root) || saved.rootDescriptor || null,
          groups: Object.fromEntries(map),
          done: done,
        };
        return persist(done, false, false);
      },
    });
    const r = result?.[0]?.result || {};
    merge(r.groups);
    state.expected = Number(r.expected || state.expected || 0);
    state.iterations = Number(r.iterations || state.iterations || 0);
    state.stableBottom = Number(r.stableBottom || state.stableBottom || 0);
    await onBatch([...state.groups.values()], {
      pass: pass,
      index: state.iterations,
      count: state.groups.size,
      expected: state.expected,
      atBottom: !!r.atBottom,
      stableBottom: state.stableBottom,
      paused: !!r.paused,
      stopped: !!r.stopped,
    });
    if (r.paused || r.stopped || r.atBottom) {
      keepGoing = false;
      state.done = !!r.atBottom;
    } else firstChunk = false;
  }
  return {
    groups: [...state.groups.values()],
    expected: state.expected,
    iterations: state.iterations,
    stableBottom: state.stableBottom,
    paused: false,
    stopped: false,
    scrollTop: 0,
  };
}

export async function addManualGroup(groupUrl) {
  const raw = String(groupUrl || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      success: false,
      error: 'Please enter a valid Facebook group URL.',
    };
  }
  if (!/^https?:$/i.test(parsed.protocol) || !/(^|\.)facebook\.com$/i.test(parsed.hostname)) {
    return {
      success: false,
      error: 'Please enter a Facebook group URL.',
    };
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0].toLowerCase() !== 'groups') {
    return {
      success: false,
      error: 'Use a URL like https://www.facebook.com/groups/123456789/',
    };
  }
  const key = parts[1];
  const blocked = new Set([
    'feed',
    'discover',
    'joins',
    'notifications',
    'settings',
    'create',
    'search',
    'members',
    'about',
    'media',
    'events',
    'discussion',
    'pending_posts',
    'member-requests',
  ]);
  if (!key || blocked.has(key.toLowerCase()) || !/^[a-zA-Z0-9._-]+$/.test(key)) {
    return {
      success: false,
      error: 'That is not a valid Facebook group URL.',
    };
  }
  const canonical = `https://www.facebook.com/groups/${key}/`;
  const stored = (await chrome.storage.local.get('fb_groups_list')).fb_groups_list?.groups || [];
  const known = stored.find((g) => {
    const gid = String(g?.id || '').toLowerCase();
    const gurl = String(g?.url || '')
      .replace(/\/$/, '')
      .toLowerCase();
    const target = canonical.replace(/\/$/, '').toLowerCase();
    return gid === key.toLowerCase() || gurl === target;
  });
  if (known && String(known.name || '').trim()) {
    return {
      success: true,
      joined: true,
      group: {
        id: String(known.id),
        name: String(known.name).trim(),
        url: known.url || canonical,
        groupId: String(known.groupId || known.id),
        privacy: 'Public Group',
      },
      source: 'synced-list',
    };
  }
  let tab = null;
  try {
    tab = await chrome.tabs.create({
      url: canonical,
      active: false,
    });
    if (!tab?.id) throw new Error('Could not open the Facebook group page for verification.');
    await waitForComplete(tab.id, 25e3);
    const r = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },
      world: 'MAIN',
      func: async () => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const visible = (e) => {
          if (!e) return false;
          const r = e.getBoundingClientRect?.();
          const s = getComputedStyle(e);
          return !!r && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const textOf = (e) =>
          clean(
            e?.innerText ||
              e?.textContent ||
              e?.getAttribute?.('aria-label') ||
              e?.getAttribute?.('title') ||
              '',
          );
        const readStatus = () => {
          const controls = [
            ...document.querySelectorAll('button,[role="button"],a,[aria-label],[title]'),
          ].filter(visible);
          const labels = [...new Set(controls.map(textOf).filter(Boolean))];
          const positive =
            labels.some((x) =>
              /^(?:joined|joined group|you(?:'|’)re joined|leave group|member|you(?:'|’)re a member)$/i.test(
                x,
              ),
            ) ||
            labels.some((x) => /\bleave group\b/i.test(x)) ||
            labels.some((x) => /^joined(?:\s|$)/i.test(x));
          const managed =
            labels.some((x) =>
              /^(?:manage group|manage|group settings|group admin|admin|administrator|moderator|see dashboard)$/i.test(
                x,
              ),
            ) ||
            labels.some((x) =>
              /\b(?:manage group|group admin|you(?:'|’)re an admin|you are an admin|admin of this group)\b/i.test(
                x,
              ),
            );
          const negative =
            labels.some((x) => /^(?:join group|join|request to join|pending|cancel request)$/i.test(x)) ||
            labels.some((x) => /\brequest to join\b|\bjoin group\b/i.test(x));
          return {
            status: positive ? 'joined' : managed ? 'managed' : negative ? 'not_joined' : 'unknown',
            labels: labels,
          };
        };
        let state = readStatus();
        for (let i = 0; i < 12 && state.status === 'unknown'; i++) {
          await new Promise((r) => setTimeout(r, 500));
          state = readStatus();
        }
        const body = clean(document.body?.innerText || '');
        let status = state.status;
        const candidates = [];
        const add = (v, score = 0) => {
          const s = clean(v)
            .replace(/\s*\|\s*Facebook\s*$/i, '')
            .trim();
          if (!s || s.length < 2 || s.length > 200) return;
          if (!candidates.some((x) => x.name === s))
            candidates.push({
              name: s,
              score: score,
            });
        };
        const isBadName = (x) =>
          /^facebook$/i.test(x) ||
          /^groups?$/i.test(x) ||
          /^join(?:ed)?$/i.test(x) ||
          /^leave group$/i.test(x) ||
          /^your groups$/i.test(x) ||
          /^discover$/i.test(x) ||
          /^your feed$/i.test(x);
        const main = document.querySelector('[role="main"]') || document.querySelector('main');
        const mainH1 = main?.querySelector('h1');
        if (mainH1 && visible(mainH1)) add(mainH1.innerText, 100);
        for (const e of [...(main || document).querySelectorAll('h1,[role="heading"]')].slice(0, 40)) {
          if (visible(e)) add(textOf(e), e.tagName === 'H1' ? 95 : 80);
        }
        add(document.querySelector('meta[property="og:title"]')?.getAttribute('content'), 70);
        add(document.querySelector('meta[name="twitter:title"]')?.getAttribute('content'), 60);
        const groupLinks = [...document.querySelectorAll('a[href*="/groups/"]')].map((e) => ({
          text: textOf(e),
          href: e.href,
        }));
        for (const x of groupLinks) if (x.text) add(x.text, 20);
        add(document.title, 10);
        const name =
          candidates.filter((x) => !isBadName(x.name)).sort((a, b) => b.score - a.score)[0]?.name || '';
        const canon = document.querySelector('link[rel="canonical"]')?.href || location.href;
        const finalUrl = String(canon).split('?')[0].split('#')[0];
        const validGroupPage = /facebook\.com\/groups\/[^/]+/i.test(finalUrl);
        if (!validGroupPage) status = 'unknown';
        return {
          status: status,
          name: name,
          canonical: finalUrl,
          bodyHint: body.slice(0, 3e3),
        };
      },
    });
    let result = r?.[0]?.result || {};
    let managedVerified = false;
    if (result.status !== 'joined' && result.status !== 'managed') {
      try {
        await chrome.tabs.update(tab.id, {
          url: 'https://www.facebook.com/groups/?category=groups',
          active: false,
        });
        await waitForComplete(tab.id, 25e3);
        const mr = await chrome.scripting.executeScript({
          target: {
            tabId: tab.id,
          },
          world: 'MAIN',
          func: (targetId) => {
            const clean = (v) =>
              String(v ?? '')
                .replace(/\s+/g, ' ')
                .trim();
            const idOf = (href) => {
              try {
                const u = new URL(href, location.href),
                  p = u.pathname.split('/').filter(Boolean);
                return p.length >= 2 && p[0].toLowerCase() === 'groups' ? String(p[1]) : '';
              } catch {
                return '';
              }
            };
            const target = String(targetId || '').toLowerCase();
            const links = [...document.querySelectorAll('a[href*="/groups/"]')];
            const headings = links.map((a) => ({
              a: a,
              href: a.getAttribute('href') || '',
              id: idOf(a.getAttribute('href') || ''),
              text: clean(a.innerText || a.textContent),
              top: a.getBoundingClientRect?.().top || 0,
            }));
            const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].find((e) =>
              /groups\s+you\s+manage/i.test(clean(e.innerText || e.textContent)),
            );
            const nextHeading = heading
              ? [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].find(
                  (e) =>
                    e !== heading &&
                    (e.getBoundingClientRect?.().top || 0) > (heading.getBoundingClientRect?.().top || 0) &&
                    /groups\s+you(?:'|’)ve\s+joined/i.test(clean(e.innerText || e.textContent)),
                )
              : null;
            const top = heading?.getBoundingClientRect?.().top || -Infinity;
            const bottom = nextHeading?.getBoundingClientRect?.().top || Infinity;
            const scoped = headings.find(
              (x) => x.id.toLowerCase() === target && x.top >= top - 20 && x.top < bottom,
            );
            const broad = headings.find((x) => x.id.toLowerCase() === target);
            const hit = scoped || broad;
            return hit
              ? {
                  found: true,
                  name: hit.text,
                  href: hit.href,
                }
              : {
                  found: false,
                };
          },
          args: [key],
        });
        const managedResult = mr?.[0]?.result || {};
        if (managedResult.found) {
          managedVerified = true;
          result = {
            ...result,
            status: 'managed',
            name: managedResult.name || result.name || '',
            canonical: managedResult.href || canonical,
          };
        }
      } catch {}
    }
    if (result.status !== 'joined' && result.status !== 'managed') {
      const msg =
        result.status === 'not_joined'
          ? 'This Facebook account has not joined this group.'
          : 'Could not verify that this Facebook account has joined or manages this group.';
      return {
        success: false,
        joined: false,
        error: msg,
      };
    }
    const finalUrl = String(result.canonical || canonical)
      .split('?')[0]
      .split('#')[0];
    const finalParts = new URL(finalUrl).pathname.split('/').filter(Boolean);
    const id = finalParts[1] || key;
    const name = String(result.name || '').trim();
    if (!name)
      return {
        success: false,
        error: 'Facebook verified this group, but did not expose the group name.',
      };
    return {
      success: true,
      joined: true,
      managed: result.status === 'managed' || managedVerified,
      group: {
        id: id,
        name: name,
        url: finalUrl.endsWith('/') ? finalUrl : finalUrl + '/',
        groupId: id,
        privacy: 'Public Group',
        managed: result.status === 'managed' || managedVerified,
        groupSource: result.status === 'managed' || managedVerified ? 'managed' : 'joined-list',
      },
      source: result.status === 'managed' || managedVerified ? 'managed-group-page' : 'group-page',
    };
  } catch (e) {
    return {
      success: false,
      error: e.message || 'Could not verify this Facebook group.',
    };
  } finally {
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
    }
  }
}
