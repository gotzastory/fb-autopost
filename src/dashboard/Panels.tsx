import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hasDisplayName } from '@/lib/groups';
import { LangToggle, useT, type Key } from '@/lib/i18n';
import { isFacebookUrl, summarize, type ProgressState } from '@/lib/progress';
import { spintaxAutoSpin, spintaxCreateAutoPlanner, validateSpintax } from '@/lib/spintax';
import type { Group, Identity, Profile } from '@/lib/types';
import { backgroundTextColor, MediaPreview } from './Composer';
import { Icon } from './Icon';

const FALLBACK_COVER = chrome.runtime.getURL('assets/group-cover-fallback.svg');
const PREVIEW_LIMIT = 200;
const IDENTITY_AVATAR =
  'grid flex-none place-items-center overflow-hidden rounded-full bg-base-200 text-base-content/60';
const IDENTITY_OPTION = 'btn btn-ghost h-auto w-full justify-start gap-2.5 px-2.5 py-2 font-normal';
const PROGRESS_GRID =
  'grid grid-cols-[28px_minmax(0,1fr)_96px] gap-2.5 md:grid-cols-[32px_minmax(0,1fr)_120px]';

export function ProfileHeader({ profile }: { profile: Profile }) {
  const t = useT();
  const name = profile.name || t('Facebook Account');
  const uid = profile.id || '—';
  const avatar = /^data:image\//i.test(String(profile.avatar ?? '')) ? profile.avatar! : '';
  const open = () => {
    if (/^\d+$/.test(String(profile.id ?? '')))
      void chrome.tabs.create({
        url: `https://www.facebook.com/profile.php?id=${encodeURIComponent(profile.id!)}`,
      });
  };
  return (
    <header className="navbar sticky top-0 z-10 min-h-14 border-b border-base-300 bg-base-100 px-4 sm:px-6">
      <div className="flex flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-lg bg-accent text-accent-content"
        >
          <Icon name="send" className="size-4" />
        </span>
        <b className="text-base">Auto Post FB</b>
      </div>
      <div className="flex flex-none items-center gap-3">
        <LangToggle />
        <div className="flex items-center gap-2.5">
          <div className="relative size-10 flex-none">
            <button
              aria-label={t('Facebook profile')}
              className="size-10 cursor-pointer rounded-full bg-base-200 bg-cover bg-center"
              id="profileAvatar"
              title={`${name} · UID: ${uid}`}
              style={{ backgroundImage: avatar ? `url("${avatar.replace(/"/g, '')}")` : 'none' }}
              onClick={open}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-px -bottom-px size-3 rounded-full border-2 border-base-100 bg-success"
            />
          </div>
          <div className="flex max-w-44 min-w-0 flex-col">
            <b className="truncate text-sm" id="dashboardProfileName">
              {name}
            </b>
            <small
              className="text-xs whitespace-nowrap text-base-content/70 tabular-nums"
              id="dashboardProfileId"
            >
              UID: {uid}
            </small>
          </div>
        </div>
      </div>
    </header>
  );
}

function IdentityAvatar({ identity }: { identity: Identity }) {
  return identity.avatar ? (
    <img className="size-full object-cover" src={identity.avatar} alt="" />
  ) : (
    <Icon name={identity.type === 'page' ? 'flag' : 'user'} className="size-1/2" />
  );
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
  const t = useT();
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
  const isActive = (x: Identity) =>
    x.type === identity.type && x.name.toLocaleLowerCase() === identity.name.toLocaleLowerCase();
  const others = pages.filter((p) => p.name.toLocaleLowerCase() !== profileIdentity.name.toLocaleLowerCase());
  return (
    <div
      className="relative mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap"
      id="postingIdentityBox"
      ref={box}
    >
      <div className="text-sm whitespace-nowrap text-base-content/70">{t('Posting as')}</div>
      <button
        type="button"
        className="btn btn-sm h-10 max-w-full min-w-40 flex-1 justify-start gap-2 border-base-300 bg-base-100 px-2.5 font-normal sm:min-w-[240px] sm:flex-initial"
        id="postingIdentitySelect"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`${IDENTITY_AVATAR} size-6 text-sm`} id="postingIdentityAvatar">
          <IdentityAvatar identity={identity} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-bold" id="postingIdentityName">
          {identity.name}
        </span>
        <Icon name="chevronDown" className="size-4 text-base-content/60" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-90 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg sm:right-auto sm:w-[min(390px,100%)]"
          id="postingIdentityMenu"
          role="listbox"
        >
          <button
            type="button"
            className={`${IDENTITY_OPTION}${isActive(profileIdentity) ? ' btn-active' : ''}`}
            onClick={() => choose(profileIdentity)}
          >
            <span className={`${IDENTITY_AVATAR} size-8.5`}>
              <IdentityAvatar identity={profileIdentity} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <b className="block truncate text-sm">{profileIdentity.name}</b>
              <small className="block text-xs text-base-content/70">{t('Profile')}</small>
            </span>
          </button>
          {others.length ? (
            <>
              <div className="px-2.5 pt-2 pb-1 text-xs font-semibold text-base-content/70">{t('Pages')}</div>
              {others.map((p) => (
                <button
                  key={p.id || p.name}
                  type="button"
                  className={`${IDENTITY_OPTION}${isActive(p) ? ' btn-active' : ''}`}
                  onClick={() => choose(p)}
                >
                  <span className={`${IDENTITY_AVATAR} size-8.5`}>
                    <IdentityAvatar identity={p} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <b className="block truncate text-sm">{p.name}</b>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <div className="p-3 text-xs text-base-content/70">
              {t('Press the refresh button to load your Facebook Pages.')}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn btn-square btn-sm size-10 flex-none border-base-300 bg-base-100"
        id="postingIdentityRefresh"
        title={t('Refresh Facebook Pages')}
        aria-label={t('Refresh Facebook Pages')}
        disabled={refreshing}
        onClick={onRefresh}
      >
        <Icon name="refresh" className={`size-4${refreshing ? ' animate-spin' : ''}`} />
      </button>
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

export function PostPreview(props: {
  identity: Identity;
  text: string;
  spintax: boolean;
  background: string;
  files: File[];
  groupCount: number;
}) {
  const { identity, text, spintax, background, files, groupCount } = props;
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(text);
  useEffect(() => {
    setExpanded(false);
    setValue(previewVariation(text, spintax));
  }, [text, spintax]);
  return (
    <div className="mb-5 rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="mb-3 text-base font-semibold">{t('Preview')}</h2>
      <div className="max-w-[590px]">
        <div className="overflow-hidden rounded-lg border border-[#dadde1] bg-white font-[system-ui,'Segoe_UI',Helvetica,Arial,sans-serif] text-[#050505] shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2.5 px-3.5 pt-2.5 pb-2">
            {identity.avatar ? (
              <img
                alt=""
                className="size-10 rounded-full bg-[#f0f2f5] object-cover"
                id="previewAvatar"
                src={identity.avatar}
              />
            ) : (
              <img alt="" className="size-10 rounded-full bg-[#f0f2f5] object-cover" id="previewAvatar" />
            )}
            <div className="min-w-0">
              <b className="block truncate text-[15px]" id="previewAuthor">
                {identity.name}
              </b>
              <small className="mt-0.5 block" id="previewGroup">
                {groupCount === 0 ? (
                  <span className="badge border-0 bg-[#f0f2f5] font-semibold text-[#65676b]">
                    {t('＋ Add groups')}
                  </span>
                ) : (
                  <span className="badge border-0 bg-[#f0f2f5] font-semibold text-[#65676b]">
                    ＋ {groupCount} {t(groupCount === 1 ? 'group' : 'groups')}
                  </span>
                )}
              </small>
            </div>
          </div>
          <div
            className={`whitespace-pre-wrap wrap-anywhere ${background ? 'min-h-[100px] px-4 py-3.5 text-center text-xl leading-normal font-semibold' : 'min-h-12 px-3 py-2 text-[15px] leading-normal'}`}
            id="previewText"
            style={background ? { background, color: backgroundTextColor(background) } : undefined}
          >
            {!value && t('Your post preview will appear here.')}
            {value.length > PREVIEW_LIMIT && !expanded ? value.slice(0, PREVIEW_LIMIT) + ' ' : value}
            {value.length > PREVIEW_LIMIT && (
              <>
                {expanded && ' '}
                <button
                  type="button"
                  className={`ml-1 cursor-pointer font-bold hover:underline ${background ? 'underline underline-offset-2' : 'text-[#65676b]'}`}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? t('See less') : t('See more')}
                </button>
              </>
            )}
          </div>
          <MediaPreview files={files} />
          <div className="grid grid-cols-3 border-t border-[#ced0d4] px-1 py-2.5 text-center text-[15px] font-semibold text-[#65676b]">
            <span>{t('Like')}</span>
            <span>{t('Comment')}</span>
            <span>{t('Share')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  Success: 'badge-success',
  Pending: 'badge-warning',
  Failed: 'badge-error',
  Skipped: 'badge-neutral',
  STOP: 'badge-error',
};
const LOG_STATE_CLASS: Record<string, string> = {
  success: 'text-success',
  error: 'text-error',
  stop: 'text-error',
  working: 'text-info',
  pending: 'text-warning',
};
const LOG_LABEL: Record<string, Key> = {
  success: 'Success',
  error: 'Failed',
  stop: 'STOP',
  working: 'Running...',
  pending: 'Pending',
};

export function ProgressPanel({ progress }: { progress: ProgressState }) {
  const t = useT();
  const sum = summarize(progress);
  const events = useRef<HTMLDivElement>(null);
  useEffect(() => {
    events.current?.scrollTo({ top: events.current.scrollHeight });
  }, [progress.logs.length]);
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-5" id="progressPanel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 text-base">
        <h2 className="font-semibold">{t('Activity log')}</h2>
        <span className="flex flex-wrap gap-x-4 text-sm tabular-nums" id="progressText">
          <span className="font-semibold text-success">
            {sum.success} {t('success')}
          </span>
          <span className="font-semibold text-warning">
            {sum.pending} {t('pending')}
          </span>
          <span className="font-semibold text-error">
            {sum.failed} {t('failed')}
          </span>
          {sum.skipped > 0 && (
            <span className="font-semibold text-base-content/70">
              {sum.skipped} {t('skipped')}
            </span>
          )}
        </span>
      </div>
      <progress
        className="progress progress-accent mb-4 block w-full"
        id="progressFill"
        value={sum.percent}
        max={100}
      />
      <div className="overflow-hidden rounded-box border border-base-300">
        <div
          className={`${PROGRESS_GRID} border-b border-base-300 bg-base-200 px-3 py-2 text-xs font-semibold text-base-content/70`}
        >
          <span>#</span>
          <span>{t('Group')}</span>
          <span className="text-right">{t('Status')}</span>
        </div>
        <div className="max-h-[300px] overflow-auto" id="progressRows">
          {progress.rows.map((r) => (
            <div
              key={r.id}
              className={`${PROGRESS_GRID} min-h-13.5 items-center border-b border-base-200 px-3 py-1 last:border-b-0`}
            >
              <span className="text-xs text-base-content/70 tabular-nums">{r.index}</span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{r.name}</div>
                {r.href ? (
                  <a
                    className="block truncate text-xs font-medium text-primary hover:underline"
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.label}
                  </a>
                ) : (
                  r.label && <small className="block truncate text-xs text-base-content/70">{r.label}</small>
                )}
              </div>
              <span
                className={`badge badge-soft badge-sm justify-self-end font-semibold ${STATUS_CLASS[r.status] ?? 'badge-info'}`}
              >
                {t(r.status as Key)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-2.5 max-h-[170px] overflow-y-auto rounded-lg border border-base-200"
        id="progressEvents"
        ref={events}
      >
        {progress.logs.map((l) => (
          <div
            key={l.key}
            className={`grid min-h-9.5 grid-cols-[minmax(0,1fr)_78px] items-center gap-2.5 border-b border-dashed border-base-300 px-2.5 py-1.5 text-xs last:border-b-0 ${l.kind === 'complete' ? 'bg-success/10' : ''}`}
          >
            <span
              className={`min-w-0 truncate ${l.kind === 'group-start' ? 'font-semibold' : 'text-base-content/80'}`}
            >
              {l.text}
              {l.url && isFacebookUrl(l.url) && (
                <>
                  {' '}
                  <a
                    className="ml-1.5 font-bold text-primary hover:underline"
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {l.url}
                  </a>
                </>
              )}
            </span>
            <span
              className={`text-right text-xs font-semibold ${LOG_STATE_CLASS[l.state] ?? 'text-base-content/70'}`}
            >
              {Object.hasOwn(LOG_LABEL, l.state) ? t(LOG_LABEL[l.state]!) : '...'}
            </span>
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
  /** The manual "add by URL" form, owned by App. */
  children?: ReactNode;
}) {
  const { groups, selected, syncing, onToggle, onSelectMany, onClear, onExport, children } = props;
  const t = useT();
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visible = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  return (
    <aside className="order-first min-w-0 self-start rounded-box border border-base-300 bg-base-100 lg:sticky lg:top-20 lg:order-none">
      <div className="flex flex-col gap-3 border-b border-base-300 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">{t('Your groups')}</h2>
          <span className="text-sm text-base-content/70">
            {t('Selected')}{' '}
            <b className="whitespace-nowrap text-primary tabular-nums">
              {syncing ? (
                <span id="selectedCount" className="inline-flex items-center align-middle">
                  <span className="loading loading-spinner loading-xs" aria-label={t('Syncing')} />
                </span>
              ) : (
                <>
                  <span id="selectedCount">{selected.size}</span> /{' '}
                  <span id="groupCount">{groups.length}</span>
                </>
              )}
            </b>
          </span>
        </div>
        <div className="flex gap-2">
          <label className="input input-sm min-w-0 flex-1">
            <Icon name="search" className="size-4 text-base-content/60" />
            <input
              id="search"
              type="search"
              placeholder={t('Search groups')}
              aria-label={t('Search groups')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="btn btn-sm btn-ghost" id="exportGroups" onClick={onExport}>
            <Icon name="download" />
            CSV
          </button>
        </div>
        <div>{children}</div>
        <div className="flex items-center justify-between gap-2 text-xs text-base-content/70">
          <span>
            {t('All groups')} (
            <span id="allCount" className="tabular-nums">
              {groups.length}
            </span>
            )
          </span>
          <span className="flex items-center gap-1">
            <button
              className="btn btn-ghost btn-xs text-primary"
              id="selectAll"
              onClick={() => onSelectMany(visible.map((g) => g.id))}
            >
              {t('Select all shown')}
            </button>
            <button className="btn btn-ghost btn-xs" id="clearAll" onClick={onClear}>
              {t('Clear')}
            </button>
          </span>
        </div>
      </div>
      <div
        className="max-h-[610px] overflow-x-hidden overflow-y-auto p-1.5 lg:max-h-[calc(100dvh-25rem)] lg:min-h-60"
        id="groups"
      >
        {visible.length === 0 && (
          <div className="px-4 py-10 text-center text-base-content/70">
            {t('No Facebook groups found. Click “Sync from Facebook”.')}
          </div>
        )}
        {visible.map((g) => {
          const named = hasDisplayName(g);
          const name = named ? g.name : t('Resolving group name…');
          return (
            <label
              key={g.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-base-200 has-checked:bg-primary/8"
            >
              <input
                className="checkbox checkbox-primary checkbox-sm flex-none"
                type="checkbox"
                aria-label={name}
                checked={selected.has(g.id)}
                onChange={(e) => onToggle(g.id, e.target.checked)}
              />
              <div className="size-10 flex-none overflow-hidden rounded-md bg-base-200">
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
              <div className="min-w-0 flex-1">
                <a
                  className="block font-semibold wrap-anywhere hover:text-primary hover:underline"
                  href={g.url}
                  target="_blank"
                  rel="noreferrer"
                  title={t('Open {name}', { name })}
                >
                  {name}
                </a>
                <small className="block text-xs text-base-content/70">
                  {t(g.managed ? 'Managed Group' : 'Joined Group')}
                  {named ? '' : t(' · verifying name')}
                </small>
              </div>
            </label>
          );
        })}
      </div>
    </aside>
  );
}
