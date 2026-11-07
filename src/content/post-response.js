// MAIN world. Reads Facebook's own post-create response to learn the post URL; sends nothing off-page.
export function startPostResponseObserver() {
  const originalFetch = window.fetch;
  const OriginalXHR = window.XMLHttpRequest;
  let observerState = null;
  // Dev only: this MAIN-world script has no chrome.runtime, so the poster script relays these to the log server.
  const devLog = (text) => {
    if (import.meta.env.DEV)
      window.postMessage(
        { source: 'AGP_DEV_LOG', text: String(text).slice(0, 1500) },
        window.location.origin,
      );
  };
  const friendlyName =
    import.meta.env.DEV &&
    ((body) => {
      try {
        const s = body instanceof FormData ? new URLSearchParams(body).toString() : String(body ?? '');
        return decodeURIComponent((s.match(/fb_api_req_friendly_name=([^&]+)/) || [])[1] || '?');
      } catch {
        return '?';
      }
    });

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function isComposerStoryCreateRequest(url, body) {
    if (String(url || '').includes('ComposerStoryCreateMutation')) return true;
    if (typeof body === 'string' && body.includes('ComposerStoryCreateMutation')) return true;
    if (body instanceof URLSearchParams && body.toString().includes('ComposerStoryCreateMutation'))
      return true;
    if (body instanceof FormData) {
      let found = false;
      body.forEach((v) => {
        if (typeof v === 'string' && v.includes('ComposerStoryCreateMutation')) found = true;
      });
      return found;
    }
    return false;
  }
  function normalizeGraphQLPayload(text) {
    let raw = String(text || '');
    if (!raw) return null;
    if (raw.startsWith('for (;;);')) raw = raw.substring(9);
    try {
      return findStoryCreate(JSON.parse(raw));
    } catch {}
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = findStoryCreate(JSON.parse(line));
        if (parsed) return parsed;
      } catch {}
    }
    return null;
  }
  function findStoryCreate(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.story_create) return value.story_create;
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (child && typeof child === 'object') {
        const found = findStoryCreate(child);
        if (found) return found;
      }
    }
    return null;
  }
  function asAbsoluteUrl(value) {
    try {
      return value ? new URL(String(value), window.location.origin).href : void 0;
    } catch {
      return void 0;
    }
  }
  function findGroupPostUrl(value, groupId) {
    if (!value || typeof value !== 'object') return null;
    const gid = escapeRegExp(groupId);
    const re = new RegExp(`/groups/${gid}/(?:posts|permalink)/(\\d+)(?:/|\\?|#|$)`);
    const pendingRe = new RegExp(`/groups/${gid}/pending_posts/([^/?#]+)(?:/|\\?|#|$)`);
    const visit = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object' || visit.has(node)) return null;
      visit.add(node);
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = walk(item);
          if (found) return found;
        }
        return null;
      }
      for (const key of ['url', 'permalink_url', 'permalink', 'story_url', 'post_url', 'www_url']) {
        const candidate = asAbsoluteUrl(node[key]);
        if (candidate) {
          if (re.test(new URL(candidate).pathname) || pendingRe.test(new URL(candidate).pathname))
            return candidate;
        }
      }
      for (const key of Object.keys(node)) {
        const found = walk(node[key]);
        if (found) return found;
      }
      return null;
    };
    return walk(value);
  }
  function findGroupPostId(value, groupId) {
    if (!value || typeof value !== 'object') return null;
    const url = findGroupPostUrl(value, groupId);
    if (url) {
      const m = new URL(url).pathname.match(
        new RegExp(`/groups/${escapeRegExp(groupId)}/(?:posts|permalink)/(\\d+)`),
      );
      if (m) return m[1];
    }
    const visit = new Set();
    const preferredKeys = new Set(['post_id', 'postId', 'story_id', 'storyId']);
    const walk = (node) => {
      if (!node || typeof node !== 'object' || visit.has(node)) return null;
      visit.add(node);
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = walk(item);
          if (found) return found;
        }
        return null;
      }
      for (const key of preferredKeys) {
        const v = node[key];
        if (/^\d+$/.test(String(v || ''))) return String(v);
      }
      for (const key of Object.keys(node)) {
        const found = walk(node[key]);
        if (found) return found;
      }
      return null;
    };
    return walk(value);
  }
  function collectPendingSignals(story) {
    const signals = [];
    const push = (condition, name) => {
      if (Boolean(condition) && !signals.includes(name)) signals.push(name);
    };
    push(story?.to?.if_viewer_can_see_pending_content_card, 'PENDING_CONTENT_CARD');
    push(story?.to?.if_viewer_can_see_pending_post_in_mall, 'PENDING_POST_IN_MALL');
    push(story?.if_viewer_can_learn_more_about_pending_post, 'LEARN_MORE_ABOUT_PENDING_POST');
    return signals;
  }
  function inspectResponse(text, requestWasComposerStoryCreate) {
    if (!observerState || Date.now() > observerState.expiresAt || !requestWasComposerStoryCreate) return;
    const storyCreate = normalizeGraphQLPayload(text);
    if (import.meta.env.DEV)
      devLog(
        `story create response: ${text.length} chars, story_create ${storyCreate ? 'found' : 'missing'}: ${text.slice(0, 600)}`,
      );
    if (!storyCreate) return;
    const groupId = observerState.groupId;
    const observationId = observerState.observationId;
    const story = storyCreate.story || storyCreate.group_feed_story_edge?.node || storyCreate;
    const pendingSignals = collectPendingSignals(story);
    const rawUrl = findGroupPostUrl(storyCreate, groupId);
    const postId = findGroupPostId(storyCreate, groupId);
    const url = rawUrl ? asAbsoluteUrl(rawUrl) : void 0;
    const pendingUrl =
      url && new URL(url).pathname.includes(`/groups/${groupId}/pending_posts/`) ? url : void 0;
    if (pendingUrl && !pendingSignals.includes('PENDING_POST_URL')) pendingSignals.push('PENDING_POST_URL');
    const publishedUrl =
      url &&
      !pendingUrl &&
      new RegExp(`/groups/${escapeRegExp(groupId)}/(?:posts|permalink)/\\d+`).test(new URL(url).pathname)
        ? url
        : void 0;
    const snapshot = {
      observationId,
      groupId,
      postId: postId || void 0,
      postUrl: publishedUrl,
      pendingPostUrl: pendingUrl,
      hasGroupFeedStoryEdge: Boolean(storyCreate.group_feed_story_edge?.node),
      pendingSignals,
    };
    if (import.meta.env.DEV) devLog(`snapshot: ${JSON.stringify(snapshot)}`);
    window.postMessage(
      { source: 'AGP_POST_RESPONSE_OBSERVER', observationId, groupId, snapshot },
      window.location.origin,
    );
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.source !== 'AGP_CONTENT_SCRIPT') return;
    if (data.type === 'ARM_POST_RESPONSE_OBSERVER') {
      observerState = {
        observationId: data.observationId,
        groupId: data.groupId,
        expiresAt: Date.now() + 45000,
      };
      if (import.meta.env.DEV) devLog(`armed for group ${data.groupId}`);
      window.postMessage(
        { source: 'AGP_POST_RESPONSE_BRIDGE', type: 'OBSERVER_ARMED', observationId: data.observationId },
        window.location.origin,
      );
    } else if (
      data.type === 'DISARM_POST_RESPONSE_OBSERVER' &&
      observerState?.observationId === data.observationId
    ) {
      observerState = null;
    }
  });

  window.fetch = async function (input, init) {
    const response = await originalFetch.apply(this, arguments);
    if (observerState && Date.now() <= observerState.expiresAt) {
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input instanceof Request
                ? input.url
                : '';
        if (import.meta.env.DEV && !String(url).includes('/api/graphql/'))
          devLog(`fetch ${response.status} ${String(url).slice(0, 160)}`);
        if (String(url).includes('/api/graphql/')) {
          if (import.meta.env.DEV) devLog(`fetch graphql: ${friendlyName(init?.body)}`);
          const requestIsComposer =
            isComposerStoryCreateRequest(url, init?.body) ||
            (input instanceof Request &&
              input.method !== 'GET' &&
              isComposerStoryCreateRequest(url, init?.body));
          if (requestIsComposer)
            response
              .clone()
              .text()
              .then((text) => inspectResponse(text, true))
              .catch(() => {});
        }
      } catch {}
    }
    return response;
  };

  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    let requestUrl = '';
    const originalOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      try {
        requestUrl = typeof url === 'string' ? url : url?.href || '';
      } catch {}
      return originalOpen.call(xhr, method, url, ...rest);
    };
    const originalSend = xhr.send;
    xhr.send = function (body) {
      if (import.meta.env.DEV && observerState && !String(requestUrl).includes('/api/graphql/'))
        xhr.addEventListener('loadend', () =>
          devLog(`xhr ${xhr.status} ${String(requestUrl).slice(0, 160)}`),
        );
      if (
        observerState &&
        Date.now() <= observerState.expiresAt &&
        String(requestUrl).includes('/api/graphql/')
      ) {
        const requestIsComposer = isComposerStoryCreateRequest(requestUrl, body);
        if (import.meta.env.DEV) devLog(`xhr graphql: ${friendlyName(body)}`);
        if (requestIsComposer) {
          xhr.addEventListener('load', () => {
            if (xhr.responseText) inspectResponse(xhr.responseText, true);
          });
        }
      }
      return originalSend.call(xhr, body);
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;
}
