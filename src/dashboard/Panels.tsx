import { useEffect, useRef, useState } from 'react';
import { hasDisplayName } from '@/lib/groups';
import { isFacebookUrl, summarize, type ProgressState } from '@/lib/progress';
import { spintaxAutoSpin, spintaxCreateAutoPlanner, validateSpintax } from '@/lib/spintax';
import type { Group, Identity, Profile } from '@/lib/types';
import { backgroundTextColor, MediaPreview } from './Composer';

const FALLBACK_COVER = chrome.runtime.getURL('assets/group-cover-fallback.svg');
const PREVIEW_LIMIT = 200;

export function ProfileHeader({ profile }: { profile: Profile }) {
  const name = profile.name || 'Facebook Account';
  const uid = profile.id || '—';
  const avatar = /^data:image\//i.test(String(profile.avatar ?? '')) ? profile.avatar! : '';
  const open = () => {
    if (/^\d+$/.test(String(profile.id ?? ''))) void chrome.tabs.create({ url: `https://www.facebook.com/profile.php?id=${encodeURIComponent(profile.id!)}` });
  };
  return (
    <header className="sitebar">
      <div className="brand"><b>Auto Post FB</b></div>
      <div className="nav-actions">
        <div className="dashboard-profile">
          <div className="dashboard-profile-wrap">
            <button aria-label="Facebook profile" className="avatar" id="profileAvatar" title={`${name} · UID: ${uid}`} style={{ backgroundImage: avatar ? `url("${avatar.replace(/"/g, '')}")` : 'none' }} onClick={open} />
            <span aria-hidden="true" className="dashboard-online-dot" />
          </div>
          <div className="dashboard-profile-info">
            <b id="dashboardProfileName">{name}</b>
            <small id="dashboardProfileId">UID: {uid}</small>
          </div>
        </div>
      </div>
    </header>
  );
}

function IdentityAvatar({ identity, fallback }: { identity: Identity; fallback: string }) {
  return identity.avatar ? <img src={identity.avatar} alt="" /> : <>{fallback}</>;
}

export function IdentitySelector(props: {
  identity: Identity;
  profileIdentity: Identity;
  pages: Identity[];
  refreshing: boolean;
  onRefresh: () => void;
  onSwitch: (target: Identity) => void;
}) {
  const { identity, profileIdentity, pages, refreshing, onRefresh, onSwitch } = props;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  const choose = (target: Identity) => {
    setOpen(false);
    onSwitch(target);
  };
  const isActive = (x: Identity) => x.type === identity.type && x.name.toLocaleLowerCase() === identity.name.toLocaleLowerCase();
  const others = pages.filter((p) => p.name.toLocaleLowerCase() !== profileIdentity.name.toLocaleLowerCase());
  return (
    <div className="posting-identity" id="postingIdentityBox" ref={box}>
      <div className="posting-identity-label">Posting as</div>
      <button type="button" className="posting-identity-select" id="postingIdentitySelect" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="posting-identity-avatar" id="postingIdentityAvatar"><IdentityAvatar identity={identity} fallback={identity.type === 'page' ? '🌿' : '👤'} /></span>
        <span className="posting-identity-name" id="postingIdentityName">{identity.name}</span>
        <span className="posting-identity-chevron">▾</span>
      </button>
      {open && (
        <div className="posting-identity-menu" id="postingIdentityMenu" role="listbox">
          <button type="button" className={`posting-identity-option${isActive(profileIdentity) ? ' active' : ''}`} onClick={() => choose(profileIdentity)}>
            <IdentityAvatar identity={profileIdentity} fallback="👤" />
            <span className="posting-identity-option-copy"><b>{profileIdentity.name}</b><small>Profile</small></span>
          </button>
          {others.length ? (
            <>
              <div className="posting-identity-pages-label">Pages</div>
              {others.map((p) => (
                <button key={p.id || p.name} type="button" className={`posting-identity-option${isActive(p) ? ' active' : ''}`} onClick={() => choose(p)}>
                  <IdentityAvatar identity={p} fallback="🌿" />
                  <span className="posting-identity-option-copy"><b>{p.name}</b></span>
                </button>
              ))}
            </>
          ) : (
            <div className="posting-identity-empty">Click ↻ to load your Facebook Pages.</div>
          )}
        </div>
      )}
      <button type="button" className="posting-identity-refresh" id="postingIdentityRefresh" title="Refresh Facebook Pages" aria-label="Refresh Facebook Pages" disabled={refreshing} onClick={onRefresh}>↻</button>
    </div>
  );
}

function previewVariation(text: string, spintax: boolean): string {
  if (!spintax) return text;
  try {
    const v = validateSpintax(text);
    if (!v.valid) return text;
    const prepared = v.hasSpintax ? text : spintaxAutoSpin(text, 12).source;
    return prepared === text ? text : spintaxCreateAutoPlanner(prepared, 1).next('preview');
  } catch {
    return text;
  }
}

export function PostPreview(props: { identity: Identity; text: string; spintax: boolean; background: string; files: File[]; groupCount: number }) {
  const { identity, text, spintax, background, files, groupCount } = props;
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(text);
  useEffect(() => {
    setExpanded(false);
    setValue(previewVariation(text, spintax));
  }, [text, spintax]);
  return (
    <div className="panel">
      <h2>Preview</h2>
      <div className="preview-layout">
        <div className="fb-card">
          <div className="fb-head">
            {identity.avatar ? <img alt="" className="fb-avatar" id="previewAvatar" src={identity.avatar} /> : <img alt="" className="fb-avatar" id="previewAvatar" />}
            <div>
              <b id="previewAuthor">{identity.name}</b>
              <small id="previewGroup">
                {groupCount === 0 ? <span className="preview-group-pill preview-add-groups">＋ Add groups</span> : <span className="preview-group-pill">＋ {groupCount} {groupCount === 1 ? 'group' : 'groups'}</span>}
              </small>
            </div>
          </div>
          <div className={`fb-text${background ? ' has-bg' : ''}`} id="previewText" style={background ? { background, color: backgroundTextColor(background) } : undefined}>
            {!value && 'Your post preview will appear here.'}
            {value.length > PREVIEW_LIMIT && !expanded ? value.slice(0, PREVIEW_LIMIT) + ' ' : value}
            {value.length > PREVIEW_LIMIT && (
              <>
                {expanded && ' '}
                <button type="button" className="see-more-btn" onClick={() => setExpanded(!expanded)}>{expanded ? 'See less' : 'See more'}</button>
              </>
            )}
          </div>
          <MediaPreview files={files} />
          <div className="fb-actions"><span>Like</span><span>Comment</span><span>Share</span></div>
        </div>
      </div>
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = { Success: 'success', Pending: 'pending', Failed: 'error', Skipped: 'skipped', STOP: 'error' };
const LOG_LABEL: Record<string, string> = { success: 'Success', error: 'Failed', stop: 'STOP', working: 'Running...', pending: 'Pending' };

export function ProgressPanel({ progress }: { progress: ProgressState }) {
  const sum = summarize(progress);
  const events = useRef<HTMLDivElement>(null);
  useEffect(() => {
    events.current?.scrollTo({ top: events.current.scrollHeight });
  }, [progress.logs.length]);
  return (
    <div className="progress-panel" id="progressPanel">
      <div className="progress-head">
        <b>Activity log</b>
        <span id="progressText">
          <span className="summary-published">{sum.success} success</span> · <span className="summary-pending">{sum.pending} pending</span> · <span className="summary-failed">{sum.failed} failed</span>
          {sum.skipped > 0 && <> · <span className="summary-skipped">{sum.skipped} skipped</span></>}
        </span>
      </div>
      <div className="progress-track"><div id="progressFill" style={{ width: `${sum.percent}%` }} /></div>
      <div className="progress-table">
        <div className="progress-table-head"><span>#</span><span>Group</span><span>Status</span></div>
        <div className="progress-rows" id="progressRows">
          {progress.rows.map((r) => (
            <div key={r.id} className="progress-row">
              <span className="progress-index">{r.index}</span>
              <div className="progress-group-cell">
                <div className="progress-name-line"><span className="progress-name">{r.name}</span></div>
                {r.href ? <a className="progress-detail-link" href={r.href} target="_blank" rel="noreferrer">{r.label}</a> : r.label && <small>{r.label}</small>}
              </div>
              <span className={`progress-status ${STATUS_CLASS[r.status] ?? 'working'}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="progress-events" id="progressEvents" ref={events}>
        {progress.logs.map((l) => (
          <div key={l.key} className={`progress-log ${l.kind}`}>
            <span className="progress-log-text">
              {l.text}
              {l.url && isFacebookUrl(l.url) && <> <a className="post-link" href={l.url} target="_blank" rel="noreferrer">{l.url}</a></>}
            </span>
            <span className={`progress-log-state ${l.state}`}>{LOG_LABEL[l.state] ?? '...'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupsPanel(props: {
  groups: Group[];
  selected: Set<string>;
  syncing: boolean;
  onToggle: (id: string, on: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onClear: () => void;
  onExport: () => void;
}) {
  const { groups, selected, syncing, onToggle, onSelectMany, onClear, onExport } = props;
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visible = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  return (
    <aside className="panel groups-panel">
      <div className="search-row">
        <input id="search" placeholder="⌕  Search groups..." aria-label="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="tool-btn" id="exportGroups" onClick={onExport}>↓ CSV</button>
      </div>
      <div className="tabs">
        <button className="tab active">All (<span id="allCount">{groups.length}</span>)</button>
        <button className="link-btn" id="selectAll" onClick={() => onSelectMany(visible.map((g) => g.id))}>All</button>
        <span>|</span>
        <button className="link-btn" id="clearAll" onClick={onClear}>Clear</button>
      </div>
      <div className="selected-row">
        Selected{' '}
        <b>
          {syncing ? (
            <span id="selectedCount" className="sync-count-loading"><span className="sync-count-spinner" aria-label="Syncing" /></span>
          ) : (
            <><span id="selectedCount">{selected.size}</span> / <span id="groupCount">{groups.length}</span></>
          )}
        </b>
      </div>
      <div className="group-list" id="groups">
        {visible.length === 0 && <div className="empty">No Facebook groups found. Click “Sync from Facebook”.</div>}
        {visible.map((g) => {
          const named = hasDisplayName(g);
          const name = named ? g.name : 'Resolving group name…';
          return (
            <div key={g.id} className="group-row">
              <input type="checkbox" aria-label={name} checked={selected.has(g.id)} onChange={(e) => onToggle(g.id, e.target.checked)} />
              <div className="group-cover-wrap">
                <img
                  className="group-cover"
                  src={g.cover || FALLBACK_COVER}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    if (e.currentTarget.src !== FALLBACK_COVER) e.currentTarget.src = FALLBACK_COVER;
                  }}
                />
              </div>
              <div className="group-info">
                <a className="group-name" href={g.url} target="_blank" rel="noreferrer" title={`Open ${name}`}>{name}</a>
                <small>{g.managed ? 'Managed Group' : 'Joined Group'}{named ? '' : ' · verifying name'}</small>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
