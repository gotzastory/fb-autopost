// Fails the build if the packaged extension can talk to anything but Facebook, asks for
// extra permissions, or contains the patterns the original malware relied on.
// shortcut: reads text only, so a URL assembled at runtime from innocent pieces would pass;
// the concatenation check below catches the original's style, not every possible trick.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || '.output/chrome-mv3';
// w3.org, react.dev and MDN appear only in library comments, SVG namespaces and error text.
const ALLOWED_HOST = /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com|w3\.org|react\.dev|developer\.mozilla\.org)$/i;
const ALLOWED_PERMISSIONS = new Set(['storage', 'scripting', 'activeTab', 'tabs', 'cookies']);
const FORBIDDEN = [
  [/_0x[0-9a-f]{4,}/, 'obfuscated identifiers'],
  [/script\.google|googleapis|ipapi|ip-api/i, 'known exfiltration or geolocation host'],
  [/cookies\s*\.\s*(getAll|set|remove|getAllCookieStores)\b/, 'cookie access beyond read-one'],
  [/chrome\s*\.\s*(management|debugger|webRequest|declarativeNetRequest)\b/, 'forbidden chrome API'],
  [/runtime\s*\.\s*setUninstallURL\b/, 'uninstall URL can carry data off-device'],
  [/sendBeacon|new WebSocket|new EventSource|new XMLHttpRequest/, 'network channel'],
  [/\beval\(|new Function\(|importScripts\(/, 'dynamic code'],
  [/["'`]https?:\/{0,2}[a-z]{0,3}["'`]\s*\+/i, 'URL split across string concatenation'],
];
// Only the two Facebook-avatar helpers may start a request from extension code.
const MAX_EXTENSION_FETCH_CALLS = 2;

const problems = [];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json)$/.test(name)) files.push(p);
  }
})(DIST);
if (!files.length) problems.push(`no build output in ${DIST}`);

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
for (const p of manifest.permissions ?? []) if (!ALLOWED_PERMISSIONS.has(p)) problems.push(`permission not allowed: ${p}`);
for (const h of manifest.host_permissions ?? []) {
  const host = h.replace(/^[^:]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
  if (!ALLOWED_HOST.test(host)) problems.push(`host permission not allowed: ${h}`);
}
if (manifest.externally_connectable) problems.push('externally_connectable must not be set');
if (manifest.declarative_net_request) problems.push('declarative_net_request must not be set');

const csp = String(manifest.content_security_policy?.extension_pages ?? '');
const directive = (name) => csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`))?.[1].trim().split(/\s+/) ?? [];
if (directive('default-src').join() !== "'self'") problems.push(`CSP default-src must be 'self': ${csp || 'no CSP'}`);
if (directive('script-src').join() !== "'self'") problems.push(`CSP script-src must be 'self': ${csp || 'no CSP'}`);
for (const name of ['connect-src', 'img-src']) {
  const sources = directive(name);
  if (!sources.length) problems.push(`CSP is missing ${name}`);
  for (const s of sources) {
    if (["'self'", 'data:', 'blob:'].includes(s) && !(name === 'connect-src' && s !== "'self'")) continue;
    if (!/^https:\/\/\*\.(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test(s)) problems.push(`CSP ${name} allows ${s}`);
  }
}

const cookieHits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => /document\s*\.\s*cookie/.test(l)));
for (const line of cookieHits) if (!/i_user=.*\.test\(String\(document\.cookie/.test(line)) problems.push(`document.cookie use: ${line.trim().slice(0, 100)}`);
if (cookieHits.length > 1) problems.push(`document.cookie is read ${cookieHits.length} times, expected at most 1`);
for (const f of files) {
  if (/content-scripts/.test(f) && /(?<![\w.])fetch\(/.test(readFileSync(f, 'utf8'))) problems.push(`${f}: content script starts its own fetch()`);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [re, why] of FORBIDDEN) if (re.test(text)) problems.push(`${file}: ${why} (${re.source})`);
  for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    if (!ALLOWED_HOST.test(host)) problems.push(`${file}: unexpected host ${host}`);
  }
}
const background = readFileSync(join(DIST, 'background.js'), 'utf8');
const fetchCalls = background.match(/(?<![\w.])fetch\(/g)?.length ?? 0;
if (fetchCalls > MAX_EXTENSION_FETCH_CALLS) problems.push(`background.js has ${fetchCalls} fetch() calls, expected at most ${MAX_EXTENSION_FETCH_CALLS}`);
const cookieReads = [...background.matchAll(/cookies\.get\(\{[^}]*?name:\s*(?:"([^"]+)"|'([^']+)')/g)];
for (const [, double, single] of cookieReads) {
  const name = double ?? single;
  if (name !== 'c_user' && name !== 'i_user') problems.push(`background.js reads cookie ${name}`);
}
// A read whose name is computed would slip past the check above, so every call must match it.
const cookieCalls = background.match(/cookies\.get\(/g)?.length ?? 0;
if (cookieCalls === 0 || cookieCalls !== cookieReads.length) problems.push(`background.js has ${cookieCalls} cookies.get() calls but ${cookieReads.length} with a literal name`);

if (problems.length) {
  console.error('AUDIT FAILED\n' + [...new Set(problems)].map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Audit OK: ${files.length} files, permissions [${manifest.permissions}], hosts [${manifest.host_permissions}]`);
