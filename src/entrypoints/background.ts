import { registerListeners } from '@/engine/listeners';
import { installWorkerDevLog } from '@/lib/dev-log';

export default defineBackground(() => {
  if (import.meta.env.DEV) installWorkerDevLog();
  registerListeners();
});
