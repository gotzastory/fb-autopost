// MAIN world. Passively reads Facebook responses to discover managed Pages; sends nothing off-page.
export function startPageNetworkHook() {
  // FBMP_PAGE_NETWORK_HOOK
  // Main-world, document_start observer used ONLY for Page discovery.
  // It passively watches fetch/XHR responses that Facebook itself makes and
  // extracts Page objects. It never blocks, cancels, or rewrites requests.
  (() => {
    if (window.__FBMP_PAGE_NETWORK_HOOK__) return;
    window.__FBMP_PAGE_NETWORK_HOOK__ = true;
    const MAX_TEXT = 6 * 1024 * 1024;
    const MAX_OBJECTS = 80000;
    const store = (window.__FBMP_PAGE_NETWORK_CANDIDATES__ = window.__FBMP_PAGE_NETWORK_CANDIDATES__ || {});
    const clean = (v) =>
      String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    const asString = (v) => (typeof v === 'string' ? v : '');
    const likelyAvatarKey =
      /^(?:uri|url|src|image|image_uri|image_url|profile_picture|profilePicture|profile_pic|profile_photo|picture|photo)$/i;
    const likelyUrlKey = /^(?:url|uri|link|permalink|href)$/i;

    function avatarFromObject(obj, depth = 0, seen = new Set()) {
      if (!obj || depth > 5 || typeof obj !== 'object') return '';
      if (seen.has(obj)) return '';
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (const x of obj) {
          const r = avatarFromObject(x, depth + 1, seen);
          if (r) return r;
        }
        return '';
      }
      for (const [k, v] of Object.entries(obj)) {
        if (likelyAvatarKey.test(k)) {
          if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
          if (v && typeof v === 'object') {
            const direct = [v.uri, v.url, v.src, v.image?.uri, v.image?.url].find(
              (x) => typeof x === 'string' && /^https?:\/\//i.test(x),
            );
            if (direct) return direct;
            const nested = avatarFromObject(v, depth + 1, seen);
            if (nested) return nested;
          }
        }
        if (v && typeof v === 'object') {
          const nested = avatarFromObject(v, depth + 1, seen);
          if (nested) return nested;
        }
      }
      return '';
    }

    function urlFromObject(obj) {
      for (const [k, v] of Object.entries(obj || {})) {
        if (!likelyUrlKey.test(k)) continue;
        if (typeof v === 'string' && /^https?:\/\/[^\s]+/i.test(v) && /facebook\.com/i.test(v)) return v;
        if (v && typeof v === 'object') {
          const x = v.uri || v.url || v.href;
          if (typeof x === 'string' && /^https?:\/\//i.test(x) && /facebook\.com/i.test(x)) return x;
        }
      }
      return '';
    }

    function addCandidate(obj, sourceUrl) {
      if (!obj || typeof obj !== 'object') return;
      const typename = clean(obj.__typename || obj.__type || obj.type || obj.entity_type || '');
      const isPage = /^page$/i.test(typename) || obj.is_page === true || obj.__isPage === true;
      if (!isPage) return;
      const id = clean(obj.id || obj.page_id || obj.profile_id || obj.pk || '');
      const name = clean(obj.name || obj.title || obj.page_name || '');
      if (!name || name.length < 2 || name.length > 160) return;
      if (!id && !sourceUrl) return;
      const avatar = avatarFromObject(obj) || '';
      const url = urlFromObject(obj) || '';
      const key = id || `${name.toLocaleLowerCase()}|${url}`;
      store[key] = {
        id: id || null,
        name,
        avatar: avatar || null,
        url: url || null,
        type: 'page',
        source: sourceUrl || '',
      };
    }

    function walk(value, sourceUrl, depth = 0, seen = new Set(), count = { n: 0 }) {
      if (count.n++ > MAX_OBJECTS || depth > 10 || value == null) return;
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) walk(item, sourceUrl, depth + 1, seen, count);
        return;
      }
      addCandidate(value, sourceUrl);
      for (const [k, v] of Object.entries(value)) {
        if (v && typeof v === 'object') walk(v, sourceUrl, depth + 1, seen, count);
      }
    }

    function parseText(text, sourceUrl) {
      const u = String(sourceUrl || '');
      if (!/(?:\/api\/|graphql|ajax|async|\?__a=|\/web\/)/i.test(u)) return;
      if (typeof text !== 'string' || !text || text.length > MAX_TEXT) return;
      const t = text.trim();
      if (!t) return;
      try {
        if ((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']')) {
          const parsed = JSON.parse(t);
          walk(parsed, sourceUrl);
          return;
        }
      } catch {}
      // GraphQL batched responses and FB's streamed payloads may contain many
      // JSON objects separated by newlines/prefixes. Extract conservative Page
      // object fragments that expose __typename:"Page" plus id/name.
      const re = /\{[^{}]{0,6000}"__typename"\s*:\s*"Page"[^{}]{0,6000}\}/g;
      let m,
        hits = 0;
      while ((m = re.exec(t)) && hits++ < 250) {
        try {
          const obj = JSON.parse(m[0]);
          addCandidate(obj, sourceUrl);
        } catch {}
      }
    }

    function publish() {
      try {
        window.postMessage({ source: 'FBMP_PAGE_NETWORK_HOOK', type: 'PAGE_CANDIDATES' }, '*');
      } catch {}
    }

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function (...args) {
        const p = nativeFetch.apply(this, args);
        try {
          Promise.resolve(p)
            .then((resp) => {
              try {
                const url = String(resp?.url || args?.[0]?.url || args?.[0] || '');
                if (!/facebook\.com/i.test(url)) return;
                const c = resp.clone();
                c.text()
                  .then((txt) => {
                    parseText(txt, url);
                    publish();
                  })
                  .catch(() => {});
              } catch {}
            })
            .catch(() => {});
        } catch {}
        return p;
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype?.open && XHR?.prototype?.send) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url, ...rest) {
        this.__FBMP_URL__ = String(url || '');
        return open.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function (...args) {
        try {
          this.addEventListener('load', function () {
            try {
              const url = String(this.__FBMP_URL__ || this.responseURL || '');
              if (!/facebook\.com/i.test(url)) return;
              if (this.response && typeof this.response === 'object' && !Array.isArray(this.response)) {
                walk(this.response, url);
                publish();
                return;
              }
              let txt = '';
              if (typeof this.response === 'string') txt = this.response;
              else {
                try {
                  txt = String(this.responseText || '');
                } catch {}
              }
              parseText(txt, url);
              publish();
            } catch {}
          });
        } catch {}
        return send.apply(this, args);
      };
    }

    window.__FBMP_GET_PAGE_NETWORK_CANDIDATES__ = () => {
      try {
        return Object.values(store);
      } catch {
        return [];
      }
    };
  })();
}
