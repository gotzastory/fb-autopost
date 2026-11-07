import { useEffect, useMemo, useRef, useState } from 'react';
import { BG_DECORATIVE, BG_GRADIENTS, BG_SOLIDS, EMOJIS } from '@/lib/composer-data';
import { useT, type Key } from '@/lib/i18n';
import { Icon } from './Icon';

const MAX_BACKGROUND_CHARS = 130;

export const backgroundAllowed = (text: string, mediaCount: number) =>
  text.length <= MAX_BACKGROUND_CHARS && !/[\r\n]/.test(text) && mediaCount === 0;

/** Picks dark or light text from the average luminance of the colors in a CSS background. */
export function backgroundTextColor(bg: string): string {
  if (!bg) return '#172033';
  const hexes = [...bg.matchAll(/#([0-9a-f]{3,8})/gi)].map((m) => m[1]!.slice(0, 6));
  if (!hexes.length) return '#ffffff';
  const luminance = hexes.map((h) => {
    const x = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return (
      0.2126 * parseInt(x.slice(0, 2), 16) +
      0.7152 * parseInt(x.slice(2, 4), 16) +
      0.0722 * parseInt(x.slice(4, 6), 16)
    );
  });
  return luminance.reduce((a, b) => a + b, 0) / luminance.length > 178 ? '#172033' : '#ffffff';
}

const POPOVER_HEAD = 'flex h-12 items-center justify-between border-b border-base-300 px-3.5 text-base';
const CLOSE_BTN = 'btn btn-square btn-ghost btn-sm';
const BG_TILE =
  'aspect-square min-h-14 w-full cursor-pointer rounded-lg border border-black/10 hover:outline-2 hover:outline-offset-2 hover:outline-primary/50';
const SECTION_TITLE = 'mb-2.5 text-sm font-semibold';

const EMOJI_TABS: [string, string][] = [
  ['smileys', '😀'],
  ['people', '👋'],
  ['animals', '🐶'],
  ['food', '🍔'],
  ['travel', '🚗'],
  ['objects', '💡'],
  ['symbols', '❤️'],
  ['flags', '🏳️'],
];

function backgroundTitle(text: string, hasMedia: boolean): [Key, Record<string, number>?] {
  if (hasMedia) return ['Background color is available only for text-only posts'];
  if (text.length > MAX_BACKGROUND_CHARS)
    return ['Background color is limited to {n} characters', { n: MAX_BACKGROUND_CHARS }];
  if (/[\r\n]/.test(text)) return ['Background color is unavailable when the post contains line breaks'];
  return ['Choose background color'];
}

function useObjectUrls(files: File[]) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function MediaPreview({ files }: { files: File[] }) {
  const urls = useObjectUrls(files);
  return (
    <div className="grid grid-cols-2 gap-1" id="previewMedia">
      {files.map((f, i) =>
        f.type.startsWith('image/') ? (
          <img
            key={urls[i]}
            src={urls[i]}
            alt=""
            className="aspect-square w-full rounded-[10px] object-cover"
          />
        ) : (
          <div key={urls[i]} className="relative col-span-full min-w-0 overflow-hidden rounded-xl bg-black">
            <video
              src={urls[i]}
              controls
              muted
              playsInline
              preload="metadata"
              className="block aspect-video w-full object-contain"
            />
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-2xl text-white shadow-lg"
              aria-hidden="true"
            >
              ▶
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function BackgroundPicker({ onPick, onClose }: { onPick: (bg: string) => void; onClose: () => void }) {
  const t = useT();
  const tiles = (items: string[]) =>
    items.map((bg) => (
      <button
        key={bg}
        type="button"
        className={BG_TILE}
        title={t('Choose background')}
        aria-label={t('Choose background')}
        style={{ background: bg }}
        onClick={() => onPick(bg)}
      />
    ));
  return (
    <div
      className="absolute bottom-14 left-0 z-30 max-h-[520px] w-full max-w-[620px] overflow-auto rounded-box border border-base-300 bg-base-100 shadow-lg"
      id="colorPanel"
    >
      <div className={POPOVER_HEAD}>
        <b>{t('Choose background')}</b>
        <button aria-label={t('Close')} className={CLOSE_BTN} type="button" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="px-4 pt-3.5 pb-2">
        <h3 className={SECTION_TITLE}>{t('Decorative')}</h3>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
          <button
            type="button"
            className={`${BG_TILE} relative bg-base-200 before:absolute before:top-1/2 before:left-1/3 before:h-[3px] before:w-1/3 before:-rotate-45 before:rounded before:bg-base-content/50`}
            title={t('No background')}
            aria-label={t('No background')}
            onClick={() => onPick('')}
          />
          {tiles(BG_DECORATIVE)}
        </div>
      </div>
      <div className="px-4 pt-3.5 pb-2">
        <h3 className={SECTION_TITLE}>{t('Gradient')}</h3>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">{tiles(BG_GRADIENTS)}</div>
      </div>
      <div className="px-4 pt-3.5 pb-5">
        <h3 className={SECTION_TITLE}>{t('Solid')}</h3>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">{tiles(BG_SOLIDS)}</div>
      </div>
    </div>
  );
}

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const t = useT();
  const [category, setCategory] = useState('smileys');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const items = (q ? Object.values(EMOJIS).join(' ') : (EMOJIS[category] ?? ''))
    .split(' ')
    .filter((e) => e && (!q || e.toLowerCase().includes(q)));
  return (
    <div
      className="absolute bottom-14 left-0 z-30 max-h-[520px] w-[390px] max-w-full overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg"
      id="emojiPicker"
    >
      <div className={POPOVER_HEAD}>
        <b>{t('Emoji')}</b>
        <button aria-label={t('Close')} className={CLOSE_BTN} type="button" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <label className="input input-sm mx-3 mt-2.5 mb-2 flex w-auto">
        <Icon name="search" className="size-4 text-base-content/60" />
        <input
          id="emojiSearch"
          placeholder={t('Search emoji')}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('Search emoji')}
        />
      </label>
      <div className="flex gap-0.5 overflow-auto border-b border-base-300 px-2 pb-2">
        {EMOJI_TABS.map(([cat, icon]) => (
          <button
            key={cat}
            type="button"
            className={`btn btn-ghost btn-square btn-sm flex-none text-lg font-normal${cat === category ? ' btn-active' : ''}`}
            aria-label={cat}
            onClick={() => setCategory(cat)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="grid max-h-[330px] grid-cols-8 gap-0.5 overflow-auto p-2.5" id="emojiGrid">
        {items.map((e, i) => (
          <button
            key={`${e}${i}`}
            type="button"
            className="h-9.5 cursor-pointer rounded-lg text-2xl hover:bg-base-200"
            title={e}
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpintaxInfo({ onClose }: { onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      aria-labelledby="spintaxInfoTitle"
      aria-modal="true"
      className="modal modal-open"
      role="dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box p-0">
        <div className={POPOVER_HEAD}>
          <b id="spintaxInfoTitle">{t('About Spintax')}</b>
          <button aria-label={t('Close')} className={CLOSE_BTN} type="button" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-5 leading-relaxed text-base-content/80 [&_code]:font-mono">
          <p className="mb-3">
            <b>Spintax</b>{' '}
            {t(
              'lets you write several interchangeable versions inside one post. With Spintax ON and no choices written, Auto-Spin uses only the safe vocabulary. With Spintax OFF, the text is posted exactly as entered.',
            )}
          </p>
          <div className="my-3 flex flex-col gap-1 rounded-lg border border-base-300 bg-base-200 px-3 py-2.5">
            <code>{'{Hello|Hi|Hey} everyone!'}</code>
            <span>{t('→ one option is selected for each group.')}</span>
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {t('Use')} <code>{'{option1|option2|option3}'}</code> {t('for multiple choices.')}
            </li>
            <li>{t('Different choice blocks can be combined to create more variations.')}</li>
            <li>
              {t('Nested Spintax is supported, for example')} <code>{'{Hi {there|everyone}|Hello}'}</code>
            </li>
            <li>
              {t('Empty choices are allowed, such as')} <code>{'{|extra}'}</code>
            </li>
            <li>
              {t(
                'Auto-Spin leaves URLs, names, prices, numbers, dates, hashtags, mentions and emojis unchanged.',
              )}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Composer(props: {
  text: string;
  onText: (t: string) => void;
  background: string;
  onBackground: (bg: string) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  spintax: boolean;
  onSpintax: (on: boolean) => void;
}) {
  const { text, onText, background, onBackground, files, onAddFiles, onRemoveFile, spintax, onSpintax } =
    props;
  const t = useT();
  const [panel, setPanel] = useState<'color' | 'emoji' | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useObjectUrls(files);
  const canUseBackground = backgroundAllowed(text, files.length);

  useEffect(() => {
    if (!canUseBackground && background) onBackground('');
  }, [background, canUseBackground, onBackground]);

  useEffect(() => {
    if (!text && spintax) onSpintax(false);
  }, [onSpintax, spintax, text]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, background ? 120 : 92), 300)}px`;
    el.style.overflowY = el.scrollHeight > 300 ? 'auto' : 'hidden';
  }, [text, background]);

  const insertEmoji = (emoji: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    onText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={area}
        id="content"
        placeholder={t('Write something...')}
        value={text}
        className={`textarea block max-h-[300px] w-full leading-normal${background ? ' border-transparent text-xl font-semibold placeholder:text-white/80' : ''}`}
        style={
          background
            ? {
                background,
                color: backgroundTextColor(background),
                textAlign: 'center',
                padding: '9px 22px 17px',
              }
            : undefined
        }
        onChange={(e) => onText(e.target.value)}
      />
      {panel === 'color' && (
        <BackgroundPicker
          onClose={() => setPanel(null)}
          onPick={(bg) => {
            onBackground(bg);
            setPanel(null);
          }}
        />
      )}
      {panel === 'emoji' && <EmojiPicker onClose={() => setPanel(null)} onPick={insertEmoji} />}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            aria-label={t('Choose background color')}
            className="btn btn-square btn-sm border-0 font-semibold bg-linear-to-br from-[#ff5d5d] via-[#7a55f7] to-[#31d7c8] text-white"
            id="colorBtn"
            type="button"
            disabled={!canUseBackground}
            title={t(...backgroundTitle(text, files.length > 0))}
            onClick={() => setPanel(panel === 'color' ? null : 'color')}
          >
            Aa
          </button>
          <button
            aria-label={t('Add emoji')}
            className="btn btn-ghost btn-square btn-sm"
            id="emojiBtn"
            type="button"
            onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')}
          >
            <Icon name="smile" className="size-5" />
          </button>
        </div>
        <div>
          <button
            className="btn btn-ghost btn-sm text-primary"
            id="addImageBtn"
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="imagePlus" className="size-5" />
            <span>{t('Add Photo/video')}</span>
          </button>
        </div>
      </div>
      <div className="mt-3 rounded-box border border-base-300 bg-base-200/60 px-3 py-2.5" id="spintaxBox">
        <div className="flex items-center justify-between gap-2.5">
          <label
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 select-none has-disabled:cursor-not-allowed has-disabled:opacity-80"
            id="spintaxControl"
            title={t('Enable Spintax variations per group')}
          >
            <input
              className="toggle toggle-primary flex-none"
              id="shuffleTextToggle"
              type="checkbox"
              disabled={!text}
              checked={spintax}
              onChange={(e) => onSpintax(e.target.checked)}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <b>Spintax</b>
              <small className="text-xs text-base-content/70">
                {t(
                  'Use {TEXT1|TEXT2|TEXT3} or turn ON for safe Auto-Spin variations per group. OFF = 100% original text.',
                )}
              </small>
            </span>
          </label>
          <button
            aria-label={t('Spintax information')}
            className="btn btn-square btn-ghost btn-sm flex-none"
            title={t('About Spintax')}
            type="button"
            onClick={() => setShowInfo(true)}
          >
            <Icon name="info" className="size-5" />
          </button>
        </div>
        <div className="mt-2 ml-14 text-xs text-base-content/70">
          <span>{t('Example:')}</span>{' '}
          <code className="rounded bg-base-300/60 px-1.5 py-0.5">{'{Hey|Hello|Hi} everyone!'}</code>
        </div>
      </div>
      {showInfo && <SpintaxInfo onClose={() => setShowInfo(false)} />}
      <input
        ref={fileInput}
        accept="image/*,video/*"
        hidden
        id="files"
        multiple
        type="file"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = ''; // so picking the same file again after removing it still fires
          if (picked.length) onAddFiles(picked);
        }}
      />
      <div className="mt-2.5 flex flex-wrap gap-2 empty:hidden" id="fileList">
        {files.map((f, i) => (
          <div
            key={urls[i]}
            className={`relative h-[78px] overflow-hidden rounded-lg border border-base-300 bg-base-200 ${f.type.startsWith('video/') ? 'w-[110px]' : 'w-[78px]'}`}
            title={f.name}
          >
            {f.type.startsWith('image/') ? (
              <img className="size-full object-cover" src={urls[i]} alt="" />
            ) : (
              <video
                className="size-full bg-black object-contain"
                src={urls[i]}
                muted
                playsInline
                preload="metadata"
              />
            )}
            <button
              type="button"
              className="btn btn-square btn-neutral btn-xs absolute top-1 right-1"
              aria-label={t('Remove {name}', { name: f.name })}
              onClick={() => onRemoveFile(i)}
            >
              <Icon name="x" className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
