import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LangToggle, useT } from '@/lib/i18n';
import { send, type Profile } from '@/lib/types';
import { Icon } from '@/dashboard/Icon';
import '@/styles/app.css';

const isValidId = (id: unknown) => /^\d{5,}$/.test(String(id ?? '').trim()) && !/^0+$/.test(String(id).trim());

function Popup() {
  const t = useT();
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

  const state = checking ? 'checking' : profile ? 'connected' : 'disconnected';
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-accent text-accent-content"><Icon name="send" className="size-3.5" /></span>
        <span className="flex-1 text-base font-bold">Auto Post FB</span>
        <LangToggle />
      </div>
      <div className="rounded-box border border-base-300 bg-base-100 p-3">
        <div className="flex items-center gap-3">
          <img className="size-11 flex-none rounded-full bg-base-200 object-cover" src={avatar} alt="" />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{profile ? profile.name || t('Facebook Account') : t('Facebook no login')}</span>
            <span className="block text-xs text-base-content/70 tabular-nums">{profile ? `UID: ${profile.id}` : t('Log in to Facebook to connect')}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-base-300 pt-2.5 text-xs">
          <span className={`flex items-center gap-1.5 font-semibold ${state === 'connected' ? 'text-success' : state === 'disconnected' ? 'text-error' : 'text-base-content/70'}`}>
            <span aria-hidden="true" className="size-2 rounded-full bg-current" />
            {state === 'checking' ? t('Checking…') : state === 'connected' ? t('Connected') : t('Disconnected')}
          </span>
          <span className="text-base-content/70 tabular-nums">{t('Last connection')} {lastSeen}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5 px-1">
        <li className="flex gap-2.5">
          <Icon name="userCheck" className="mt-0.5 size-4 text-primary" />
          <div><b className="block text-xs">{t('Keep Facebook logged in')}</b><span className="block text-xs text-base-content/70">{t('Keep your Facebook account logged in while posting.')}</span></div>
        </li>
        <li className="flex gap-2.5">
          <Icon name="shield" className="mt-0.5 size-4 text-primary" />
          <div><b className="block text-xs">{t('Stays in your browser')}</b><span className="block text-xs text-base-content/70">{t('Talks only to Facebook. Heavy posting can still trigger Facebook limits.')}</span></div>
        </li>
      </ul>
      <button className="btn btn-primary" disabled={!profile} onClick={openDashboard}>{t('Open Dashboard')}</button>
      <button className="btn btn-ghost btn-sm font-normal" disabled={refreshing} onClick={() => void refresh()}>
        <Icon name="refresh" className={`size-4${refreshing ? ' animate-spin' : ''}`} />
        {refreshing ? t('Refreshing…') : t('Refresh connection')}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
