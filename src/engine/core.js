// Facebook automation engine: core. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.

export const log = (...args) => console.log('[FB SW]', ...args);

export const logError = (...args) => console.error('[FB SW]', ...args);

export const FB_PAGE_SYNC_WORKER_TABS = new Set();

export const FB_TRANSIENT_TAB_ERROR =
  /frame with id|was removed|no tab with id|no frame with id|the tab was closed|receiving end does not exist|cannot access( a chrome)? ?url|target tab|target frame/i;

export async function execScriptSafe(options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await chrome.scripting.executeScript(options);
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (attempt < retries && FB_TRANSIENT_TAB_ERROR.test(msg)) {
        await new Promise((r) => setTimeout(r, 350 + attempt * 300));
        const tabId = Number(options?.target?.tabId || 0);
        if (tabId) {
          const still = await chrome.tabs.get(tabId).catch(() => null);
          if (!still?.id) return [];
        }
        continue;
      }
      return [];
    }
  }
  return [];
}

export async function findFacebookTab() {
  const tabs = await chrome.tabs.query({
    url: '*://*.facebook.com/*',
  });
  const usable = tabs.filter((t) => {
    const u = String(t.url || '');
    if (FB_PAGE_SYNC_WORKER_TABS.has(Number(t.id))) return false;
    if (u.includes('messenger.com')) return false;
    if (/facebook\.com\/pages\/?\?category=your_pages/i.test(u)) return false;
    return true;
  });
  const active = usable.find((t) => t.active);
  return active || usable[0] || null;
}

export function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
