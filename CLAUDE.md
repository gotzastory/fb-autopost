# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chrome MV3 extension (WXT + React 19 + TypeScript + Tailwind v4/daisyUI) that posts to the user's Facebook groups from their own browser. It is a rebuild of "FB Group Bulk Poster" 5.91 with the data-stealing code removed (see README). The README and UI copy are partly Thai.

## Project skills

Skills live in `.agents/skills/<name>/SKILL.md` only. Do not create `.claude/skills` or copy/link skills there. Before a task a skill covers, read its SKILL.md and follow it:

- `frontend-design`: any new UI or visual restyle of the dashboard or popup.

## Commands

```
npm install          # also runs `wxt prepare` (generates .wxt/ types)
npm run dev          # WXT dev mode with hot reload (no CSP applied)
npm run build        # builds to .output/chrome-mv3 (load unpacked from there)
npm run verify       # typecheck + lint + test + build + scripts/audit-build.mjs — run before calling work done
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src
npm test             # vitest run (tests/**/*.test.ts)
npx vitest run -t "spintax"   # run one describe/test by name
```

Prettier: `printWidth 110`, single quotes.

## Architecture

Three runtimes talk through Chrome messaging:

- **Background service worker** (`src/entrypoints/background.ts`) only calls `registerListeners()` in `src/engine/listeners.js`. Every `chrome.*` listener is registered there, synchronously at worker start. The engine (`src/engine/*.js`) does group/page sync, identity switching (profile ↔ Page via `c_user`/`i_user` cookies), media storage (IndexedDB) and the posting loop. Shared mutable state lives in `src/engine/state.js`.
- **Content scripts on facebook.com** (`src/content/*.js`, wired up by `src/entrypoints/*.content.ts`): `network-hook` runs in the page's `MAIN` world at `document_start` and reports to the isolated scripts with `window.postMessage`. `post-response` watches post responses. `poster` (isolated world) drives the composer DOM and answers `PING_FB_POSTER`.
- **Extension pages**: the dashboard (`src/entrypoints/dashboard` → `src/dashboard/`) and the popup. They call the engine with `send({ type: ... })` from `src/lib/types.ts` (a typed `chrome.runtime.sendMessage`, reply shape `EngineReply`), and get posting progress through `chrome.runtime.onMessage` (`usePosting.ts`). The group list is mirrored in `chrome.storage.local` (`fb_groups_list`).
- **Dashboard lifeline**: `dashboard/main.tsx` opens the port `FBMP_SYNC_LIFELINE` and sends `STOP_ALL_ACTIVITY` on `pagehide`. Closing or reloading the dashboard stops all sync and posting on purpose.

`src/lib/` holds the pure, tested logic (groups, media limits, progress, spintax) shared by the UI and the engine. `src/lib/i18n.tsx` is the TH/EN UI switch: a dictionary keyed by the English text, with the choice stored in `chrome.storage.local.ui_lang` and synced between popup and dashboard. Only fixed UI text is translated. Runtime notices and log text from the hooks and engine stay English.

## Constraints that aren't obvious

- `src/engine` and `src/content` stay **plain JS** on purpose. Functions passed to `chrome.scripting.executeScript` are serialized, so they must not reference outer variables or transpile helpers. This is also why the Vite target is `esnext`. They depend on Facebook's DOM and can only be tested against a real account. Posting has never been tested live.
- **JS is not minified** so the installed extension stays readable for auditing. Only CSS is minified. Keep it that way.
- `scripts/audit-build.mjs` fails the build on: permissions or hosts outside the allowlist (`storage, scripting, activeTab, tabs, cookies`; facebook.com, fbcdn.net, fbsbx.com), URLs to any other domain or URLs split across strings, obfuscated identifiers, reading cookies other than `c_user`/`i_user`, WebSocket, hand-built XHR, `sendBeacon`, `setUninstallURL`, `document.cookie` outside the one `i_user` check, `fetch` from content scripts, or a missing or loosened manifest CSP. Adding a host or permission means changing both `wxt.config.ts` and the audit allowlist, which needs a deliberate reason.
- The production CSP (`wxt.config.ts`, build only) limits extension pages and the worker to Facebook hosts. It does not cover content scripts or opened tabs.
- Tailwind scans only `src/dashboard`, `src/entrypoints` and `src/lib/i18n.tsx` (`source(none)` in `src/styles/app.css`). Classes used anywhere else will not be generated. daisyUI components are opt-in through the `include:` list there, so add a component's name before using it.
