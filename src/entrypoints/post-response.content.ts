import { startPostResponseObserver } from '@/content/post-response';

export default defineContentScript({
  matches: ['https://www.facebook.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    startPostResponseObserver();
  },
});
