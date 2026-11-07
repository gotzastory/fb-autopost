import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { send, type Profile } from '@/lib/types';
import '@/styles/app.css';

const isValidId = (id: unknown) => /^\d{5,}$/.test(String(id ?? '').trim()) && !/^0+$/.test(String(id).trim());

function Popup() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSeen, setLastSeen] = useState('—');

  const load = useCallback(async () => {
    const reply = await send({ type: 'GET_PROFILE' }).catch(() => undefined);
    const connected = reply?.success && isValidId(reply.profile?.id) ? reply.profile! : null;
    setProfile(connected);
    setChecking(false);
    setLastSeen(connected ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  const avatar = /^data:image\//i.test(String(profile?.avatar ?? '')) ? profile!.avatar : undefined;
  const openDashboard = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html'), active: true });
    window.close();
  };
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold">Auto Post FB</span>
        <span className={`badge badge-soft badge-sm font-bold ${!checking && !profile ? 'badge-error' : 'badge-success'}`}>{checking ? '● Checking…' : profile ? '● Connected' : '● Disconnected'}</span>
      </div>
      <div className="flex items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
        <div className="relative size-10 flex-none">
          <img className="size-10 rounded-full bg-base-200 object-cover" src={avatar} alt="" />
          {profile && <span className="absolute -right-px -bottom-px size-3 rounded-full border-2 border-base-100 bg-success" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{profile ? profile.name || 'Facebook Account' : 'Facebook no login'}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-base-content/60">{profile ? `UID: ${profile.id}` : 'Log in to Facebook to connect'}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 rounded-box bg-base-100 p-2.5"><span className="grid size-7 flex-none place-items-center rounded-lg bg-primary/10 font-extrabold text-primary">◉</span><div><b className="block text-xs">Keep Facebook logged in</b><small className="mt-0.5 block text-[10px] text-base-content/60">Keep your Facebook account logged in while posting.</small></div></div>
        <div className="flex items-center gap-2.5 rounded-box bg-base-100 p-2.5"><span className="grid size-7 flex-none place-items-center rounded-lg bg-secondary/10 font-extrabold text-secondary">♢</span><div><b className="block text-xs">Stays in your browser</b><small className="mt-0.5 block text-[10px] text-base-content/60">Talks only to Facebook. Heavy posting can still trigger Facebook limits.</small></div></div>
      </div>
      <button className="btn btn-primary" disabled={!profile} onClick={openDashboard}>Open Dashboard</button>
      <button className="btn btn-ghost btn-xs font-normal" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '↻  Refreshing…' : '↻   Refresh Connection'}</button>
      <div className="text-center text-[10px] text-success">• Last connection {lastSeen}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
