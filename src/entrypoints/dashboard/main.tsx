import { createRoot } from 'react-dom/client';
import { App } from '@/dashboard/App';
import { send } from '@/lib/types';
import '@/dashboard/common.css';

// Closing or reloading this page stops all activity. The port's disconnect is the durable
// signal, so it opens here, once, outside React's lifecycle.
chrome.runtime.connect({ name: 'FBMP_SYNC_LIFELINE' });
const stopAll = () => void send({ type: 'STOP_ALL_ACTIVITY', reason: 'Dashboard page was reloaded or closed.' }).catch(() => {});
window.addEventListener('pagehide', stopAll, { capture: true });

createRoot(document.getElementById('root')!).render(<App />);
