import { registerListeners } from '@/engine/listeners';

export default defineBackground(() => {
  registerListeners();
});
