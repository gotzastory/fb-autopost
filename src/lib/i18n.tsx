import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'th';

// Keyed by the English text, so English needs no table and a missing key falls back to English.
const TH = {
  // Shared
  'Facebook Account': 'บัญชี Facebook',
  'Switch language': 'เปลี่ยนภาษา',
  Close: 'ปิด',
  Resume: 'ทำต่อ',
  Pause: 'หยุดชั่วคราว',
  // App
  'Compose Post': 'สร้างโพสต์',
  'Create a post and select your joined Facebook groups.': 'สร้างโพสต์และเลือกกลุ่ม Facebook ที่คุณเข้าร่วม',
  'Sync your Facebook groups': 'ซิงค์กลุ่ม Facebook ของคุณ',
  'Sync group IDs/names from Facebook. Covers can be refreshed separately.': 'ซิงค์ ID และชื่อกลุ่มจาก Facebook ส่วนภาพปกรีเฟรชแยกได้',
  'Sync group covers': 'ซิงค์ภาพปกกลุ่ม',
  'Syncing…': 'กำลังซิงค์…',
  'Sync from Facebook': 'ซิงค์จาก Facebook',
  'Paste a Facebook group URL': 'วางลิงก์กลุ่ม Facebook',
  'Facebook group URL': 'ลิงก์กลุ่ม Facebook',
  Add: 'เพิ่ม',
  'Post Content': 'เนื้อหาโพสต์',
  chars: 'ตัวอักษร',
  'Post to': 'โพสต์ไปยัง',
  Stop: 'หยุด',
  'Ready. Select groups, then click Post to publish to the selected Facebook groups.': 'พร้อมแล้ว เลือกกลุ่มแล้วกดโพสต์เพื่อเผยแพร่ไปยังกลุ่ม Facebook ที่เลือก',
  // Composer
  'Background color is available only for text-only posts': 'ใช้สีพื้นหลังได้เฉพาะโพสต์ที่มีแต่ข้อความ',
  'Background color is limited to {n} characters': 'สีพื้นหลังใช้ได้ไม่เกิน {n} ตัวอักษร',
  'Background color is unavailable when the post contains line breaks': 'ใช้สีพื้นหลังไม่ได้เมื่อโพสต์มีการขึ้นบรรทัดใหม่',
  'Choose background color': 'เลือกสีพื้นหลัง',
  'Choose background': 'เลือกพื้นหลัง',
  Decorative: 'ลวดลาย',
  'No background': 'ไม่มีพื้นหลัง',
  Gradient: 'ไล่สี',
  Solid: 'สีพื้น',
  Emoji: 'อีโมจิ',
  'Search emoji': 'ค้นหาอีโมจิ',
  'About Spintax': 'เกี่ยวกับ Spintax',
  'lets you write several interchangeable versions inside one post. With Spintax ON and no choices written, Auto-Spin uses only the safe vocabulary. With Spintax OFF, the text is posted exactly as entered.':
    'ช่วยให้เขียนข้อความหลายแบบที่สลับกันได้ในโพสต์เดียว ถ้าเปิด Spintax แต่ไม่ได้เขียนตัวเลือก Auto-Spin จะใช้เฉพาะคำที่ปลอดภัย ถ้าปิด Spintax ข้อความจะถูกโพสต์ตามที่พิมพ์ทุกตัวอักษร',
  '→ one option is selected for each group.': '→ ระบบจะสุ่มหนึ่งตัวเลือกให้แต่ละกลุ่ม',
  Use: 'ใช้',
  'for multiple choices.': 'เพื่อใส่หลายตัวเลือก',
  'Different choice blocks can be combined to create more variations.': 'รวมหลายชุดตัวเลือกเข้าด้วยกันเพื่อให้ได้รูปแบบมากขึ้น',
  'Nested Spintax is supported, for example': 'ซ้อน Spintax ได้ เช่น',
  'Empty choices are allowed, such as': 'ใส่ตัวเลือกว่างได้ เช่น',
  'Auto-Spin leaves URLs, names, prices, numbers, dates, hashtags, mentions and emojis unchanged.': 'Auto-Spin จะไม่เปลี่ยน URL ชื่อ ราคา ตัวเลข วันที่ แฮชแท็ก การแท็ก และอีโมจิ',
  'Write something...': 'เขียนอะไรสักหน่อย...',
  'Add emoji': 'เพิ่มอีโมจิ',
  'Add Photo/video': 'เพิ่มรูปภาพ/วิดีโอ',
  'Enable Spintax variations per group': 'เปิด Spintax ให้แต่ละกลุ่มได้ข้อความต่างกัน',
  'Use {TEXT1|TEXT2|TEXT3} or turn ON for safe Auto-Spin variations per group. OFF = 100% original text.':
    'ใช้ {TEXT1|TEXT2|TEXT3} หรือเปิดเพื่อให้ Auto-Spin สร้างข้อความต่างกันอย่างปลอดภัยในแต่ละกลุ่ม ปิด = ใช้ข้อความต้นฉบับ 100%',
  'Spintax information': 'ข้อมูล Spintax',
  'Example:': 'ตัวอย่าง:',
  'Remove {name}': 'ลบ {name}',
  // Panels
  'Facebook profile': 'โปรไฟล์ Facebook',
  'Posting as': 'โพสต์ในนาม',
  Profile: 'โปรไฟล์',
  Pages: 'เพจ',
  'Press the refresh button to load your Facebook Pages.': 'กดปุ่มรีเฟรชเพื่อโหลดเพจ Facebook ของคุณ',
  'Refresh Facebook Pages': 'รีเฟรชเพจ Facebook',
  Preview: 'ตัวอย่างโพสต์',
  '＋ Add groups': '＋ เพิ่มกลุ่ม',
  group: 'กลุ่ม',
  groups: 'กลุ่ม',
  'Your post preview will appear here.': 'ตัวอย่างโพสต์จะแสดงที่นี่',
  'See less': 'ย่อ',
  'See more': 'ดูเพิ่มเติม',
  Like: 'ถูกใจ',
  Comment: 'แสดงความคิดเห็น',
  Share: 'แชร์',
  Success: 'สำเร็จ',
  Pending: 'รอคิว',
  Failed: 'ล้มเหลว',
  Skipped: 'ข้าม',
  STOP: 'หยุด',
  'Running...': 'กำลังโพสต์...',
  'Activity log': 'บันทึกการทำงาน',
  success: 'สำเร็จ',
  pending: 'รอคิว',
  failed: 'ล้มเหลว',
  skipped: 'ข้าม',
  Group: 'กลุ่ม',
  Status: 'สถานะ',
  'Search groups': 'ค้นหากลุ่ม',
  'Your groups': 'กลุ่มของคุณ',
  'Select all shown': 'เลือกทั้งหมดที่แสดง',
  'All groups': 'กลุ่มทั้งหมด',
  Clear: 'ล้าง',
  Selected: 'เลือกแล้ว',
  Syncing: 'กำลังซิงค์',
  'No Facebook groups found. Click “Sync from Facebook”.': 'ไม่พบกลุ่ม Facebook กด “ซิงค์จาก Facebook”',
  'Resolving group name…': 'กำลังดึงชื่อกลุ่ม…',
  'Open {name}': 'เปิด {name}',
  'Managed Group': 'กลุ่มที่คุณดูแล',
  'Joined Group': 'กลุ่มที่เข้าร่วม',
  ' · verifying name': ' · กำลังตรวจชื่อ',
  // Popup
  'Checking…': 'กำลังตรวจสอบ…',
  Connected: 'เชื่อมต่อแล้ว',
  Disconnected: 'ไม่ได้เชื่อมต่อ',
  'Facebook no login': 'ยังไม่ได้ล็อกอิน Facebook',
  'Log in to Facebook to connect': 'ล็อกอิน Facebook เพื่อเชื่อมต่อ',
  'Keep Facebook logged in': 'ล็อกอิน Facebook ค้างไว้',
  'Keep your Facebook account logged in while posting.': 'อย่าออกจากระบบ Facebook ระหว่างโพสต์',
  'Stays in your browser': 'ทำงานในเบราว์เซอร์ของคุณ',
  'Talks only to Facebook. Heavy posting can still trigger Facebook limits.': 'ติดต่อกับ Facebook เท่านั้น แต่ถ้าโพสต์ถี่มากอาจโดน Facebook จำกัดได้',
  'Open Dashboard': 'เปิดแดชบอร์ด',
  'Refreshing…': 'กำลังรีเฟรช…',
  'Refresh connection': 'รีเฟรชการเชื่อมต่อ',
  'Last connection': 'เชื่อมต่อล่าสุด',
} as const;

export type Key = keyof typeof TH;

const STORAGE_KEY = 'ui_lang';
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'th';
const listeners = new Set<() => void>();
let current: Lang = navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';

function apply(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}
apply(current);
void chrome.storage.local.get(STORAGE_KEY).then((v) => isLang(v[STORAGE_KEY]) && apply(v[STORAGE_KEY]));
// Popup and dashboard follow each other when either one switches.
chrome.storage.onChanged.addListener((changes, area) => {
  const next = changes[STORAGE_KEY]?.newValue;
  if (area === 'local' && isLang(next)) apply(next);
});

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const text: string = lang === 'th' ? TH[key] ?? key : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Re-renders the caller when the language changes. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, () => current);
  return Object.assign((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), { lang });
}

export function LangToggle() {
  const t = useT();
  return (
    <button type="button" className="btn btn-ghost btn-sm font-semibold" title={t('Switch language')} aria-label={t('Switch language')} onClick={() => void chrome.storage.local.set({ [STORAGE_KEY]: t.lang === 'th' ? 'en' : 'th' })}>
      {t.lang === 'th' ? 'EN' : 'ไทย'}
    </button>
  );
}
