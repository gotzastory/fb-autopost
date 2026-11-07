import { useEffect, useRef, useState } from 'react';
import { hasDisplayName } from '@/lib/groups';
import { isFacebookUrl, summarize, type ProgressState } from '@/lib/progress';
import { spintaxAutoSpin, spintaxCreateAutoPlanner, validateSpintax } from '@/lib/spintax';
import type { Group, Identity, Profile } from '@/lib/types';
import { backgroundTextColor, MediaPreview } from './Composer';

const FALLBACK_COVER = chrome.runtime.getURL('assets/group-cover-fallback.svg');
const PREVIEW_LIMIT = 200;
const IDENTITY_AVATAR = 'grid flex-none place-items-center overflow-hidden rounded-full bg-base-200';
const IDENTITY_OPTION = 'btn btn-ghost h-auto w-full justify-start gap-2.5 px-2.5 py-2 font-normal';
const PROGRESS_GRID = 'grid grid-cols-[24px_minmax(0,1fr)_88px] gap-2.5 md:grid-cols-[28px_minmax(0,1fr)_120px]';

export function ProfileHeader({ profile }: { profile: Profile }) {
  const name = profile.name || 'Facebook Account';
  const uid = profile.id || '—';
  const avatar = /^data:image\//i.test(String(profile.avatar ?? '')) ? profile.avatar! : '';
  const open = () => {
    if (/^\d+$/.test(String(profile.id ?? ''))) void chrome.tabs.create({ url: `https://www.facebook.com/profile.php?id=${encodeURIComponent(profile.id!)}` });
  };
  return (
    <header className="navbar sticky top-0 z-10 min-h-14 border-b border-base-300 bg-base-100 px-5">
      <div className="flex-1"><b className="text-base">Auto Post FB</b></div>
      <div className="flex-none">
        <div className="flex items-center gap-2.5">
          <div className="relative size-10 flex-none">
            <button aria-label="Facebook profile" className="size-10 cursor-pointer rounded-full bg-base-200 bg-cover bg-center" id="profileAvatar" title={`${name} · UID: ${uid}`} style={{ backgroundImage: avatar ? `url("${avatar.replace(/"/g, '')}")` : 'none' }} onClick={open} />
            <span aria-hidden="true" className="pointer-events-none absolute -right-px -bottom-px size-3 rounded-full border-2 border-base-100 bg-success" />
          </div>
          <div className="flex max-w-44 min-w-0 flex-col">
            <b className="truncate text-xs leading-tight" id="dashboardProfileName">{name}</b>
            <small className="mt-0.5 font-mono text-[10px] whitespace-nowrap text-base-content/60" id="dashboardProfileId">UID: {uid}</small>
          </div>
        </div>
      </div>
    </header>
  );
}

function IdentityAvatar({ identity, fallback }: { identity: Identity; fallback: string }) {
  return identity.avatar ? <img className="size-full object-cover" src={identity.avatar} alt="" /> : <>{fallback}</>;
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
    <div className="relative mb-3 flex min-h-13 flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-200/40 p-2.5 sm:flex-nowrap" id="postingIdentityBox" ref={box}>
      <div className="text-xs font-semibold whitespace-nowrap text-base-content/60">Posting as</div>
      <button type="button" className="btn btn-sm h-9.5 max-w-full min-w-40 flex-1 justify-start gap-2 border-base-300 bg-base-100 px-2.5 font-normal sm:min-w-[230px] sm:flex-initial" id="postingIdentitySelect" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`${IDENTITY_AVATAR} size-6 text-sm`} id="postingIdentityAvatar"><IdentityAvatar identity={identity} fallback={identity.type === 'page' ? '🌿' : '👤'} /></span>
        <span className="min-w-0 flex-1 truncate text-left font-bold" id="postingIdentityName">{identity.name}</span>
        <span className="text-base-content/60">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-2.5 left-2.5 z-50 mt-1 max-h-90 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg sm:right-auto sm:left-[82px] sm:w-[min(390px,calc(100%-92px))]" id="postingIdentityMenu" role="listbox">
          <button type="button" className={`${IDENTITY_OPTION}${isActive(profileIdentity) ? ' btn-active' : ''}`} onClick={() => choose(profileIdentity)}>
            <span className={`${IDENTITY_AVATAR} size-8.5`}><IdentityAvatar identity={profileIdentity} fallback="👤" /></span>
            <span className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{profileIdentity.name}</b><small className="block text-xs text-base-content/60">Profile</small></span>
          </button>
          {others.length ? (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-wide text-base-content/60 uppercase">Pages</div>
              {others.map((p) => (
                <button key={p.id || p.name} type="button" className={`${IDENTITY_OPTION}${isActive(p) ? ' btn-active' : ''}`} onClick={() => choose(p)}>
                  <span className={`${IDENTITY_AVATAR} size-8.5`}><IdentityAvatar identity={p} fallback="🌿" /></span>
                  <span className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{p.name}</b></span>
                </button>
              ))}
            </>
          ) : (
            <div className="p-3 text-xs leading-normal text-base-content/60">Click ↻ to load your Facebook Pages.</div>
          )}
        </div>
      )}
      <button type="button" className="btn btn-square btn-sm size-9.5 flex-none border-base-300 bg-base-100 text-lg font-normal" id="postingIdentityRefresh" title="Refresh Facebook Pages" aria-label="Refresh Facebook Pages" disabled={refreshing} onClick={onRefresh}>↻</button>
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
    <div className="mb-4 rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <h2 className="mb-3.5 text-sm font-bold">Preview</h2>
      <div className="max-w-[590px]">
        <div className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-md">
          <div className="flex items-center gap-2.5 px-3.5 pt-2.5 pb-2">
            {identity.avatar ? <img alt="" className="size-10 rounded-full bg-base-200 object-cover" id="previewAvatar" src={identity.avatar} /> : <img alt="" className="size-10 rounded-full bg-base-200 object-cover" id="previewAvatar" />}
            <div className="min-w-0">
              <b className="block truncate text-[15px] leading-tight" id="previewAuthor">{identity.name}</b>
              <small className="mt-0.5 block" id="previewGroup">
                {groupCount === 0 ? <span className="badge border-0 bg-base-200 font-semibold">＋ Add groups</span> : <span className="badge border-0 bg-base-200 font-semibold">＋ {groupCount} {groupCount === 1 ? 'group' : 'groups'}</span>}
              </small>
            </div>
          </div>
          <div className={`whitespace-pre-wrap wrap-anywhere ${background ? 'min-h-[100px] px-4 py-3.5 text-center text-xl leading-snug font-semibold' : 'min-h-12 px-3 py-2 text-base leading-snug'}`} id="previewText" style={background ? { background, color: backgroundTextColor(background) } : undefined}>
            {!value && 'Your post preview will appear here.'}
            {value.length > PREVIEW_LIMIT && !expanded ? value.slice(0, PREVIEW_LIMIT) + ' ' : value}
            {value.length > PREVIEW_LIMIT && (
              <>
                {expanded && ' '}
                <button type="button" className={`ml-1 cursor-pointer font-bold hover:underline ${background ? 'underline underline-offset-2' : 'text-base-content/60'}`} onClick={() => setExpanded(!expanded)}>{expanded ? 'See less' : 'See more'}</button>
              </>
            )}
          </div>
          <MediaPreview files={files} />
          <div className="grid grid-cols-3 border-t border-base-300 px-1 py-2.5 text-center text-[13px] font-semibold text-base-content/60"><span>Like</span><span>Comment</span><span>Share</span></div>
        </div>
      </div>
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = { Success: 'badge-success', Pending: 'badge-warning', Failed: 'badge-error', Skipped: 'badge-neutral', STOP: 'badge-error' };
const LOG_STATE_CLASS: Record<string, string> = { success: 'text-success', error: 'text-error', stop: 'text-error', working: 'text-info', pending: 'text-warning' };
const LOG_LABEL: Record<string, string> = { success: 'Success', error: 'Failed', stop: 'STOP', working: 'Running...', pending: 'Pending' };

export function ProgressPanel({ progress }: { progress: ProgressState }) {
  const sum = summarize(progress);
  const events = useRef<HTMLDivElement>(null);
  useEffect(() => {
    events.current?.scrollTo({ top: events.current.scrollHeight });
  }, [progress.logs.length]);
  return (
    <div className="mt-4 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm" id="progressPanel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 text-base">
        <b>Activity log</b>
        <span id="progressText">
          <span className="font-bold text-success">{sum.success} success</span> · <span className="font-bold text-warning">{sum.pending} pending</span> · <span className="font-bold text-error">{sum.failed} failed</span>
          {sum.skipped > 0 && <> · <span className="font-bold text-base-content/60">{sum.skipped} skipped</span></>}
        </span>
      </div>
      <progress className="progress progress-primary mb-3.5 block w-full" id="progressFill" value={sum.percent} max={100} />
      <div className="overflow-hidden rounded-box border border-base-300">
        <div className={`${PROGRESS_GRID} border-b border-base-300 bg-base-200 px-3 py-2.5 text-xs font-bold text-base-content/60`}><span>#</span><span>Group</span><span className="text-right">Status</span></div>
        <div className="max-h-[300px] overflow-auto" id="progressRows">
          {progress.rows.map((r) => (
            <div key={r.id} className={`${PROGRESS_GRID} min-h-13.5 items-center border-b border-base-200 px-3 py-1 last:border-b-0`}>
              <span className="text-[11px] text-base-content/60 tabular-nums">{r.index}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold">{r.name}</div>
                {r.href ? <a className="block truncate text-[10px] font-semibold text-primary hover:underline" href={r.href} target="_blank" rel="noreferrer">{r.label}</a> : r.label && <small className="block truncate text-[10px] text-base-content/60">{r.label}</small>}
              </div>
              <span className={`badge badge-soft badge-sm justify-self-end font-bold ${STATUS_CLASS[r.status] ?? 'badge-info'}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 max-h-[170px] overflow-y-auto rounded-lg border border-base-200" id="progressEvents" ref={events}>
        {progress.logs.map((l) => (
          <div key={l.key} className={`grid min-h-9.5 grid-cols-[minmax(0,1fr)_78px] items-center gap-2.5 border-b border-dashed border-base-300 px-2.5 py-1.5 text-xs last:border-b-0 ${l.kind === 'complete' ? 'bg-success/5' : ''}`}>
            <span className={`min-w-0 truncate ${l.kind === 'group-start' ? 'font-bold' : 'text-base-content/80'}`}>
              {l.text}
              {l.url && isFacebookUrl(l.url) && <> <a className="ml-1.5 font-bold text-primary hover:underline" href={l.url} target="_blank" rel="noreferrer">{l.url}</a></>}
            </span>
            <span className={`text-right text-[11px] font-bold ${LOG_STATE_CLASS[l.state] ?? 'text-base-content/60'}`}>{LOG_LABEL[l.state] ?? '...'}</span>
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
    <aside className="order-first mb-4 min-w-0 self-start rounded-box border border-base-300 bg-base-100 p-3 shadow-sm lg:order-none">
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" id="search" placeholder="⌕  Search groups..." aria-label="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-soft btn-primary" id="exportGroups" onClick={onExport}>↓ CSV</button>
      </div>
      <div className="mt-3.5 flex items-center gap-2.5 text-xs text-base-content/60">
        <button className="btn btn-primary btn-xs"><span>All (<span id="allCount">{groups.length}</span>)</span></button>
        <button className="link link-primary no-underline" id="selectAll" onClick={() => onSelectMany(visible.map((g) => g.id))}>All</button>
        <span>|</span>
        <button className="link link-primary no-underline" id="clearAll" onClick={onClear}>Clear</button>
      </div>
      <div className="mt-2 flex justify-between border-y border-base-200 px-1 py-2.5 text-xs text-base-content/60">
        Selected{' '}
        <b className="whitespace-nowrap text-primary">
          {syncing ? (
            <span id="selectedCount" className="inline-flex items-center"><span className="loading loading-spinner loading-xs" aria-label="Syncing" /></span>
          ) : (
            <><span id="selectedCount">{selected.size}</span> / <span id="groupCount">{groups.length}</span></>
          )}
        </b>
      </div>
      <div className="max-h-[610px] overflow-x-hidden overflow-y-auto pb-7" id="groups">
        {visible.length === 0 && <div className="px-2.5 py-8 text-center text-base-content/60">No Facebook groups found. Click “Sync from Facebook”.</div>}
        {visible.map((g) => {
          const named = hasDisplayName(g);
          const name = named ? g.name : 'Resolving group name…';
          return (
            <div key={g.id} className="flex min-h-14 items-start gap-2.5 border-b border-base-200 px-1 pt-2.5 pb-3 hover:bg-base-200/60">
              <input className="checkbox checkbox-primary checkbox-sm mt-2.5 flex-none" type="checkbox" aria-label={name} checked={selected.has(g.id)} onChange={(e) => onToggle(g.id, e.target.checked)} />
              <div className="size-11 flex-none overflow-hidden rounded-lg bg-base-200">
                <img
                  className="block size-full object-cover"
                  src={g.cover || FALLBACK_COVER}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    if (e.currentTarget.src !== FALLBACK_COVER) e.currentTarget.src = FALLBACK_COVER;
                  }}
                />
              </div>
              <div className="min-w-0 flex-1 self-center">
                <a className="block leading-snug font-bold wrap-anywhere hover:text-primary hover:underline" href={g.url} target="_blank" rel="noreferrer" title={`Open ${name}`}>{name}</a>
                <small className="mt-0.5 block text-xs leading-tight text-base-content/60">{g.managed ? 'Managed Group' : 'Joined Group'}{named ? '' : ' · verifying name'}</small>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
