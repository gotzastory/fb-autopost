import { startPoster } from '@/content/poster';
import { forwardConsole } from '@/lib/dev-log';

export default defineContentScript({
  matches: ['https://www.facebook.com/*'],
  runAt: 'document_idle',
  main() {
    // Content scripts can't reach the log server themselves, so the worker relays.
    if (import.meta.env.DEV) {
      forwardConsole('fb-tab', (entry) => void chrome.runtime.sendMessage({ type: 'DEV_LOG', entry }).catch(() => {}));
      // Relay for the MAIN-world post-response observer (src/content/post-response.js).
      window.addEventListener('message', (e) => {
        if (e.source === window && e.data?.source === 'AGP_DEV_LOG') console.info('[post-response]', e.data.text);
      });
    }
    startPoster();
  },
});
