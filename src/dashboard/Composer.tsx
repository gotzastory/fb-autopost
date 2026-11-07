import { useEffect, useMemo, useRef, useState } from 'react';
import { BG_DECORATIVE, BG_GRADIENTS, BG_SOLIDS, EMOJIS } from '@/lib/composer-data';

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
    return 0.2126 * parseInt(x.slice(0, 2), 16) + 0.7152 * parseInt(x.slice(2, 4), 16) + 0.0722 * parseInt(x.slice(4, 6), 16);
  });
  return luminance.reduce((a, b) => a + b, 0) / luminance.length > 178 ? '#172033' : '#ffffff';
}

const EMOJI_TABS: [string, string][] = [
  ['smileys', '😀'], ['people', '👋'], ['animals', '🐶'], ['food', '🍔'],
  ['travel', '🚗'], ['objects', '💡'], ['symbols', '❤️'], ['flags', '🏳️'],
];

function backgroundTitle(text: string, hasMedia: boolean) {
  if (hasMedia) return 'Background color is available only for text-only posts';
  if (text.length > MAX_BACKGROUND_CHARS) return `Background color is limited to ${MAX_BACKGROUND_CHARS} characters`;
  if (/[\r\n]/.test(text)) return 'Background color is unavailable when the post contains line breaks';
  return 'Choose background color';
}

function useObjectUrls(files: File[]) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function MediaPreview({ files }: { files: File[] }) {
  const urls = useObjectUrls(files);
  return (
    <div className={`preview-media${files.some((f) => f.type.startsWith('video/')) ? ' has-video' : ''}`} id="previewMedia">
      {files.map((f, i) =>
        f.type.startsWith('image/') ? (
          <img key={urls[i]} src={urls[i]} alt="" className="preview-photo" />
        ) : (
          <div key={urls[i]} className="preview-video-frame">
            <video src={urls[i]} controls muted playsInline preload="metadata" className="preview-video-main" />
            <div className="preview-video-play" aria-hidden="true">▶</div>
          </div>
        ),
      )}
    </div>
  );
}

function BackgroundPicker({ onPick, onClose }: { onPick: (bg: string) => void; onClose: () => void }) {
  const tiles = (items: string[]) =>
    items.map((bg) => (
      <button key={bg} type="button" className="bg-tile" title="Choose background" aria-label="Choose background" style={{ background: bg }} onClick={() => onPick(bg)} />
    ));
  return (
    <div className="composer-popover" id="colorPanel">
      <div className="popover-head">
        <b>Choose background</b>
        <button aria-label="Close" className="popover-close" type="button" onClick={onClose}>×</button>
      </div>
      <div className="background-section">
        <h3>Decorative</h3>
        <div className="background-grid">
          <button type="button" className="bg-tile bg-none" title="No background" aria-label="No background" onClick={() => onPick('')} />
          {tiles(BG_DECORATIVE)}
        </div>
      </div>
      <div className="background-section">
        <h3>Gradient</h3>
        <div className="background-grid">{tiles(BG_GRADIENTS)}</div>
      </div>
      <div className="background-section">
        <h3>Solid</h3>
        <div className="background-grid solid-grid">{tiles(BG_SOLIDS)}</div>
      </div>
    </div>
  );
}

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [category, setCategory] = useState('smileys');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const items = (q ? Object.values(EMOJIS).join(' ') : EMOJIS[category] ?? '').split(' ').filter((e) => e && (!q || e.toLowerCase().includes(q)));
  return (
    <div className="emoji-popover" id="emojiPicker">
      <div className="popover-head">
        <b>Emoji</b>
        <button aria-label="Close" className="popover-close" type="button" onClick={onClose}>×</button>
      </div>
      <div className="emoji-search-row">
        <span>⌕</span>
        <input id="emojiSearch" placeholder="Search emoji" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="emoji-tabs">
        {EMOJI_TABS.map(([cat, icon]) => (
          <button key={cat} type="button" className={`emoji-tab${cat === category ? ' active' : ''}`} aria-label={cat} onClick={() => setCategory(cat)}>{icon}</button>
        ))}
      </div>
      <div className="emoji-grid" id="emojiGrid">
        {items.map((e, i) => (
          <button key={`${e}${i}`} type="button" className="emoji-item" title={e} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}

function SpintaxInfo({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div aria-labelledby="spintaxInfoTitle" aria-modal="true" className="spintax-info-modal" role="dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="spintax-info-card">
        <div className="popover-head">
          <b id="spintaxInfoTitle">About Spintax</b>
          <button aria-label="Close" className="popover-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="spintax-info-body">
          <p><b>Spintax</b> lets you write several interchangeable versions inside one post. With Spintax ON and no choices written, Auto-Spin uses only the safe vocabulary. With Spintax OFF, the text is posted exactly as entered.</p>
          <div className="spintax-info-code"><code>{'{Hello|Hi|Hey} everyone!'}</code><span>→ one option is selected for each group.</span></div>
          <ul>
            <li>Use <code>{'{option1|option2|option3}'}</code> for multiple choices.</li>
            <li>Different choice blocks can be combined to create more variations.</li>
            <li>Nested Spintax is supported, for example <code>{'{Hi {there|everyone}|Hello}'}</code>.</li>
            <li>Empty choices are allowed, such as <code>{'{|extra}'}</code>.</li>
            <li>Auto-Spin leaves URLs, names, prices, numbers, dates, hashtags, mentions and emojis unchanged.</li>
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
  const { text, onText, background, onBackground, files, onAddFiles, onRemoveFile, spintax, onSpintax } = props;
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
    <div className="composer-wrap">
      <textarea
        ref={area}
        id="content"
        placeholder="Write something..."
        value={text}
        className={background ? 'has-bg' : undefined}
        style={background ? { background, color: backgroundTextColor(background), textAlign: 'center', padding: '9px 22px 17px' } : undefined}
        onChange={(e) => onText(e.target.value)}
      />
      {panel === 'color' && <BackgroundPicker onClose={() => setPanel(null)} onPick={(bg) => { onBackground(bg); setPanel(null); }} />}
      {panel === 'emoji' && <EmojiPicker onClose={() => setPanel(null)} onPick={insertEmoji} />}
      <div className="composer-tools">
        <div className="composer-tools-left">
          <button aria-label="Choose background color" className="composer-tool aa-btn" id="colorBtn" type="button" disabled={!canUseBackground} title={backgroundTitle(text, files.length > 0)} onClick={() => setPanel(panel === 'color' ? null : 'color')}>Aa</button>
          <button aria-label="Add emoji" className="composer-tool emoji-btn" id="emojiBtn" type="button" onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')}>☺</button>
        </div>
        <div className="composer-tools-right">
          <button className="add-image-btn" id="addImageBtn" type="button" onClick={() => fileInput.current?.click()}>
            <span aria-hidden="true" className="add-photo-icon">
              <svg height="22" viewBox="0 0 24 24" width="22">
                <rect fill="none" height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="4" />
                <circle cx="8" cy="9" fill="currentColor" r="1.6" />
                <path d="M5 17l4.2-4.2 3.1 3.1 2.2-2.2L19 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              <span className="add-photo-plus">+</span>
            </span>
            <span>Add Photo/video</span>
          </button>
        </div>
      </div>
      <div className="spintax-box" id="spintaxBox">
        <div className="spintax-main-row">
          <label className="shuffle-toggle" id="spintaxControl" title="Enable Spintax variations per group">
            <input id="shuffleTextToggle" type="checkbox" disabled={!text} checked={spintax} onChange={(e) => onSpintax(e.target.checked)} />
            <span aria-hidden="true" className="shuffle-switch" />
            <span className="shuffle-toggle-copy">
              <b>Spintax</b>
              <small>{'Use {TEXT1|TEXT2|TEXT3} or turn ON for safe Auto-Spin variations per group. OFF = 100% original text.'}</small>
            </span>
          </label>
          <button aria-label="Spintax information" className="spintax-info-btn" title="About Spintax" type="button" onClick={() => setShowInfo(true)}>!</button>
        </div>
        <div className="spintax-example"><span>Example:</span> <code>{'{Hey|Hello|Hi} everyone!'}</code></div>
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
      <div className="attachment-list" id="fileList">
        {files.map((f, i) => (
          <div key={urls[i]} className={`attachment-thumb${f.type.startsWith('video/') ? ' is-video' : ''}`} title={f.name}>
            {f.type.startsWith('image/') ? <img src={urls[i]} alt="" /> : <video src={urls[i]} muted playsInline preload="metadata" />}
            <button type="button" className="attachment-remove" aria-label={`Remove ${f.name}`} onClick={() => onRemoveFile(i)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
