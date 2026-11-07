// Dev only (every caller is behind `import.meta.env.DEV`, so none of this ships in a build; the audit
// would fail on the loopback URL if it did). Mirrors console output to scripts/dev-log-server.ts.

export interface DevLogEntry {
  src: string;
  level: string;
  text: string;
  t: number;
}

const show = (a: unknown): string => {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
};

/** Extension pages and the worker post straight to the log server; content scripts relay through the worker. */
export const postDevLog = (e: DevLogEntry) =>
  void fetch('http://127.0.0.1:5199/log', { method: 'POST', body: JSON.stringify(e) }).catch(() => {});

export const devLog = (src: string, level: string, text: string) =>
  postDevLog({ src, level, text: text.slice(0, 4000), t: Date.now() });

/** Keeps console working as before and also sends each call through `deliver`. */
export function forwardConsole(src: string, deliver: (e: DevLogEntry) => void) {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        deliver({ src, level, text: args.map(show).join(' ').slice(0, 4000), t: Date.now() });
      } catch {}
    };
  }
}

/** Worker side: forwards its own console, content-script logs, and what Facebook tabs report to the engine. */
export function installWorkerDevLog() {
  forwardConsole('worker', postDevLog);
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (m?.type === 'DEV_LOG') postDevLog(m.entry);
    else if (sender.tab && m?.type !== 'GET_POST_MEDIA') devLog('fb-tab', 'msg', show(m));
    return false;
  });
}

/** Dashboard side: forwards its console and every posting progress message. */
export function installPageDevLog(src: string) {
  forwardConsole(src, postDevLog);
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type === 'REAL_POST_PROGRESS') devLog('progress', 'progress', show(m));
    return false;
  });
}
