import { startPageNetworkHook } from '@/content/network-hook';

export default defineContentScript({
  matches: ['https://www.facebook.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    startPageNetworkHook();
  },
});
