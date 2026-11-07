import { startPoster } from '@/content/poster';

export default defineContentScript({
  matches: ['https://www.facebook.com/*'],
  runAt: 'document_idle',
  main() {
    startPoster();
  },
});
