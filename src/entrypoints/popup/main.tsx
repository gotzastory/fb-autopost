import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { send, type Profile } from '@/lib/types';
import './popup.css';

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
    <div className="popup">
      <div className="header">
        <div className="header-left"><span className="app-name">Auto Post FB</span></div>
        <span className={`connection${!checking && !profile ? ' offline' : ''}`}>{checking ? '● Checking…' : profile ? '● Connected' : '● Disconnected'}</span>
      </div>
      <div className="user-section">
        <div className="avatar-wrap">
          <img className={`avatar${avatar ? ' loaded' : ''}`} src={avatar} alt="" />
          {profile && <span className="online-dot" aria-hidden="true" />}
        </div>
        <div className="user-detail">
          <span className="name">{profile ? profile.name || 'Facebook Account' : 'Facebook no login'}</span>
          <span className="uid">{profile ? `UID: ${profile.id}` : 'Log in to Facebook to connect'}</span>
        </div>
      </div>
      <div className="info-card">
        <div className="info-row"><span className="info-icon blue">◉</span><div><b>Keep Facebook logged in</b><small>Keep your Facebook account logged in while posting.</small></div></div>
        <div className="info-row"><span className="info-icon purple">♢</span><div><b>Stays in your browser</b><small>Talks only to Facebook. Heavy posting can still trigger Facebook limits.</small></div></div>
      </div>
      <button className={`dashboard-btn${profile ? '' : ' disabled'}`} disabled={!profile} onClick={openDashboard}>Open Dashboard</button>
      <button className="refresh-btn" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '↻  Refreshing…' : '↻   Refresh Connection'}</button>
      <div className="footer"><span>• Last connection {lastSeen}</span></div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
