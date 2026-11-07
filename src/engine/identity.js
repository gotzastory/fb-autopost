// Facebook automation engine: identity. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { findFacebookTab } from './core';
import { normalizeManagedPageName } from './pages';
import { enforceAccountBinding, getFacebookPageCookieId, sleep, waitForComplete } from './profile';

// ---------------------------------------------------------------------------
// Identity switching
// ---------------------------------------------------------------------------
// Switching is verified against Facebook's own i_user cookie instead of trusting
// a DOM click: i_user is present (and equals the Page id) while a Page identity
// is active and is removed when the personal profile is active again.
export async function waitForIdentityCookie(wantPage, wantPageId = '', timeout = 15e3) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const current = await getFacebookPageCookieId();
    if (wantPage) {
      if (current && (!wantPageId || String(current) === String(wantPageId))) return current;
    } else if (!current) return '';
    await sleep(400);
  }
  return null;
}

export async function clickSwitchNowOnPagesTab(tabId, name) {
  const r = await chrome.scripting
    .executeScript({
      target: {
        tabId: Number(tabId),
      },
      world: 'MAIN',
      args: [String(name || '')],
      func: async (target) => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const norm = (v) => clean(v).toLowerCase();
        const vis = (e) => {
          if (!e) return false;
          const r = e.getBoundingClientRect?.();
          if (!r || r.width < 8 || r.height < 8) return false;
          const st = getComputedStyle(e);
          return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
        };
        const CTRL = /^(?:switch\s*now|chuyển\s*ngay)$/i;
        const wanted = norm(target);
        const firstLine = (el) =>
          norm(
            String(el.innerText || '')
              .split(/\n+/)
              .map((v) => v.trim())
              .filter(Boolean)[0] || '',
          );
        const deadline = Date.now() + 25e3;
        while (Date.now() < deadline) {
          const ctrls = [
            ...document.querySelectorAll('div[role="button"],button,a[role="button"],a,[role="link"]'),
          ]
            .filter(vis)
            .filter((e) =>
              CTRL.test(clean(e.innerText || e.textContent || e.getAttribute('aria-label') || '')),
            );
          const exact = [],
            loose = [];
          for (const c of ctrls) {
            let n = c;
            for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
              const t = String(n.innerText || '');
              if (clean(t).length > 600) break;
              const fl = firstLine(n);
              if (!fl) continue;
              if (fl === wanted) {
                exact.push(c);
                break;
              }
              if (fl.startsWith(wanted) || wanted.startsWith(fl)) {
                loose.push(c);
                break;
              }
            }
          }
          const hit = exact[0] || loose[0];
          if (hit) {
            try {
              hit.scrollIntoView({
                block: 'center',
              });
            } catch {}
            await new Promise((r) => setTimeout(r, 220));
            try {
              hit.click();
            } catch {
              try {
                hit.dispatchEvent(
                  new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                  }),
                );
              } catch {}
            }
            return {
              clicked: true,
              exact: !!exact[0],
            };
          }
          await new Promise((r) => setTimeout(r, 600));
        }
        return {
          clicked: false,
        };
      },
    })
    .catch(() => []);
  return !!r?.[0]?.result?.clicked;
}

export async function pickIdentityFromAccountMenu(tabId, name) {
  const r = await chrome.scripting
    .executeScript({
      target: { tabId: Number(tabId) },
      world: 'MAIN',
      args: [String(name || '')],
      func: async (target) => {
        const clean = (v) =>
          String(v ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        const norm = (v) => clean(v).toLocaleLowerCase();
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const vis = (e) => {
          if (!e) return false;
          const r = e.getBoundingClientRect?.();
          if (!r || r.width < 8 || r.height < 8) return false;
          const st = getComputedStyle(e);
          return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
        };
        const wanted = norm(target);
        const textOf = (e) => clean(e?.innerText || e?.textContent || e?.getAttribute?.('aria-label') || '');
        const clickable = (e) => {
          if (!e) return null;
          if (e.matches?.('button,[role="button"],[role="menuitem"],[role="option"],[role="link"],a'))
            return e;
          return (
            e.closest?.('button,[role="button"],[role="menuitem"],[role="option"],[role="link"],a') || null
          );
        };
        const exactVisibleText = (scope = document) => {
          const els = [...(scope.querySelectorAll?.('*') || [])].filter(vis);
          const exact = els.filter((e) => norm(textOf(e)) === wanted);
          exact.sort((a, b) => {
            const ac = clickable(a),
              bc = clickable(b);
            const as = ac ? 0 : 1,
              bs = bc ? 0 : 1;
            if (as !== bs) return as - bs;
            return (
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height
            );
          });
          return exact[0] || null;
        };
        const menuScopes = () =>
          [
            ...document.querySelectorAll(
              '[role="menu"],[role="dialog"],[role="listbox"],[data-pagelet*="Profile"],[data-pagelet*="Account"]',
            ),
          ].filter(vis);
        const findTarget = () => {
          for (const scope of menuScopes()) {
            const hit = exactVisibleText(scope);
            if (hit) return clickable(hit) || hit;
            const rows = [
              ...scope.querySelectorAll(
                '[role="menuitem"],[role="option"],[role="button"],[role="link"],button,a',
              ),
            ].filter(vis);
            const loose = rows.find((e) => {
              const t = norm(textOf(e));
              return t === wanted || t.startsWith(wanted + ' ') || t.startsWith(wanted + '\n');
            });
            if (loose) return loose;
          }
          const hit = exactVisibleText(document);
          return hit ? clickable(hit) || hit : null;
        };
        const clickSafe = async (el) => {
          if (!el) return false;
          try {
            el.scrollIntoView({ block: 'center', inline: 'center' });
          } catch {}
          await sleep(120);
          try {
            el.click();
            return true;
          } catch {}
          try {
            el.dispatchEvent(
              new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }),
            );
            return true;
          } catch {}
          return false;
        };
        const isSwitchControl = (e) =>
          /^(?:switch\s*now|switch|continue|chuyển\s*ngay|tiếp\s*tục)$/i.test(clean(textOf(e)));
        const findSwitchControl = () =>
          [...document.querySelectorAll('[role="button"],button,a,[role="link"]')]
            .filter(vis)
            .find(isSwitchControl);

        // Facebook's account switcher is not consistently exposed as a role=menu.
        // Prefer explicit profile/account controls in the top-right, then use the
        // right-most avatar control as a fallback.
        const allControls = [
          ...document.querySelectorAll(
            '[role="button"],button,[aria-haspopup="menu"],[aria-haspopup="dialog"]',
          ),
        ].filter(vis);
        const explicit = allControls.filter((e) =>
          /profile|account|your profile|hồ sơ|tài khoản/i.test(
            String(e.getAttribute('aria-label') || '') + ' ' + textOf(e),
          ),
        );
        const topRight = allControls
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth * 0.7)
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
        const openers = [...new Set([...explicit, ...topRight])].slice(0, 10);

        for (let attempt = 0; attempt < 3; attempt++) {
          let row = findTarget();
          if (!row) {
            for (const opener of openers) {
              await clickSafe(opener);
              await sleep(700);
              row = findTarget();
              if (row) break;
            }
          }
          if (!row) {
            // Some Facebook builds require a second pass after the account popover
            // finishes mounting.
            await sleep(900);
            row = findTarget();
          }
          if (!row) continue;

          const clicked = await clickSafe(row);
          if (!clicked) continue;

          // The Page switch confirmation may appear asynchronously. Never stop at
          // a fixed 1.2s delay; keep looking for the confirmation and let the cookie
          // observer outside this function verify the actual identity change.
          for (let i = 0; i < 18; i++) {
            await sleep(450);
            const confirm = findSwitchControl();
            if (confirm && !/^switch\s*now$/i.test(norm(textOf(row)))) {
              await clickSafe(confirm);
              await sleep(700);
            }
            const currentUrl = String(location.href || '');
            if (
              /facebook\.com\/pages\//i.test(currentUrl) ||
              /facebook\.com\/profile\.php/i.test(currentUrl)
            ) {
              // Navigation itself is not treated as success. Return to the caller,
              // which verifies the authenticated i_user cookie.
            }
            if (document.querySelector('[role="dialog"]') && findSwitchControl()) {
              await clickSafe(findSwitchControl());
            }
          }
          return { clicked: true, attempts: attempt + 1 };
        }
        return { clicked: false, reason: 'identity-row-not-found' };
      },
    })
    .catch(() => []);
  return !!r?.[0]?.result?.clicked;
}

export async function switchFacebookIdentity(identity) {
  await enforceAccountBinding().catch(() => {});
  const wantPage = String(identity?.type || '') === 'page';
  const name = normalizeManagedPageName(identity?.name);
  const wantPageId = String(identity?.id || '').match(/^\d{5,}$/) ? String(identity.id) : '';
  if (!name)
    return {
      success: false,
      error: 'No profile/Page selected.',
    };
  const already = await getFacebookPageCookieId();
  if (wantPage && already && wantPageId && already === wantPageId) {
    await chrome.storage.local
      .set({
        fb_posting_identity: {
          type: 'page',
          name: name,
          id: wantPageId,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    return {
      success: true,
      alreadyActive: true,
      name: name,
    };
  }
  if (!wantPage && !already) {
    await chrome.storage.local
      .set({
        fb_posting_identity: {
          type: 'profile',
          name: name,
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    return {
      success: true,
      alreadyActive: true,
      name: name,
    };
  }
  let tab = null,
    createdTabId = null;
  const savedId = Number(
    (await chrome.storage.local.get('fb_last_facebook_tab_id').catch(() => ({}))).fb_last_facebook_tab_id ||
      0,
  );
  if (savedId) {
    const candidate = await chrome.tabs.get(savedId).catch(() => null);
    if (candidate?.id && /facebook\.com\//i.test(String(candidate.url || ''))) tab = candidate;
  }
  if (!tab) tab = await findFacebookTab();
  if (!tab?.id) {
    tab = await chrome.tabs
      .create({
        url: 'https://www.facebook.com/pages/?category=your_pages',
        active: false,
      })
      .catch(() => null);
    if (!tab?.id)
      return {
        success: false,
        error: 'Could not open Facebook to switch identity.',
      };
    createdTabId = tab.id;
    await waitForComplete(tab.id, 6e4).catch(() => {});
    await sleep(1500);
  }
  let clicked = false,
    lastError = '';
  try {
    // First choice: use Facebook's account switcher in the existing Facebook
    // tab. Retry several times because the account popover is dynamically
    // mounted and its DOM is not stable. The cookie is the only success signal.
    for (let attempt = 0; attempt < 3; attempt++) {
      clicked = (await pickIdentityFromAccountMenu(tab.id, name).catch(() => false)) || clicked;
      const confirmed = await waitForIdentityCookie(wantPage, wantPageId, clicked ? 7e3 : 2e3);
      if (confirmed !== null && confirmed !== undefined) return await finishSwitch();
      await sleep(500);
    }

    if (wantPage) {
      // Secondary recovery: reuse the SAME Facebook tab and navigate it to the
      // managed-pages list. Never open a second tab just to switch identities.
      const current = await chrome.tabs.get(tab.id).catch(() => null);
      const currentUrl = String(current?.url || '');
      const worker = tab;
      if (worker?.id) {
        if (!/facebook\.com\/pages\/?\?category=your_pages/i.test(currentUrl)) {
          await chrome.tabs
            .update(worker.id, {
              url: 'https://www.facebook.com/pages/?category=your_pages',
              active: false,
            })
            .catch(() => {});
        }
        await waitForComplete(worker.id, 6e4).catch(() => {});
        await sleep(1800);

        // Some Facebook builds expose a Switch Now control; others only render
        // the managed Page card. Try both, then return to the account switcher
        // on this same tab.
        clicked = (await clickSwitchNowOnPagesTab(worker.id, name).catch(() => false)) || clicked;
        let confirmed = await waitForIdentityCookie(true, wantPageId, 8e3);
        if (confirmed !== null) return await finishSwitch();

        // Re-open the account switcher after the Pages manager has mounted.
        // This handles the current Facebook UI where the card has no visible
        // "Switch Now" button.
        clicked = (await pickIdentityFromAccountMenu(worker.id, name).catch(() => false)) || clicked;
        confirmed = await waitForIdentityCookie(true, wantPageId, 10e3);
        if (confirmed !== null) return await finishSwitch();

        lastError = 'Facebook did not confirm the Page switch yet.';
      }
    } else {
      // Profile switching is verified by the absence of the Page i_user cookie.
      const confirmed = await waitForIdentityCookie(false, '', 10e3);
      if (confirmed !== null) return await finishSwitch();
      // One final account-menu retry before reporting an actual failure.
      clicked = (await pickIdentityFromAccountMenu(tab.id, name).catch(() => false)) || clicked;
      const retry = await waitForIdentityCookie(false, '', 8e3);
      if (retry !== null) return await finishSwitch();
      lastError = 'Facebook did not confirm the switch back to your profile.';
    }
    return {
      success: false,
      error: lastError || 'Facebook did not confirm the identity switch.',
    };
  } catch (e) {
    return {
      success: false,
      error: e?.message || String(e),
    };
  } finally {
    if (createdTabId) await chrome.tabs.remove(createdTabId).catch(() => {});
  }
  async function finishSwitch() {
    await chrome.storage.local
      .set({
        fb_posting_identity: {
          type: wantPage ? 'page' : 'profile',
          name: name,
          id: wantPageId || null,
          avatar: String(identity?.avatar || ''),
          updatedAt: Date.now(),
        },
      })
      .catch(() => {});
    return {
      success: true,
      name: name,
      type: wantPage ? 'page' : 'profile',
      activePageId: await getFacebookPageCookieId(),
    };
  }
}
