import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const FACEBOOK_HOSTS = 'https://*.facebook.com https://*.fbcdn.net https://*.fbsbx.com';
// Enforced by the browser for the service worker, dashboard and popup, whatever the code tries.
// Not applied in dev, where the hot-reload client must reach localhost.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${FACEBOOK_HOSTS}`,
  `img-src 'self' data: blob: ${FACEBOOK_HOSTS}`,
  "media-src 'self' data: blob:",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ command }) => ({
    name: 'Auto Post FB',
    description: 'Post to your Facebook groups from your own browser. Nothing is sent to any server other than Facebook.',
    icons: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: { default_icon: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } },
    // cookies: read-only c_user / i_user, to detect which account and Page is active.
    permissions: ['storage', 'scripting', 'activeTab', 'tabs', 'cookies'],
    host_permissions: ['*://*.facebook.com/*', '*://*.fbcdn.net/*', '*://*.fbsbx.com/*'],
    ...(command === 'build' && { content_security_policy: { extension_pages: CSP } }),
  }),
  // JS is unminified on purpose: the shipped extension stays readable, so it can be audited. CSS is minified.
  // esnext: functions passed to chrome.scripting are serialized and must not use helpers.
  vite: () => ({ plugins: [tailwindcss()], build: { minify: false, cssMinify: true, target: 'esnext' } }),
});
