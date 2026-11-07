// Runs in the content-script world on facebook.com; drives the group composer.
export function startPoster() {
  function e(e) {
    return (e || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }
  function t(e) {
    const t = e.getBoundingClientRect(),
      n = window.getComputedStyle(e);
    return (
      !e.closest('[hidden], [aria-hidden="true"]') &&
      t.width > 0 &&
      t.height > 0 &&
      'none' !== n.display &&
      'hidden' !== n.visibility &&
      Number(n.opacity || '1') > 0
    );
  }
  function n(e) {
    return !e.hasAttribute('disabled') && 'true' !== e.getAttribute('aria-disabled');
  }
  function o() {
    return Array.from(document.querySelectorAll('[role="dialog"]')).filter(t);
  }
  function r(t) {
    const n = [
      t.getAttribute('aria-label'),
      t.getAttribute('aria-placeholder'),
      t.getAttribute('title'),
      t.placeholder,
      t.innerText,
      t.textContent,
    ];
    return Array.from(new Set(n.map(e).filter(Boolean)));
  }
  function i(t, n) {
    const o = n.map(e);
    return t.some((e) => o.some((t) => t.length > 0 && e.includes(t)));
  }
  async function a(e, t = 6e3, n = 250) {
    const o = Date.now();
    for (; Date.now() - o < t;) {
      const t = e();
      if (t) return t;
      await new Promise((e) => setTimeout(e, n));
    }
    return null;
  }
  const s = new Set([
    'feed',
    'discover',
    'joins',
    'notifications',
    'settings',
    'create',
    'search',
    'membership_questions',
    'pending_posts',
    'member-requests',
    'pending',
    'reported',
    'files',
    'media',
    'events',
    'announcements',
    'members',
    'about',
    'discussion',
    'buy_sell_discussion',
  ]);
  function l() {
    const e = [],
      t = new Set();
    return (
      document.querySelectorAll('a[href*="/groups/"]').forEach((n) => {
        const o = n.getAttribute('href');
        if (!o) return;
        const r = o.match(/\/groups\/(\d+)/),
          i = o.match(/\/groups\/([a-zA-Z0-9._-]+)/),
          a = (null == r ? void 0 : r[1]) || (null == i ? void 0 : i[1]);
        if (!a || s.has(a.toLowerCase())) return;
        const l = o.match(/\/groups\/[^\/]+\/([a-zA-Z]+)/);
        if (l && s.has(l[1].toLowerCase())) return;
        if (t.has(a)) return;
        let m = (function (e) {
          var t, n, o;
          const r = null == (t = e.textContent) ? void 0 : t.trim();
          if (r && p(r)) return f(r);
          const i = e.getAttribute('aria-label');
          if (i && p(i)) return f(i);
          const a = e.closest('[role="listitem"], [data-pagelet], div[class]');
          if (a) {
            const e = a.querySelector('h3, h4, [role="heading"]');
            if (e) {
              const t = null == (n = e.textContent) ? void 0 : n.trim();
              if (t && p(t)) return f(t);
            }
            const t = a.querySelectorAll('span');
            for (const n of t) {
              const e = null == (o = n.textContent) ? void 0 : o.trim();
              if (e && p(e) && e.length > 3 && !/^\d+[KMB]?\s*(members?|posts?|today)?$/i.test(e))
                return f(e);
            }
          }
          const s = e.querySelector('img[alt]');
          if (s) {
            const e = s.getAttribute('alt');
            if (e && p(e)) return f(e);
          }
          return '';
        })(n);
        if (!m || m.length < 2) return;
        const g = (function (e) {
          const t = (function (e) {
            const t = [e];
            let n = e.parentElement;
            for (let o = 0; n && o < 8 && (t.push(n), 'listitem' !== n.getAttribute('role')); o += 1)
              n = n.parentElement;
            return t;
          })(e);
          for (const n of t) {
            const e = c(n) || u(n) || d(n);
            if (e) return e;
          }
          return null;
        })(n);
        t.add(a);
        const h = o.startsWith('http') ? o : `https://www.facebook.com${o.startsWith('/') ? '' : '/'}${o}`;
        e.push({
          id: a,
          name: m.substring(0, 150),
          url: h.split('?')[0].split('#')[0],
          groupId: a,
          avatarUrl: g,
        });
      }),
      e.length,
      e
    );
  }
  function c(e) {
    const t = Array.from(e.querySelectorAll('img'));
    for (const n of t) {
      const e = g(n.currentSrc || n.src || n.getAttribute('src'));
      if (e) return e;
    }
    return null;
  }
  function u(e) {
    const t = Array.from(e.querySelectorAll('image'));
    for (const n of t) {
      const e = g(
        n.getAttribute('href') ||
          n.getAttribute('xlink:href') ||
          n.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      );
      if (e) return e;
    }
    return null;
  }
  function d(e) {
    const t = Array.from(e.querySelectorAll('[style*="background-image"]'));
    for (const n of t) {
      const e = g(m(n.style.backgroundImage));
      if (e) return e;
    }
    return null;
  }
  function m(e) {
    const t = e.match(/url\((['"]?)(.*?)\1\)/);
    return (null == t ? void 0 : t[2]) || null;
  }
  function g(e) {
    if (!e) return null;
    const t = e.trim();
    if (!t || 'none' === t || t.startsWith('data:') || t.startsWith('blob:')) return null;
    try {
      const e = new URL(t, window.location.href);
      return 'http:' !== e.protocol && 'https:' !== e.protocol ? null : e.href;
    } catch {
      return null;
    }
  }
  function p(e) {
    if (!e || e.length < 2 || e.length > 200) return !1;
    const t = [
      /^(Join|Leave|Joined|Visit|View|See\s+more|Members?|Posts?|Private|Public)$/i,
      /^\d+\s*(new\s+)?(members?|posts?|today|notifications?)$/i,
      /^(Yesterday|Today|Just\s+now|\d+\s*(min|hour|day|week|month|year)s?\s*ago)$/i,
      /^https?:\/\//i,
      /^(Admin|Moderator|Member)$/i,
    ];
    for (const n of t) if (n.test(e.trim())) return !1;
    return !0;
  }
  function f(e) {
    let t = e;
    return (
      (t = t.replace(/\s*\(\+?\d+\)\s*/g, '')),
      (t = t.replace(/\s*\+\d+\s*$/g, '')),
      (t = t.replace(/\s*last\s+active\s+.+$/i, '')),
      (t = t.replace(/\s*(a\s+few\s+)?(second|minute|hour|day|week|month|year)s?\s+ago\s*$/i, '')),
      (t = t.replace(/\s*\d+\s*(sec|second|min|minute|hour|hr|day|week|month|year)s?\s*(ago)?\s*$/i, '')),
      (t = t.replace(/\s*(just now|yesterday|today|recently)\s*$/i, '')),
      (t = t.replace(/\s*(последн\w+\s+)?(активност\w*|был\w*\s+актив\w*)\s+.+$/i, '')),
      (t = t.replace(
        /\s*(несколько\s+)?(секунд|минут|час\w*|дн\w*|недел\w*|месяц\w*|год\w*)\s+назад\s*$/i,
        '',
      )),
      (t = t.replace(
        /\s*\d+\s*(сек|секунд|мин|минут|час|дн|дней|день|недел|месяц|год)\w*\s*(назад)?\s*$/i,
        '',
      )),
      (t = t.replace(/\s*(только что|вчера|сегодня|недавно)\s*$/i, '')),
      (t = t.replace(/\s*\d+\s*(new\s*)?(post|message|notification|update)s?\s*$/i, '')),
      (t = t.replace(/\s*(new\s+)?(activity|post|message)s?\s*$/i, '')),
      (t = t.replace(/\s*\d+\s*(нов\w*)?\s*(пост|сообщен|публикац|уведомлен)\w*\s*$/i, '')),
      (t = t.replace(/\s*(нов\w+\s+)?(активност|пост|сообщен)\w*\s*$/i, '')),
      (t = t.replace(/\s*[\d,.]+[KMБкм]?\s*(members?|участник\w*|член\w*)\s*$/i, '')),
      (t = t.replace(
        /\s*(Private|Public|Частн\w*|Публичн\w*|Открыт\w*|Закрыт\w*)\s*(group|групп\w*)?\s*$/i,
        '',
      )),
      (t = t.replace(/\s*[·•|]\s*.*$/g, '')),
      (t = t.replace(/\s+/g, ' ')),
      (t = t.replace(/^["']|["']$/g, '')),
      t.trim()
    );
  }
  function h(e, t) {
    let n = 0;
    for (const o of t) {
      const t = e.get(o.groupId);
      t
        ? e.set(o.groupId, {
            ...t,
            ...o,
            name: o.name.length > t.name.length && !o.name.startsWith('Group:') ? o.name : t.name,
            avatarUrl: o.avatarUrl || t.avatarUrl || null,
          })
        : (e.set(o.groupId, o), (n += 1));
    }
    return n;
  }
  function b(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  function w(e) {
    return e === window;
  }
  function v(e) {
    if (w(e)) {
      const e = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      return {
        top: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
        scrollHeight: e,
        clientHeight: window.innerHeight,
      };
    }
    return { top: e.scrollTop, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight };
  }
  function y(e, t) {
    w(e) ? window.scrollBy({ top: t, behavior: 'auto' }) : (e.scrollTop += t);
  }
  function E(e) {
    if (w(e))
      return (window.dispatchEvent(new Event('scroll')), void document.dispatchEvent(new Event('scroll')));
    e.dispatchEvent(new Event('scroll', { bubbles: !0 }));
  }
  function P(e) {
    const t = v(e);
    return t.top + t.clientHeight >= t.scrollHeight - 24;
  }
  async function S(e, t = 4e3, n = 350, o = 4) {
    const r = Date.now() + t;
    let i = 0,
      a = 0;
    for (; Date.now() < r && a < o;) {
      await b(n);
      const t = h(e, l());
      t > 0 ? ((i += t), (a = 0)) : (a += 1);
    }
    return i;
  }
  async function A(e = 140, t = 700, n) {
    const o = new Map(),
      r = (function () {
        const e = Array.from(document.querySelectorAll('a[href*="/groups/"]')),
          t = new Set();
        for (const o of e) {
          let e = o.parentElement;
          for (let n = 0; e && n < 10; n += 1) {
            const n = window.getComputedStyle(e),
              o = e.scrollHeight > e.clientHeight + 150,
              r = /(auto|scroll)/.test(`${n.overflowY} ${n.overflow}`);
            (o && r && t.add(e), (e = e.parentElement));
          }
        }
        const n = Array.from(t).sort((e, t) => {
          const n =
            t.querySelectorAll('a[href*="/groups/"]').length -
            e.querySelectorAll('a[href*="/groups/"]').length;
          return 0 !== n ? n : t.scrollHeight - e.scrollHeight;
        })[0];
        return n
          ? (n.tagName,
            n.getAttribute('role'),
            n.querySelectorAll('a[href*="/groups/"]').length,
            n.scrollHeight,
            n.clientHeight,
            n)
          : window;
      })();
    let i = 0,
      a = 0;
    var s, l;
    ((l = 0), w((s = r)) ? window.scrollTo({ top: l, behavior: 'auto' }) : (s.scrollTop = l), await b(t));
    const c = await S(o, 2e3, 300, 3);
    for (
      null == n ||
      n({ scrollCount: a, collected: o.size, added: c, status: `Scanning groups... Found ${o.size} so far` });
      a < e && i < 10;
    ) {
      const e = v(r);
      (y(r, Math.max(1.25 * window.innerHeight, 900)), E(r));
      const t = await S(o, 4e3, 350, 4),
        s = v(r),
        l = P(r),
        c = s.top !== e.top || s.scrollHeight !== e.scrollHeight;
      (0 !== t || (c && !l) ? (i = 0) : (i += 1),
        (a += 1),
        o.size,
        Math.round(s.top),
        Math.round(s.scrollHeight),
        null == n ||
          n({
            scrollCount: a,
            collected: o.size,
            added: t,
            status: `Scanning groups... Found ${o.size} so far`,
          }));
    }
    return (o.size, Array.from(o.values()));
  }
  function I() {
    return [
      document.querySelector('a[href*="/me/"]'),
      document.querySelector('[aria-label="Your profile"]'),
      document.querySelector('[aria-label="Account"]'),
      document.querySelector('[aria-label="Messenger"]'),
      document.querySelector('[data-pagelet="ProfileTilesFeed"]'),
      document.querySelector('[role="navigation"] a[href*="facebook.com/profile"]'),
    ].some((e) => null !== e);
  }
  function C() {
    const e = window.location.href;
    if (
      e.includes('/groups/feed') ||
      e.includes('/groups/joins') ||
      e.includes('/groups/?') ||
      e.match(/facebook\.com\/groups\/?$/)
    )
      return 'groups_feed';
    if (e.match(/\/groups\/\d+/) || e.match(/\/groups\/[a-zA-Z][a-zA-Z0-9._-]*/)) {
      if (
        !['members', 'about', 'media', 'files', 'events', 'settings'].some(
          (t) => e.includes(`/groups/${t}`) || e.includes(`/${t}`),
        )
      )
        return 'group_page';
    }
    return 'other';
  }
  const T = 0.15,
    k = 0.2,
    O = 35e3,
    M = 1,
    N = 0.5,
    _ = 1,
    D = 10,
    U = 0.25,
    x = 0.5,
    L = 0.1,
    R = 4e3,
    B = 100,
    F = 800,
    q = 2e4,
    H = 100,
    z = 0.7,
    G = 6,
    j = [
      'Photo/video',
      'Photo',
      'photo',
      'Video',
      'video',
      'Foto/video',
      'Foto/vídeo',
      'Photo/vidéo',
      'Foto/Video',
      'Fotoğraf/video',
      'รูปภาพ/วิดีโอ',
      'صورة/فيديو',
      'फ़ोटो/वीडियो',
      'ছবি/ভিডিও',
      'تصویر/ویڈیو',
      'Fénykép/videó',
      'Ảnh/video',
      'Ảnh',
      'ảnh',
    ],
    $ = [
      'cancel',
      'close',
      'back',
      'privacy',
      'audience',
      'photo',
      'video',
      'search',
      'share',
      'like',
      'comment',
      'reply',
      'hủy',
      'bình luận',
      'trả lời',
    ];
  function V(e) {
    return new Promise((t) => setTimeout(t, 1e3 * e));
  }
  function K(e) {
    const t = atob(e.split(',')[1]),
      n = e.split(',')[0].split(':')[1].split(';')[0],
      o = new ArrayBuffer(t.length),
      r = new Uint8Array(o);
    for (let i = 0; i < t.length; i++) r[i] = t.charCodeAt(i);
    return new Blob([o], { type: n });
  }
  const W = (e) => [e, `${e}...`],
    X = {
      en: W('Write something'),
      cs: W('Napište něco'),
      sk: W('Napíšte niečo'),
      pl: W('Napisz coś'),
      hu: W('Írj valamit'),
      sl: W('Napiši nekaj'),
      hr: W('Napišite nešto'),
      sr: W('Напишите нешто'),
      mk: W('Напишете нешто'),
      be: W('Напішыце што-небудзь'),
      lt: W('Parašykite ką nors'),
      lv: W('Uzrakstiet kaut ko'),
      uk: W('Напишіть щось'),
      ru: W('Напишите что-нибудь'),
      tt: W('Нәрсә дә булса языгыз'),
      tg: W('Чизе нависед'),
      es: W('Escribe algo'),
      'es-es': W('Escribe algo'),
      pt: W('Escreva algo'),
      'pt-br': W('Escreva algo'),
      'pt-pt': W('Escreve algo'),
      fr: W('Écrivez quelque chose'),
      'fr-fr': W('Écrivez quelque chose'),
      'fr-ca': W('Écrivez quelque chose'),
      it: W('Scrivi qualcosa'),
      ca: W('Escriu alguna cosa'),
      gl: W('Escribe algo'),
      ro: W('Scrie ceva'),
      sc: W('Iscrie calicuna cosa'),
      de: W('Schreib etwas'),
      nl: W('Schrijf iets'),
      'nl-be': W('Schrijf iets'),
      fy: W('Skriuw ris wat'),
      af: W('Skryf iets'),
      da: W('Skriv noget'),
      nb: W('Skriv noe'),
      nn: W('Skriv noko'),
      sv: W('Skriv något'),
      is: W('Skrifaðu eitthvað'),
      fo: W('Skriva okkurt'),
      ga: W('Scríobh rud éigin'),
      cy: W('Ysgrifennwch rywbeth'),
      br: W('Skriv un dra bennak'),
      bs: W('Napišite nešto'),
      sq: W('Shkruani diçka'),
      bg: W('Напишете нещо'),
      el: W('Γράψτε κάτι'),
      tr: W('Bir şeyler yaz'),
      uz: W('Nimadir yozing'),
      ky: W('Бир нерсе жазыңыз'),
      kk: W('Бірдеңе жазыңыз'),
      az: W('Nəsə yazın'),
      mn: W('Ямар нэг зүйл бичнэ үү'),
      ar: W('اكتب شيئًا'),
      he: W('כתוב משהו'),
      fa: W('چیزی بنویسید'),
      ckb: W('شتێک بنووسە'),
      kmr: W('Tiştek binivîse'),
      syr: W('ܟܬܘܒ ܡܕܡ'),
      ur: W('کچھ لکھیں'),
      ps: W('یو څه ولیکئ'),
      sw: W('Andika kitu'),
      ha: W('Rubuta wani abu'),
      so: W('Wax qor'),
      mg: W('Manorata zavatra'),
      ht: W('Ekri yon bagay'),
      sn: W('Nyora chimwe chinhu'),
      rw: W('Andika ikintu'),
      ff: W('Winndu huunde'),
      am: W('አንድ ነገር ይጻፉ'),
      tzm: W('ⴰⵔⵓ ⴽⵔⴰ'),
      hi: W('कुछ लिखें'),
      ne: W('केही लेख्नुहोस्'),
      mr: W('काहीतरी लिहा'),
      bn: W('কিছু লিখুন'),
      as: W('কিবা লিখক'),
      gu: W('કંઈક લખો'),
      or: W('କିଛି ଲେଖନ୍ତୁ'),
      pa: W('ਕੁਝ ਲਿਖੋ'),
      ta: W('ஏதாவது எழுதுங்கள்'),
      te: W('ఏదైనా రాయండి'),
      kn: W('ಏನಾದರೂ ಬರೆಯಿರಿ'),
      ml: W('എന്തെങ്കിലും എഴുതുക'),
      si: W('යමක් ලියන්න'),
      th: W('เขียนอะไรสักอย่าง'),
      lo: W('ຂຽນບາງຢ່າງ'),
      my: W('တစ်ခုခုရေးပါ'),
      km: W('សរសេរអ្វីមួយ'),
      id: W('Tulis sesuatu'),
      ms: W('Tulis sesuatu'),
      jv: W('Tulis apa wae'),
      ceb: W('Pagsulat og usa ka butang'),
      vi: W('Viết gì đó'),
      ko: W('무언가를 써보세요'),
      zh: ['写点什么', '写点什么...', '寫點什麼', '寫點什麼...'],
      'zh-cn': W('写点什么'),
      'zh-tw': W('寫點什麼'),
      'zh-hk': W('寫點什麼'),
      ja: W('何かを書いてください'),
      ka: W('დაწერეთ რამე'),
      hy: W('Գրեք ինչ-որ բան'),
      et: W('Kirjuta midagi'),
      fi: W('Kirjoita jotain'),
      eo: W('Skribu ion'),
      fil: W('Sumulat ng isang bagay'),
      mt: W('Ikteb xi ħaġa'),
      eu: W('Idatzi zerbait'),
      co: W('Scrivi qualcosa'),
      fur: W('Scrîf alc'),
      szl: W('Napisz coś'),
      gn: W('Ehai peteĩ mba’e'),
    },
    J = (...e) => e,
    Y = {
      en: J('Post'),
      cs: J('Zveřejnit', 'Publikovat'),
      sk: J('Uverejniť', 'Publikovať'),
      pl: J('Opublikuj'),
      hu: J('Közzététel', 'Közzétesz'),
      sl: J('Objavi'),
      hr: J('Objavi'),
      sr: J('Објави'),
      mk: J('Објави'),
      be: J('Апублікаваць'),
      lt: J('Paskelbti'),
      lv: J('Publicēt'),
      uk: J('Опублікувати'),
      ru: J('Опубликовать'),
      tt: J('Бастыру', 'Урнаштыру'),
      tg: J('Нашр кардан', 'Интишор кардан'),
      es: J('Publicar'),
      'es-es': J('Publicar'),
      pt: J('Publicar'),
      'pt-br': J('Publicar'),
      'pt-pt': J('Publicar'),
      fr: J('Publier'),
      'fr-fr': J('Publier'),
      'fr-ca': J('Publier'),
      it: J('Pubblica', 'Pubblicare'),
      ca: J('Publica', 'Publicar'),
      gl: J('Publicar'),
      ro: J('Postează', 'Publică'),
      sc: J('Publica'),
      de: J('Posten', 'Veröffentlichen'),
      nl: J('Plaatsen', 'Posten'),
      'nl-be': J('Plaatsen', 'Posten'),
      fy: J('Berjocht', 'Pleatse'),
      af: J('Plaas'),
      da: J('Slå op', 'Publicer'),
      nb: J('Publiser', 'Legg ut'),
      nn: J('Publiser', 'Legg ut'),
      sv: J('Publicera'),
      is: J('Birta'),
      fo: J('Legg út', 'Birta'),
      ga: J('Postáil', 'Foilsigh'),
      cy: J('Postio', 'Cyhoeddi'),
      br: J('Postañ', 'Embann'),
      bs: J('Objavi'),
      sq: J('Posto', 'Publiko'),
      bg: J('Публикуване', 'Публикувай'),
      el: J('Δημοσίευση', 'Δημοσίευσε'),
      gn: J('Mbohasa', 'Moherakuã'),
      tr: J('Paylaş', 'Gönder'),
      uz: J('Joylash', 'E’lon qilish'),
      ky: J('Жарыялоо'),
      kk: J('Жариялау'),
      az: J('Paylaş', 'Dərc et'),
      mn: J('Нийтлэх'),
      ar: J('نشر'),
      he: J('פרסם', 'פרסום'),
      fa: J('انتشار', 'منتشر کردن'),
      ckb: J('بڵاوکردنەوە'),
      kmr: J('Weşandin', 'Belav bike'),
      syr: J('ܦܪܣ'),
      ur: J('پوسٹ کریں', 'شائع کریں'),
      ps: J('خپورول', 'پوسټ کول'),
      sw: J('Chapisha'),
      ha: J('Buga', 'Wallafa'),
      so: J('Daabac', 'Ku dheji'),
      mg: J('Alefaso', 'Avoahy'),
      ht: J('Pibliye', 'Poste'),
      sn: J('Tumira', 'Buritsa'),
      rw: J('Tangaza', 'Shyiraho'),
      ff: J('Bayyin', 'Winndu'),
      am: J('አትም', 'ያጋሩ'),
      tzm: J('ⵙⵙⵓⴼⵖ', 'ⴱⴹⵓ'),
      ber: J('ⵙⵙⵓⴼⵖ', 'ⴱⴹⵓ'),
      hi: J('पोस्ट करें', 'प्रकाशित करें'),
      ne: J('पोस्ट गर्नुहोस्', 'प्रकाशित गर्नुहोस्'),
      mr: J('पोस्ट करा', 'प्रकाशित करा'),
      bn: J('পোস্ট করুন', 'প্রকাশ করুন'),
      as: J('পোষ্ট কৰক', 'প্ৰকাশ কৰক'),
      gu: J('પોસ્ટ કરો', 'પ્રકાશિત કરો'),
      or: J('ପୋଷ୍ଟ କରନ୍ତୁ', 'ପ୍ରକାଶ କରନ୍ତୁ'),
      pa: J('ਪੋਸਟ ਕਰੋ', 'ਪ੍ਰਕਾਸ਼ਿਤ ਕਰੋ'),
      ta: J('இடுகையிடு', 'வெளியிடு'),
      te: J('పోస్ట్ చేయండి', 'ప్రచురించండి'),
      kn: J('ಪೋಸ್ಟ್ ಮಾಡಿ', 'ಪ್ರಕಟಿಸಿ'),
      ml: J('പോസ്റ്റ് ചെയ്യുക', 'പ്രസിദ്ധീകരിക്കുക'),
      si: J('පළ කරන්න', 'පෝස්ට් කරන්න'),
      th: J('โพสต์', 'เผยแพร่'),
      lo: J('ໂພສ', 'ເຜີຍແຜ່'),
      my: J('ပို့စ်တင်ရန်', 'ထုတ်ဝေရန်'),
      km: J('បង្ហោះ', 'ផ្សព្វផ្សាយ'),
      id: J('Posting', 'Terbitkan'),
      ms: J('Siar', 'Terbitkan'),
      jv: J('Kirim', 'Unggah'),
      ceb: J('I-post', 'Ipatik'),
      vi: J('Đăng', 'Xuất bản'),
      ko: J('게시', '게시하기'),
      zh: J('发布', '發佈'),
      'zh-cn': J('发布'),
      'zh-tw': J('發佈', '發布'),
      'zh-hk': J('發佈', '發布'),
      ja: J('投稿', '投稿する'),
      ka: J('გამოქვეყნება', 'გამოაქვეყნე'),
      hy: J('Հրապարակել'),
      et: J('Postita', 'Avalda'),
      fi: J('Julkaise'),
      eo: J('Afiŝi', 'Publikigi'),
      fil: J('I-post', 'I-publish'),
      mt: J('Ippubblika', 'Poġġi'),
      eu: J('Argitaratu'),
      co: J('Publicà', 'Postà'),
      fur: J('Publiche', 'Poste'),
      szl: J('Ôpublikuj', 'Napisz'),
      zaza: J('Vıla bike', 'Weşan'),
      zza: J('Vıla bike', 'Weşan'),
      iu: J('ᐅᖃᐅᓯᓕᕆᓂᖅ', 'ᓴᖅᑭᑦᑎᓗᒍ'),
      ik: J('Saqitqiñ', 'Post'),
    };
  function Q(t) {
    return Object.fromEntries(
      Object.entries(t).map(([t, n]) => [t.toLowerCase(), Array.from(new Set(n.map(e).filter(Boolean)))]),
    );
  }
  const Z = Q(X),
    ee = Q(Y),
    te = Z.en || [],
    ne = ee.en || [];
  function oe() {
    return document.documentElement.lang || null;
  }
  function re(e, t) {
    if (!e) return null;
    const n = e.toLowerCase().replace('_', '-');
    if (t[n]) return n;
    const o = n.split('-')[0];
    return t[o] ? o : null;
  }
  function ie(e) {
    const t = re(e, Z);
    return { key: t, hints: (t && Z[t]) || [] };
  }
  function ae(e) {
    const t = re(e, ee);
    return { key: t, hints: (t && ee[t]) || [] };
  }
  const se = 'div[role="button"], button';
  function le(e) {
    return (
      Array.from(
        e.querySelectorAll(
          '[role="textbox"][contenteditable="true"][data-lexical-editor="true"], [role="textbox"][contenteditable="true"]',
        ),
      ).filter(t)[0] || null
    );
  }
  function ce(e) {
    return !(
      e.closest('[role="dialog"]') ||
      e.closest('[role="article"]') ||
      e.closest('[role="tablist"]') ||
      e.closest('[role="navigation"]')
    );
  }
  function ue() {
    const e = document.querySelector('[role="main"]');
    if (!e) return null;
    const o = Array.from(e.querySelectorAll('a[role="link"][href*="/groups/"][href*="/user/"]'))
      .filter(t)
      .filter(ce);
    for (const r of o) {
      let e = r.parentElement;
      for (let o = 0; e && o < 6; e = e.parentElement, o++) {
        const o = Array.from(e.querySelectorAll('div[role="button"], button')).filter(t).filter(n).filter(ce);
        if (1 !== o.length) continue;
        const i = o[0];
        if (!i) continue;
        const a = e.getBoundingClientRect(),
          s = i.getBoundingClientRect(),
          l = r.getBoundingClientRect(),
          c = Math.abs(s.top + s.height / 2 - (l.top + l.height / 2)) < 24,
          u = s.width >= 0.45 * a.width && s.height >= 32 && s.height <= 64;
        if (c && u) return i;
      }
    }
    return null;
  }
  function de(e, o, i = 3) {
    return 0 === e.length
      ? []
      : Array.from(document.querySelectorAll(se))
          .filter(t)
          .filter(n)
          .filter(ce)
          .map((t) => {
            const n = r(t),
              i = (function (e, t) {
                for (const n of e) for (const e of t) if (e && n.includes(e)) return e;
                return null;
              })(n, e);
            if (!i) return null;
            return { element: t, labels: n.slice(0, 4), matchedLang: o, matchedHint: i };
          })
          .filter((e) => null !== e)
          .slice(0, i);
  }
  function me() {
    const e = ie(oe()),
      t = [{ lang: 'en', hints: te }];
    return (e.key && 'en' !== e.key && e.hints.length > 0 && t.push({ lang: e.key, hints: e.hints }), t);
  }
  function ge(e) {
    const n = oe(),
      o = ie(n),
      i = o.key && 'en' !== o.key ? ['en', o.key] : ['en'],
      a = {
        htmlLang: n,
        hintKey: o.key,
        searched: i,
        structuralSearchEnabled: !0,
        matchedCandidates: e
          .slice(0, 5)
          .map((e) => ({
            labels: e.labels.slice(0, 3),
            matchedLang: e.matchedLang || null,
            matchedHint: e.matchedHint || null,
          })),
        visibleLabels: Array.from(document.querySelectorAll(se))
          .filter(t)
          .filter(ce)
          .flatMap(r)
          .filter((e) => e.length < 120)
          .slice(0, 20),
      };
    return JSON.stringify(a).slice(0, 1500);
  }
  function findFacebookPostTrigger() {
    const visible = (el) => {
      try {
        return !!el && t(el) && !el.closest('[role="navigation"],[role="complementary"]');
      } catch {
        return false;
      }
    };
    const norm = (v) =>
      String(v ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const trigger =
      /^(?:write something(?:\.{3})?|create(?: a)? post|what'?s on your mind|start a post|post something|post an update|đăng bài|tạo bài viết|viết gì đó)$/i;
    const nodes = Array.from(document.querySelectorAll('button,[role="button"],a,span,div')).filter(visible);
    for (const el of nodes) {
      const label = norm(
        [
          el.innerText,
          el.textContent,
          el.getAttribute('aria-label'),
          el.getAttribute('title'),
          el.getAttribute('placeholder'),
        ]
          .filter(Boolean)
          .join(' '),
      );
      if (!trigger.test(label)) continue;
      let target = el;
      if (!/^(button|a)$/i.test(target.tagName) && target.getAttribute('role') !== 'button') {
        const parent = target.closest('button,[role="button"],a');
        if (parent && visible(parent)) target = parent;
      }
      if (target.closest('[role="navigation"],[role="complementary"]')) continue;
      return target;
    }
    return null;
  }
  function closeFacebookComposerSurface() {
    try {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(t).reverse();
      const dialog =
        dialogs.find((d) => findReferenceComposerTextbox() && d.contains(findReferenceComposerTextbox())) ||
        dialogs[0] ||
        null;
      if (dialog) {
        const closeLabels =
          /^(?:close|cancel|back|hủy|đóng|cerrar|fermer|schließen|закрыть|إغلاق|閉じる|닫기)$/iu;
        const buttons = Array.from(dialog.querySelectorAll('button,[role="button"]')).filter(t);
        const close = buttons.find((b) =>
          closeLabels.test(
            e(
              [b.getAttribute('aria-label'), b.getAttribute('title'), b.innerText, b.textContent]
                .filter(Boolean)
                .join(' '),
            ),
          ),
        );
        if (close) {
          close.click();
          return true;
        }
      }
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      document.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    } catch {}
    return false;
  }
  async function pe() {
    // Fast composer gate: activate the visible Write something surface once,
    // then give Facebook a short bounded window to create the dialog. If it
    // does not appear, close any residual surface and return SKIPPED immediately.
    const triggerXpath =
      '//div[@role="button"][contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"write something") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"what\'s on your mind") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"write a post") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"create a public post") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"tulis sesuatu") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"apa yang anda pikirkan") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"buat siaran awam") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"siarkan")]';
    const deadline = Date.now() + 2500;
    let lastTrigger = null;
    while (Date.now() < deadline) {
      const existing = findReferenceComposerTextbox();
      if (existing) return { success: true };
      try {
        lastTrigger = document.evaluate(
          triggerXpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } catch {
        lastTrigger = null;
      }
      if (!(lastTrigger instanceof HTMLElement)) lastTrigger = findFacebookPostTrigger();
      if (lastTrigger instanceof HTMLElement) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (lastTrigger instanceof HTMLElement) {
      try {
        lastTrigger.click();
      } catch {}
      const box = await waitForReferenceComposerTextbox(3000);
      if (box) return { success: true };
    }
    const diagnostics = JSON.stringify({
      triggerFound: !!lastTrigger,
      htmlLang: document.documentElement.lang || null,
      dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).length,
      visibleWriteSomething: !!findFacebookPostTrigger(),
      waitMs: 2500,
    }).slice(0, 1800);
    closeFacebookComposerSurface();
    return {
      success: false,
      skip: true,
      code: 'GROUP_COMPOSER_NOT_OPEN',
      message:
        'Facebook did not open the Create post composer after activating the Write something surface. Skipping immediately.',
      diagnostics,
    };
  }

  function findReferenceComposerTextbox() {
    // Exact FAB reference textbox lookup: dialog-scoped contenteditable textbox.
    // Do not require geometry, visibility, aria-disabled, or an existing Post
    // button to discover the editor.
    const xpath = '//div[@role="dialog"]//div[@role="textbox"][@contenteditable="true"]';
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      if (result instanceof HTMLElement) return result;
    } catch {}
    const dialogs = o().reverse();
    for (const dialog of dialogs) {
      const box = dialog.querySelector('div[role="textbox"][contenteditable="true"]');
      if (box) return box;
    }
    return null;
  }
  async function waitForReferenceComposerTextbox(timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const box = findReferenceComposerTextbox();
      if (box) return box;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }
  function fe() {
    return findReferenceComposerTextbox();
  }
  const he = new Set(
    [
      'Post',
      'Publier',
      'पोस्ट करें',
      'পোস্ট করুন',
      'پوسٹ کریں',
      'Opublikuj',
      'Publicar',
      'Postar',
      'Publicar ahora',
      'Veröffentlichen',
      'Опубликовать',
      'Разместить',
      'Опублікувати',
      'Розмістити',
      'Надіслати',
      'نشر',
      'โพสต์',
      'Kirim',
      'I-post',
      'Paylaş',
      '게시',
      '投稿',
      '发布',
      'Đăng',
      'đăng',
    ].map(e),
  );
  function be(e) {
    return (
      Array.from(
        e.querySelectorAll(
          "div[contenteditable='true'][role='textbox'], div[contenteditable='true'][data-lexical-editor='true']",
        ),
      ).filter(t)[0] || null
    );
  }
  function we(e, o, a) {
    if (!o.contains(e) || !t(e) || !n(e)) return -1e4;
    if (i([r(e).join(' ')], $)) return -1e4;
    if (
      !(function (e) {
        return r(e).some((e) => he.has(e));
      })(e)
    )
      return -1e4;
    let s = 0;
    s += 100;
    const l = o.getBoundingClientRect(),
      c = e.getBoundingClientRect(),
      u = a.getBoundingClientRect();
    c.top > l.top + 0.45 * l.height && (s += 20);
    return (Math.abs(c.top - u.bottom) < 260 && (s += 15), 'submit' === e.type && (s += 10), s);
  }
  function ve(e) {
    return t(e) && n(e) && 'true' !== e.getAttribute('aria-disabled') && !e.hasAttribute('disabled');
  }
  function ye(e, t, n) {
    if (0 === t.length) return null;
    const o = e.closest('form[method="POST"], form[method="post"]');
    if (!o || o.closest('[role="article"]')) return null;
    const i = o.querySelector('input[type="submit"]'),
      a = o.querySelector('input[type="file"][multiple][accept*="image"][accept*="video"]');
    if (!i || !a) return null;
    const s = Array.from(o.querySelectorAll('div[role="button"], button, input[type="submit"]')),
      l = s.indexOf(i);
    if (l <= 0) return null;
    const c = o.getBoundingClientRect(),
      u = e.getBoundingClientRect(),
      d = s
        .slice(0, l)
        .filter((e) => e.matches('div[role="button"], button'))
        .filter(ve)
        .filter((e) => {
          const t = e.getBoundingClientRect();
          return (
            t.top > u.bottom &&
            t.top > c.top + 0.55 * c.height &&
            t.width >= Math.min(320, 0.45 * c.width) &&
            t.height >= 32 &&
            t.height <= 56
          );
        })
        .map((e) => {
          const n = r(e),
            o = (function (e, t) {
              for (const n of e) for (const e of t) if (e && n === e) return e;
              return null;
            })(n, t);
          return o ? { button: e, labels: n, matchedHint: o } : null;
        })
        .filter((e) => Boolean(e)),
      m = d.length > 0 ? d[d.length - 1] : null;
    return m ? (m.matchedHint, m.labels.slice(0, 3), m.button) : null;
  }
  function Ee(e) {
    const t = (function (e) {
      return e
        ? e.closest('[role="dialog"]')
        : o()
            .reverse()
            .find((e) => be(e)) || null;
    })(e);
    if (!t) return null;
    const n = e && t.contains(e) ? e : be(t);
    if (!n) return null;
    const i = Array.from(t.querySelectorAll('div[role="button"], button'))
      .map((e) => ({ button: e, score: we(e, t, n) }))
      .filter((e) => e.score > 0)
      .sort((e, t) => t.score - e.score)[0];
    return i ? (i.score, r(i.button).slice(0, 4), i.button) : null;
  }
  function Pe() {
    return Se(null);
  }
  function Se(e) {
    if (!e) return Ee(null);
    const t = ye(e, ne);
    if (t) return t;
    const n = ae(oe());
    if (n.key && 'en' !== n.key && n.hints.length > 0) {
      const t = ye(e, n.hints, n.key);
      if (t) return t;
    }
    const o = (function (e) {
      const t = e.closest('form[method="POST"], form[method="post"]');
      if (!t || t.closest('[role="article"]')) return null;
      const n = t.querySelector('input[type="submit"]'),
        o = t.querySelector('input[type="file"][multiple][accept*="image"][accept*="video"]');
      if (!n || !o) return null;
      const r = Array.from(t.querySelectorAll('div[role="button"], button, input[type="submit"]')),
        i = r.indexOf(n);
      if (i <= 0) return null;
      const a = t.getBoundingClientRect(),
        s = e.getBoundingClientRect(),
        l = r
          .slice(0, i)
          .filter((e) => e.matches('div[role="button"], button'))
          .filter(ve)
          .filter((e) => {
            const t = e.getBoundingClientRect();
            return (
              t.top > s.bottom &&
              t.top > a.top + 0.55 * a.height &&
              t.width >= Math.min(320, 0.45 * a.width) &&
              t.height >= 32 &&
              t.height <= 56
            );
          });
      return l.length > 0 ? l[l.length - 1] : null;
    })(e);
    return o || Ee(e);
  }
  function Ae(e, t, n) {
    const o = new Error(n || t);
    return ((o.name = 'PostingUserError'), (o.code = e), (o.userMessage = t), (o.debugMessage = n), o);
  }
  function isRetryableMediaError(e) {
    const t = String(e?.code || '');
    return /^MEDIA_ATTACH_|^MEDIA_FETCH_/.test(t);
  }
  function Ie(e) {
    return e.replace(/\r\n?/g, '\n');
  }
  function Ce(e) {
    return (function (e) {
      return e
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    })(Ie(e)).replace(/\n/g, '<br>');
  }
  async function applyFacebookBackground(form, bg) {
    const target = String(bg ?? '').trim();
    if (!target) return { applied: false, reason: 'NO_BACKGROUND' };
    const root =
      form?.closest?.('[role="dialog"]') ||
      o()
        .reverse()
        .find((d) => be(d)) ||
      document;
    const norm = (x) =>
      String(x ?? '')
        .replace(/\s+/g, '')
        .toLowerCase();
    const extractColors = (x) => {
      const out = [];
      for (const m of String(x ?? '').matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
        let h = m[1];
        if (h.length === 3)
          h = h
            .split('')
            .map((c) => c + c)
            .join('');
        out.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
      }
      for (const m of String(x ?? '').matchAll(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/gi))
        out.push([+m[1], +m[2], +m[3]]);
      return out;
    };
    const wanted = extractColors(target);
    const label = (el) =>
      String(
        [
          el.getAttribute?.('aria-label'),
          el.getAttribute?.('title'),
          el.getAttribute?.('data-tooltip-content'),
          el.getAttribute?.('data-color'),
          el.getAttribute?.('data-background-color'),
          el.innerText,
          el.textContent,
        ]
          .filter(Boolean)
          .join(' '),
      )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const styleData = (el) => {
      const vals = [];
      for (const pseudo of [null, '::before', '::after']) {
        try {
          const cs = getComputedStyle(el, pseudo);
          vals.push(cs.backgroundColor, cs.backgroundImage, cs.background, cs.borderColor);
        } catch {}
      }
      vals.push(
        el.style?.background,
        el.style?.backgroundColor,
        el.style?.backgroundImage,
        el.getAttribute?.('data-color'),
        el.getAttribute?.('data-background-color'),
      );
      return vals.filter(Boolean).join('|');
    };
    const visible = (el) => t(el) && n(el);
    let aa = Array.from(root.querySelectorAll('button,[role="button"],[tabindex="0"]')).find(
      (el) => visible(el) && /^aa$/i.test(String(el.innerText || el.textContent || '').trim()),
    );
    if (!aa)
      aa = Array.from(root.querySelectorAll('button,[role="button"],[tabindex="0"]')).find((el) => {
        const q = label(el);
        return (
          visible(el) &&
          /(background|color|colour|style)/i.test(q) &&
          !/(photo|video|emoji|feeling|location|gif)/i.test(q)
        );
      });
    if (!aa) return { applied: false, reason: 'BACKGROUND_BUTTON_NOT_FOUND' };
    // Exactly one activation. Do not dispatch mousedown/up/click plus .click(),
    // because Facebook treats that as toggle-open then toggle-close.
    try {
      aa.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      aa.click();
    } catch {
      return { applied: false, reason: 'BACKGROUND_BUTTON_CLICK_FAILED' };
    }
    const palette = await a(
      () => {
        const dialogs = o().filter((d) => d !== root);
        const candidates = [...dialogs, root];
        for (const d of candidates) {
          const els = Array.from(d.querySelectorAll('button,[role="button"],[tabindex="0"]')).filter(
            (el) => visible(el) && el !== aa,
          );
          const colorish = els.filter((el) => {
            const raw = styleData(el),
              q = label(el);
            return extractColors(raw).length > 0 || /(background|color|colour|gradient|solid)/i.test(q);
          });
          if (colorish.length >= 3) return { root: d, els };
        }
        return null;
      },
      6000,
      150,
    );
    if (!palette) {
      return { applied: false, reason: 'BACKGROUND_PALETTE_NOT_FOUND' };
    }
    const candidates = palette.els;
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    let best = null;
    for (const el of candidates) {
      const raw = styleData(el),
        q = label(el),
        colors = extractColors(raw);
      let score = 0;
      const nt = norm(target),
        nr = norm(raw);
      if (nt && nr.includes(nt)) score += 220;
      if (wanted.length && colors.length) {
        const distances = wanted.map((w) => Math.min(...colors.map((c) => dist(w, c))));
        const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
        score += Math.max(0, 160 - avg * 1.8);
      }
      if (/background|color|colour|gradient|solid/i.test(q)) score += 10;
      const rr = el.getBoundingClientRect();
      if (rr.width >= 18 && rr.height >= 18 && rr.width <= 140 && rr.height <= 140) score += 10;
      if (!best || score > best.score) best = { el, score, raw, q };
    }
    if (!best || best.score < 22)
      return {
        applied: false,
        reason: 'BACKGROUND_OPTION_NOT_MATCHED',
        requested: target,
        candidates: candidates.length,
      };
    try {
      best.el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      best.el.click();
      await V(0.8);
      return { applied: true, score: best.score, matchedLabel: best.q || '' };
    } catch {
      return { applied: false, reason: 'BACKGROUND_OPTION_CLICK_FAILED' };
    }
  }
  function mediaMimeExtension(mime) {
    const m = String(mime || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    const map = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'video/x-matroska': 'mkv',
      'video/mpeg': 'mpeg',
      'video/ogg': 'ogv',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/heic': 'heic',
      'image/heif': 'heif',
      'image/avif': 'avif',
    };
    return map[m] || '';
  }
  function safeMediaFileName(entry, index, mime) {
    const ext = mediaMimeExtension(mime);
    const raw = String(entry?.filename || '').trim();
    const fallback = `upload_${index + 1}${ext ? '.' + ext : ''}`;
    if (!raw) return fallback;
    const clean = raw.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim() || fallback;
    if (!ext) return clean;
    const dot = clean.lastIndexOf('.');
    const currentExt = dot > 0 ? clean.slice(dot + 1).toLowerCase() : '';
    if (currentExt === ext) return clean;
    const base = dot > 0 ? clean.slice(0, dot) : clean;
    return `${base}.${ext}`;
  }
  function composerMediaErrorText(root) {
    const text = String(root?.innerText || root?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return null;
    const patterns = [
      /your file can'?t be uploaded/i,
      /video upload failed/i,
      /photo upload failed/i,
      /file upload failed/i,
      /couldn'?t upload/i,
      /could not upload/i,
      /unable to upload/i,
      /failed to upload/i,
    ];
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m) return m[0];
    }
    return null;
  }
  function composerMediaSnapshot(root, baseline, anchor, expectedEntries = []) {
    const scope = root || document;
    const anchorRect = anchor?.getBoundingClientRect?.() || null;
    const elements = Array.from(scope.querySelectorAll('img,video'))
      .filter(t)
      .filter((el) => {
        const rr = el.getBoundingClientRect();
        if (rr.width < 120 || rr.height < 80) return false;
        if (anchorRect && rr.top < anchorRect.bottom - 20) return false;
        if (el.tagName === 'VIDEO') return el.readyState >= 1 && el.videoWidth > 0 && el.videoHeight > 0;
        return el.complete && el.naturalWidth > 0 && el.naturalHeight > 0;
      });
    const changed = elements.filter((el) => !baseline.has(el) || baseline.get(el) !== _e(el));
    const progress = Array.from(
      scope.querySelectorAll('[role="progressbar"],progress,[aria-busy="true"],[aria-valuenow]'),
    ).filter(t);
    const expectedNames = (Array.isArray(expectedEntries) ? expectedEntries : [])
      .map((entry, index) => safeMediaFileName(entry, index, String(entry?.mimeType || '')))
      .filter(Boolean);
    const allText = String(scope.innerText || scope.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const fileInputs = Array.from(scope.querySelectorAll('input[type="file"]'));
    const inputNames = fileInputs.flatMap((input) =>
      Array.from(input.files || []).map((f) =>
        String(f?.name || '')
          .trim()
          .toLowerCase(),
      ),
    );
    const attrNames = Array.from(
      scope.querySelectorAll('[aria-label],[title],[alt],[data-filename],[data-file-name]'),
    ).flatMap((el) =>
      [
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.getAttribute('alt'),
        el.getAttribute('data-filename'),
        el.getAttribute('data-file-name'),
      ]
        .filter(Boolean)
        .map((x) => String(x).trim().toLowerCase()),
    );
    const attachmentHits = expectedNames.map((name) => {
      const needle = name.toLowerCase();
      return (
        inputNames.includes(needle) ||
        attrNames.some((x) => x === needle || x.includes(needle)) ||
        allText.includes(needle)
      );
    });
    const attachmentCount = attachmentHits.filter(Boolean).length;
    const attachmentSignature = attachmentHits
      .map((hit, index) => (hit ? expectedNames[index] : ''))
      .join('|');
    const signature = changed.map(_e).sort().join('||') + '||ATTACH:' + attachmentSignature;
    return {
      changedCount: changed.length,
      signature,
      uploadInProgress: progress.length > 0,
      error: composerMediaErrorText(root),
      elements: changed,
      attachmentCount,
      attachmentExpected: expectedNames.length,
      attachmentSignature,
    };
  }
  async function waitForComposerMediaReady(root, baseline, expectedCount, opts = {}) {
    const hasVideo = !!opts.hasVideo;
    const timeoutMs = Number(opts.timeoutMs) || (hasVideo ? 10 * 60 * 1000 : 2 * 60 * 1000);
    // v5.75: a video that makes no measurable media progress for several minutes is
    // treated as stalled. The worker will close this popup and retry once instead of
    // leaving the queue waiting for the old 15-minute video timeout.
    const stallTimeoutMs = Number(opts.stallTimeoutMs) || (hasVideo ? 45 * 1000 : 45 * 1000);
    // v5.82: video preview rendering is NOT required for attachment acceptance.
    // Facebook may show a valid gray filename card while server-side video processing continues. The worker aborts the active run and retries from a
    // fresh Facebook popup instead of leaving a slow/hung tab waiting for minutes.
    const pollMs = Number(opts.pollMs) || 350;
    const started = Date.now();
    let stable = 0,
      lastSig = '';
    let lastProgressAt = started,
      lastCount = -1,
      lastProgressSignature = '';
    while (Date.now() - started < timeoutMs) {
      if (opts.shouldAbort?.()) throw new Error('Posting aborted while waiting for media upload');
      const snap = composerMediaSnapshot(root, baseline, opts.anchor, opts.expectedEntries);
      if (snap.error) {
        opts.onProgress?.({
          mediaExpectedCount: expectedCount,
          mediaPreviewCount: snap.changedCount,
          mediaAttachmentEvidenceCount: snap.attachmentCount,
          mediaUploadInProgress: false,
          mediaUploadProgress: null,
          mediaAttachmentPhase: 'MEDIA_UPLOAD_ERROR',
          mediaAttachmentDiagnostics: snap.error,
        });
        throw Ae('MEDIA_ATTACH_FAILED', "Couldn't attach media", snap.error);
      }
      const elapsed = Math.round((Date.now() - started) / 1000);
      const progressSignature = `${snap.changedCount}|${snap.signature}|${snap.uploadInProgress ? '1' : '0'}`;
      if (snap.changedCount > lastCount || progressSignature !== lastProgressSignature) {
        lastCount = snap.changedCount;
        lastProgressSignature = progressSignature;
        lastProgressAt = Date.now();
      }
      // Facebook can legitimately show a video attachment as a gray card with
      // only the filename while its server-side preview/transcoding is still
      // being prepared. The Post button can already be valid in that state.
      // Treat an explicit filename/file-input attachment as accepted media and
      // do not confuse 'preview not rendered yet' with an upload stall.
      const attachmentAccepted = snap.attachmentCount >= expectedCount;
      if (
        hasVideo &&
        !attachmentAccepted &&
        snap.changedCount < expectedCount &&
        Date.now() - lastProgressAt >= stallTimeoutMs
      ) {
        const stallMsg = `Video upload/processing appears stalled after ${elapsed}s (${snap.changedCount}/${expectedCount} preview ready; ${snap.attachmentCount}/${expectedCount} attachment accepted). Retrying this group.`;
        opts.onProgress?.({
          mediaExpectedCount: expectedCount,
          mediaPreviewCount: snap.changedCount,
          mediaAttachmentEvidenceCount: snap.attachmentCount,
          mediaUploadInProgress: false,
          mediaUploadProgress: null,
          mediaAttachmentPhase: 'MEDIA_STALLED',
          mediaAttachmentDiagnostics: stallMsg,
        });
        throw Ae('MEDIA_ATTACH_STALLED', 'Video upload appears stalled', stallMsg);
      }
      opts.onProgress?.({
        mediaExpectedCount: expectedCount,
        mediaPreviewCount: snap.changedCount,
        mediaAttachmentEvidenceCount: snap.attachmentCount,
        mediaUploadInProgress: snap.uploadInProgress || snap.changedCount < expectedCount,
        mediaUploadProgress: null,
        mediaAttachmentPhase:
          snap.changedCount < expectedCount
            ? 'WAITING_FOR_PREVIEW'
            : snap.uploadInProgress
              ? 'WAITING_FOR_UPLOAD'
              : 'VERIFYING_MEDIA',
        mediaAttachmentDiagnostics: `Media preview ${snap.changedCount}/${expectedCount} · attachment ${snap.attachmentCount}/${expectedCount}${hasVideo ? ' · video processing' : ''} · ${elapsed}s`,
      });
      if (
        (snap.changedCount >= expectedCount && !snap.uploadInProgress) ||
        (attachmentAccepted && hasVideo)
      ) {
        stable = snap.signature === lastSig ? stable + 1 : 1;
        lastSig = snap.signature;
        if (stable >= 2) {
          opts.onProgress?.({
            mediaExpectedCount: expectedCount,
            mediaPreviewCount: snap.changedCount,
            mediaAttachmentEvidenceCount: snap.attachmentCount,
            mediaUploadInProgress: false,
            mediaUploadProgress: null,
            mediaAttachmentPhase: 'CONFIRMED',
            mediaAttachmentDiagnostics: `Media upload confirmed ${snap.changedCount}/${expectedCount} after ${elapsed}s`,
          });
          return true;
        }
      } else {
        stable = 0;
        lastSig = '';
      }
      await Ne(pollMs);
    }
    const final = composerMediaSnapshot(root, baseline, opts.anchor, opts.expectedEntries);
    const msg = hasVideo
      ? `Video upload/processing did not finish within ${Math.round(timeoutMs / 60000)} minutes (${final.changedCount}/${expectedCount} media ready).`
      : `Media upload did not finish within ${Math.round(timeoutMs / 1000)} seconds (${final.changedCount}/${expectedCount} media ready).`;
    opts.onProgress?.({
      mediaExpectedCount: expectedCount,
      mediaPreviewCount: final.changedCount,
      mediaAttachmentEvidenceCount: final.attachmentCount,
      mediaUploadInProgress: false,
      mediaUploadProgress: null,
      mediaAttachmentPhase: 'MEDIA_TIMEOUT',
      mediaAttachmentDiagnostics: msg,
    });
    throw Ae('MEDIA_ATTACH_TIMEOUT', "Couldn't finish media upload", msg);
  }
  async function injectFabReferenceTextAndMedia(textbox, text, mediaEntries, opts = {}) {
    if (!textbox)
      throw Ae(
        'TEXTBOX_NOT_FOUND',
        "Couldn't find Facebook's post box",
        'Reference FAB injector received no textbox',
      );
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const dialog = textbox.closest('[role="dialog"]') || document;
    const baseline = De(dialog);
    textbox.focus();
    textbox.click();
    let selection = window.getSelection();
    let range = document.createRange();
    range.selectNodeContents(textbox);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (text && String(text).trim() !== '') {
      const dt = new DataTransfer();
      dt.setData('text/plain', String(text));
      const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      textbox.dispatchEvent(pasteEvent);
      textbox.dispatchEvent(new Event('input', { bubbles: true }));
      if (Array.isArray(mediaEntries) && mediaEntries.length > 0) await wait(250);
    }
    if (Array.isArray(mediaEntries) && mediaEntries.length > 0) {
      const hasVideo = mediaEntries.some((entry) =>
        String(entry?.mimeType || '')
          .toLowerCase()
          .startsWith('video/'),
      );
      for (let index = 0; index < mediaEntries.length; index++) {
        if (opts.shouldAbort?.()) throw new Error('Posting aborted before media attachment');
        const entry = mediaEntries[index] || {};
        const dataUrl = String(entry.data || '');
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0]?.match(/:(.*?);/);
        const mime = String(mimeMatch?.[1] || entry.mimeType || 'application/octet-stream').toLowerCase();
        const binary = atob(parts[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const fileName = safeMediaFileName(entry, index, mime);
        const file = new File([blob], fileName, { type: mime, lastModified: Date.now() });
        const dt = new DataTransfer();
        dt.items.add(file);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        textbox.dispatchEvent(pasteEvent);
        textbox.dispatchEvent(new Event('input', { bubbles: true }));
        const isVideo = mime.startsWith('video/');
        opts.onProgress?.({
          mediaExpectedCount: mediaEntries.length,
          mediaPreviewCount: 0,
          mediaUploadInProgress: true,
          mediaUploadProgress: null,
          mediaAttachmentPhase: 'MEDIA_PASTE_FILE',
          mediaAttachmentDiagnostics: `FAB_EXACT_PASTE_FILE:${index + 1}/${mediaEntries.length}:${file.name}:${mime}`,
        });
        await waitForComposerMediaReady(dialog, baseline, index + 1, {
          anchor: textbox,
          hasVideo: isVideo,
          timeoutMs: isVideo ? 10 * 60 * 1000 : 2 * 60 * 1000,
          stallTimeoutMs: 90 * 1000,
          pollMs: 350,
          expectedEntries: mediaEntries.slice(0, index + 1),
          onProgress: opts.onProgress,
        });
      }
    }
    if (Array.isArray(mediaEntries) && mediaEntries.length > 0)
      await wait(
        mediaEntries.some((entry) =>
          String(entry?.mimeType || '')
            .toLowerCase()
            .startsWith('video/'),
        )
          ? 400
          : 250,
      );
    opts.onProgress?.({
      mediaExpectedCount: Array.isArray(mediaEntries) ? mediaEntries.length : 0,
      mediaPreviewCount: Array.isArray(mediaEntries) ? mediaEntries.length : 0,
      mediaUploadInProgress: false,
      mediaUploadProgress: null,
      mediaAttachmentPhase: 'MEDIA_PASTE_COMPLETE',
      mediaAttachmentDiagnostics: `FAB_EXACT_PASTE_COMPLETE:${Array.isArray(mediaEntries) ? mediaEntries.length : 0}`,
    });
    return { success: true, mediaCount: Array.isArray(mediaEntries) ? mediaEntries.length : 0 };
  }
  async function Te(text, form, opts = {}) {
    if ((await V(U), opts.shouldAbort?.())) throw new Error('Posting aborted before text injection');
    const box = form && document.contains(form) && form.isConnected ? form : await a(fe, 1e3 * D, 1e3 * _);
    if (!box)
      throw Ae('TEXTBOX_NOT_FOUND', "Couldn't find Facebook's post box", 'Textbox not found after timeout');
    // v5.55: preserve the submitted payload exactly; verification may normalize, injection may not.
    const value = String(text ?? '');
    const referenceMediaEntries = Array.isArray(opts.referenceFabMediaEntries)
      ? opts.referenceFabMediaEntries
      : [];
    box.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    box.click();
    box.focus();
    await V(L);
    if (opts.shouldAbort?.()) throw new Error('Posting aborted before input');
    const read = () =>
      String(box.innerText || box.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
        .replace(/^\s+|\s+$/g, '');
    const normalizeText = (x) =>
      String(x ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/^\s+|\s+$/g, '');
    const compact = (x) => normalizeText(x).replace(/\s+/g, '');
    const valueNorm = normalizeText(value),
      valueCompact = compact(value);
    const textCandidates = () =>
      Array.from(
        new Set(
          [read(), String(box.textContent || ''), String(box.innerText || '')]
            .map(normalizeText)
            .filter(Boolean),
        ),
      );
    // Facebook/Lexical may represent the same visible text with extra block/mention
    // nodes, NBSPs, zero-width markers, or slightly different whitespace. Do not
    // reject a valid visible insertion merely because its DOM representation is
    // not byte-for-byte identical to the requested string.
    const insertionAccepted = () => {
      const candidates = textCandidates();
      for (const candidate of candidates) {
        if (candidate === valueNorm) return true;
        const cc = compact(candidate);
        if (valueCompact && cc.includes(valueCompact)) return true;
        if (
          valueCompact &&
          cc.length >= Math.max(1, Math.floor(valueCompact.length * 0.92)) &&
          valueCompact.includes(cc)
        )
          return true;
        const wantedTokens = valueNorm.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const gotLower = candidate.toLocaleLowerCase();
        if (
          wantedTokens.length &&
          wantedTokens.filter((tok) => gotLower.includes(tok)).length / wantedTokens.length >= 0.97
        )
          return true;
      }
      return false;
    };
    const selectAllBox = () => {
      try {
        box.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(box);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return true;
      } catch {
        return false;
      }
    };
    const clearBox = () => {
      try {
        box.focus();
        selectAllBox();
        document.execCommand('delete', false, null);
      } catch {}
      try {
        box.innerHTML = '';
      } catch {}
      try {
        box.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'deleteContentBackward',
            data: null,
          }),
        );
      } catch {
        box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    };
    const waitEmpty = async () => {
      for (let i = 0; i < 20; i++) {
        if (!read()) return true;
        clearBox();
        await V(0.06);
      }
      return !read();
    };
    const insertPlain = async () => {
      if (!(await waitEmpty())) return false;
      box.focus();
      const ok = document.execCommand('insertText', false, value);
      return !!ok;
    };
    const insertPaste = async () => {
      if (!(await waitEmpty())) return false;
      box.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', value);
      dt.setData('text/html', Ce(value));
      box.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
      );
      box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return true;
    };
    let inserted = false;
    if (referenceMediaEntries.length) {
      try {
        const refResult = await injectFabReferenceTextAndMedia(box, value, referenceMediaEntries, {
          shouldAbort: opts.shouldAbort,
          onProgress: opts.onProgress,
        });
        inserted = !!refResult.success;
        opts.referenceFabMediaInjected = true;
      } catch (err) {
        // A transient Facebook media stall/fetch failure is intentionally retryable.
        // Do not emit console.warn here: Chrome's extension error surface can expose
        // recoverable media events as red extension errors even though the worker
        // correctly retries the group and continues the queue.
        // Genuine non-media injection failures remain visible through normal errors.
        if (!isRetryableMediaError(err)) {
          console.warn('[FABReference] combined text/media injection failed:', err);
        }
        // Combined text + media is an atomic operation. Media failures must remain
        // retryable; the old TEXT_INJECTION_FAILED classification made the worker
        // skip the group immediately and bypass its fresh-popup retry.
        const rawCode = String(err?.code || '');
        const rawMessage = String(err?.message || err || '');
        const retryCode = /MEDIA_ATTACH_|MEDIA_FETCH_/.test(rawCode) ? rawCode : 'MEDIA_ATTACH_FAILED';
        throw Ae(retryCode, "Couldn't attach media", rawMessage || 'Combined text/media injection failed');
      }
    } else {
      let inserted = false;
      // v5.55: use the same multiline clipboard payload that preserves paragraph
      // breaks (<br> per newline) as the primary text path. The raw value above is
      // never whitespace-collapsed. execCommand remains a fallback only.
      try {
        inserted = await insertPaste();
        await V(x);
        inserted = inserted && insertionAccepted();
      } catch (err) {
        console.warn('[TextInjection] exact multiline paste failed:', err);
        inserted = false;
      }
      if (!inserted) {
        // If Facebook already contains the requested text semantically, never clear
        // a valid insertion merely because Lexical represented it differently.
        if (insertionAccepted()) inserted = true;
      }
      if (!inserted) {
        try {
          inserted = await insertPlain();
          await V(x);
          inserted = inserted && insertionAccepted();
        } catch (err) {
          console.warn('[TextInjection] execCommand fallback failed:', err);
          inserted = false;
        }
      }
      if (!inserted)
        throw Ae(
          'TEXT_INJECTION_FAILED',
          "Couldn't enter the post content",
          'Facebook composer did not accept the supplied text',
        );
    }
    if (opts.shouldAbort?.()) throw new Error('Posting aborted after input');
    dismissFacebookEntitySuggestions();
    // Defense-in-depth for Facebook's background rules:
    // <=130 chars + no newline + no media only. The worker already evaluates the
    // final variant; this second gate prevents accidental background selection if
    // another caller supplies an invalid background request.
    const backgroundAllowed =
      String(opts.background || '').trim() &&
      value.length <= 130 &&
      !/[\r\n]/.test(value) &&
      !(Array.isArray(opts.mediaIds) && opts.mediaIds.length);
    if (backgroundAllowed) {
      try {
        const bgResult = await applyFacebookBackground(form, opts.background);
        if (bgResult.applied) console.info('[Background] Facebook background selected', bgResult);
        else console.info('[Background] Background selection skipped', bgResult);
        opts.onBackgroundResult?.(bgResult);
      } catch (err) {
        console.info(
          '[Background] background selection failed without blocking post',
          String(err?.message || err),
        );
        opts.onBackgroundResult?.({ applied: false, reason: `BACKGROUND_ERROR: ${err?.message || err}` });
      }
    }
    if (!opts.referenceFabMediaInjected && typeof opts.beforeSubmit === 'function') {
      const hookResult = await opts.beforeSubmit(box);
      if (hookResult === false)
        throw Ae(
          'MEDIA_ATTACH_FAILED',
          'Could not attach media before submission',
          'The media pre-submit hook reported failure',
        );
      if (opts.shouldAbort?.()) throw new Error('Posting aborted after media attachment');
    }
    opts.onReadyToSubmit?.();
    // Find the native Facebook Post control only inside the active composer dialog.
    const findPostButton = () => {
      const dialog =
        box.closest('[role="dialog"]') ||
        o()
          .reverse()
          .find((d) => d.contains(box)) ||
        o()
          .reverse()
          .find((d) => be(d));
      const root = dialog || document;
      const nodes = Array.from(root.querySelectorAll('button,[role="button"],input[type="submit"]')).filter(
        (el) => t(el) && n(el),
      );
      const postWords =
        /^(post|publish|publish now|post now|đăng|نشر|投稿|发布|โพสต์|kirim|publicar|postar|veröffentlichen)$/i;
      const scored = nodes
        .map((el) => {
          const raw = String(
            [el.innerText, el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.value]
              .filter(Boolean)
              .join(' '),
          )
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim();
          const low = raw.toLowerCase();
          let score = -1e4;
          if (postWords.test(raw) || postWords.test(low)) score = 200;
          else if (/(^|\s)(post|publish|publish now|đăng|نشر|投稿|发布|โพสต์)(\s|$)/i.test(raw)) score = 160;
          else if (el.getAttribute('data-testid') && /post|publish/i.test(el.getAttribute('data-testid')))
            score = 140;
          if (el.matches('input[type="submit"]')) score += 30;
          const rr = el.getBoundingClientRect();
          if (rr.width >= 50 && rr.height >= 28) score += 10;
          if (rr.bottom > box.getBoundingClientRect().bottom - 20) score += 15;
          return { el, score, raw };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      return scored[0]?.el || null;
    };
    const postActivationVisible = async (btn, box, timeout = 8000) => {
      const started = Date.now();
      const originalText = String(
        [btn?.innerText, btn?.textContent, btn?.getAttribute?.('aria-label'), btn?.getAttribute?.('title')]
          .filter(Boolean)
          .join(' '),
      )
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
      const postingWords =
        /\b(posting|publishing|đang đăng|đang tải|publicando|veröffentlichen|kirim|投稿中|发布中|publishing)\b/i;
      while (Date.now() - started < timeout) {
        const dialog =
          box.closest('[role="dialog"]') ||
          o()
            .reverse()
            .find((d) => d.contains(box)) ||
          o()
            .reverse()
            .find((d) => be(d));
        const bodyText = String(dialog?.innerText || document.body?.innerText || '');
        // A real submit transition must be observable. Merely dispatching a click
        // event is NOT enough to mark the post as submitted.
        if (!document.contains(btn) || !btn.isConnected) return true;
        if (!document.contains(box) || !box.isConnected) return true;
        if (
          btn.disabled ||
          String(btn.getAttribute('aria-disabled') || '').toLowerCase() === 'true' ||
          String(btn.getAttribute('aria-busy') || '').toLowerCase() === 'true'
        )
          return true;
        if (postingWords.test(bodyText)) return true;
        if (dialog?.querySelector('[role="progressbar"],[aria-busy="true"]')) return true;
        const currentText = String(
          [btn?.innerText, btn?.textContent, btn?.getAttribute?.('aria-label'), btn?.getAttribute?.('title')]
            .filter(Boolean)
            .join(' '),
        )
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim();
        if (originalText && currentText && currentText !== originalText && postingWords.test(currentText))
          return true;
        await V(0.2);
      }
      return false;
    };
    const activatePostButton = async (btn) => {
      if (!btn || !t(btn) || !n(btn)) return false;
      btn.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      try {
        btn.focus?.();
      } catch {}
      // Facebook's current composer can expose Post as either a real <button>
      // submit control or a div[role="button"]. Try the native activation first.
      // requestSubmit() is important when Facebook wraps the composer in a real
      // form: it lets React receive the normal submit path instead of only an
      // untrusted synthetic mouse event.
      try {
        const form = btn.closest?.('form');
        if (
          form &&
          typeof form.requestSubmit === 'function' &&
          (btn instanceof HTMLButtonElement ||
            String(btn.getAttribute?.('type') || '').toLowerCase() === 'submit')
        ) {
          form.requestSubmit(btn);
          return true;
        }
      } catch (err) {
        console.debug('[PostSubmit] requestSubmit unavailable:', String(err?.message || err));
      }
      try {
        HTMLElement.prototype.click.call(btn);
        return true;
      } catch (err) {
        console.warn('[PostSubmit] native click failed:', String(err?.message || err));
        return false;
      }
    };
    const activatePostButtonFallback = (btn) => {
      // Only used when the primary native click produced no observable submission
      // transition. This is a single activation, not an additional .click().
      try {
        btn.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        try {
          btn.focus?.();
        } catch {}
        const ev = { bubbles: true, cancelable: true, composed: true, view: window };
        btn.dispatchEvent(
          new PointerEvent('pointerdown', { ...ev, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
        );
        btn.dispatchEvent(new MouseEvent('mousedown', ev));
        btn.dispatchEvent(
          new PointerEvent('pointerup', { ...ev, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
        );
        btn.dispatchEvent(new MouseEvent('mouseup', ev));
        btn.dispatchEvent(new MouseEvent('click', ev));
        return true;
      } catch (err) {
        console.warn('[PostSubmit] activation fallback failed:', String(err?.message || err));
        return false;
      }
    };
    let clicked = false,
      lastLabels = [],
      activationMethod = '';
    // Facebook can re-render the composer controls after text/media insertion.
    // Always re-query the LIVE dialog and require an observable submit transition.
    // This prevents the queue from treating a synthetic click event as a real post.
    for (let tries = 0; tries < 120; tries++) {
      const btn = findPostButton() || Se(box) || Pe();
      if (btn && t(btn) && n(btn)) {
        const primary = await activatePostButton(btn);
        if (primary) {
          if (await postActivationVisible(btn, box, 8000)) {
            clicked = true;
            activationMethod = 'native';
            break;
          }
        }
        // Only if the first activation produced NO transition do one controlled
        // pointer/mouse activation on the freshly-rendered Post control.
        const fresh = findPostButton() || Se(box) || Pe();
        if (fresh && t(fresh) && n(fresh)) {
          const fallback = activatePostButtonFallback(fresh);
          if (fallback && (await postActivationVisible(fresh, box, 8000))) {
            clicked = true;
            activationMethod = 'pointer-fallback';
            break;
          }
          // Last DOM-level activation path: keyboard activation on the focused
          // Post control. This is only attempted after the click/pointer paths
          // produced no submit transition.
          try {
            fresh.focus?.();
            fresh.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            );
            fresh.dispatchEvent(
              new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            );
          } catch {}
          if (await postActivationVisible(fresh, box, 8000)) {
            clicked = true;
            activationMethod = 'keyboard-fallback';
            break;
          }
        }
      }
      const dialog =
        box.closest('[role="dialog"]') ||
        o()
          .reverse()
          .find((d) => be(d));
      lastLabels = dialog
        ? Array.from(dialog.querySelectorAll('button,[role="button"],input[type="submit"]'))
            .filter(t)
            .slice(-30)
            .map((el) =>
              String(
                [
                  el.innerText,
                  el.textContent,
                  el.getAttribute('aria-label'),
                  el.getAttribute('title'),
                  el.value,
                ]
                  .filter(Boolean)
                  .join(' '),
              ).trim(),
            )
            .filter(Boolean)
        : [];
      await V(0.25);
    }
    if (!clicked) {
      throw Ae(
        'POST_BUTTON_NOT_FOUND',
        "Couldn't click Facebook's post button",
        `Failed to activate an enabled Post button. ${JSON.stringify({ htmlLang: oe(), hasDialog: !!box.closest('[role="dialog"]'), buttons: lastLabels }).slice(0, 1800)}`,
      );
    }
    console.info('[PostSubmit] Facebook Post activated:', activationMethod);
    opts.onPostButtonClicked?.();
    return { submitted: true };
  }
  const ke = 'div[role="button"], button',
    Oe = 'img, video',
    Me = [
      'post',
      'đăng',
      'cancel',
      'hủy',
      'back',
      'close',
      'privacy',
      'audience',
      'search',
      'share',
      'like',
      'comment',
      'reply',
      'bình luận',
      'trả lời',
    ];
  function Ne(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  function _e(e) {
    var t;
    if ('IMG' === e.tagName) {
      const t = e;
      return ['img', t.src, t.currentSrc].join('|');
    }
    const n = e,
      o = (null == (t = n.querySelector(':scope > source')) ? void 0 : t.src) || '';
    return ['video', n.src, n.currentSrc, n.poster, o].join('|');
  }
  function De(e) {
    return new Map(Array.from(e.querySelectorAll(Oe)).map((e) => [e, _e(e)]));
  }
  function Ue(e) {
    if (!t(e)) return !1;
    if ('IMG' === e.tagName) {
      const t = e;
      return t.complete && t.naturalWidth > 0 && t.naturalHeight > 0;
    }
    const n = e;
    return n.readyState >= 1 && n.videoWidth > 0 && n.videoHeight > 0;
  }
  async function xe(ids, opts = {}) {
    if (!Array.isArray(ids) || !ids.length) return [];
    const timeoutMs = Number(opts.timeoutMs) || 120000;
    const started = Date.now();
    opts.onProgress?.({
      phase: 'MEDIA_FETCH_START',
      fileIndex: 0,
      fileCount: ids.length,
      bytesLoaded: 0,
      bytesTotal: 0,
      method: 'REFERENCE_BASE64',
    });
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: 'GET_POST_MEDIA', mediaIds: ids }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Media loading timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        ),
      ),
    ]);
    if (!response?.files || !Array.isArray(response.files))
      throw new Error(response?.error || 'Media files could not be loaded');
    if (response.files.length !== ids.length)
      throw new Error(
        `Failed to load all selected media. Expected ${ids.length}, got ${response.files.length}`,
      );
    const out = [];
    for (let index = 0; index < response.files.length; index++) {
      const item = response.files[index] || {};
      const data = String(item.data || '');
      if (!/^data:[^,]+,/.test(data))
        throw new Error(`Media ${String(item.filename || 'upload')} returned invalid data`);
      out.push({
        filename: String(item.filename || `upload_${index}.jpg`),
        mimeType: String(
          item.mimeType || data.slice(5, data.indexOf(',')).split(';')[0] || 'application/octet-stream',
        ),
        data,
      });
      opts.onProgress?.({
        phase: 'MEDIA_FILE_READY',
        fileIndex: index + 1,
        fileCount: response.files.length,
        filename: String(item.filename || 'upload'),
        bytesLoaded: data.length,
        bytesTotal: data.length,
        method: 'REFERENCE_BASE64',
      });
    }
    opts.onProgress?.({ phase: 'MEDIA_FETCH_COMPLETE', fileCount: out.length, method: 'REFERENCE_BASE64' });
    return out;
  }
  function Le(e) {
    const roots = [];
    if (e) roots.push(e);
    const d = e?.closest?.('[role="dialog"]');
    if (d && d !== e) roots.push(d);
    roots.push(document);
    for (const root of roots) {
      const inputs = Array.from(root.querySelectorAll('input[type="file"]')).filter((x) => {
        const a = String(x.getAttribute('accept') || '').toLowerCase();
        return !a || a.includes('image') || a.includes('video');
      });
      if (inputs.length) return inputs[0];
    }
    return null;
  }
  function findMediaButton(e, n) {
    if (!e) return null;
    const labels = [
      'photo/video',
      'photo or video',
      'photos/videos',
      'photo',
      'photos',
      'video',
      'videos',
      'add photo',
      'add photos',
      'add video',
      'add media',
      'upload photo',
      'upload video',
      'ảnh/video',
      'ảnh hoặc video',
    ];
    const bad = [
      'post',
      'share',
      'comment',
      'tag',
      'location',
      'feeling',
      'gif',
      'live',
      'poll',
      'close',
      'cancel',
      'back',
      'audience',
    ];
    const clean = (x) =>
      String(x ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const get = (x) =>
      clean(
        [
          x.getAttribute?.('aria-label'),
          x.getAttribute?.('title'),
          x.getAttribute?.('data-tooltip-content'),
          x.getAttribute?.('data-testid'),
          x.innerText,
          x.textContent,
        ]
          .filter(Boolean)
          .join(' '),
      );
    const candidates = Array.from(e.querySelectorAll('button,[role="button"],[tabindex="0"]')).filter(
      (x) => t(x) && n(x),
    );
    const ref = n?.getBoundingClientRect?.();
    let best = null;
    for (const el of candidates) {
      const text = get(el);
      if (!text || bad.some((b) => text === b || text.includes(b + ' '))) continue;
      let score = 0;
      if (labels.some((k) => text.includes(k))) score += 100;
      if (/photo|video|media|ảnh/.test(text)) score += 45;
      if (el.querySelector('svg,img,[data-visualcompletion]')) score += 10;
      const r = el.getBoundingClientRect();
      if (ref && r.top >= ref.bottom - 20 && r.top - ref.bottom < 420) score += 25;
      if (r.width > 0 && r.width < 180 && r.height > 0 && r.height < 100) score += 5;
      if (score > 0 && (!best || score > best.score)) best = { el, score, text };
    }
    if (best) return best.el;
    return null;
  }
  function Re(e) {
    return (
      Array.from(
        e.querySelectorAll(
          "div[contenteditable='true'][role='textbox'], div[contenteditable='true'][data-lexical-editor='true']",
        ),
      ).filter(t)[0] || null
    );
  }
  function Be(e, n, o) {
    const r = (function (e) {
        return Math.min(e, 5);
      })(n),
      i = (function (e, t) {
        return Array.from(e.querySelectorAll(Oe)).filter((e) => !t.has(e) || t.get(e) !== _e(e));
      })(e, o),
      a = i.filter(Ue),
      s = Array.from(
        new Set(
          a.map((e) => {
            const t = 'IMG' === e.tagName ? e.currentSrc || e.src : e.currentSrc || e.src || e.poster;
            return t ? t.split(':', 1)[0] + ':' : 'none';
          }),
        ),
      ),
      l = Array.from(
        new Set(
          (function (e, t) {
            if (0 === t.length) return [e];
            const n = t.flatMap((t) => {
                var n;
                const o = [];
                let r = t.closest('[role="group"]');
                for (; r && e.contains(r);)
                  (o.push(r),
                    (r = (null == (n = r.parentElement) ? void 0 : n.closest('[role="group"]')) || null));
                return o;
              }),
              o = n.find((e) => t.every((t) => e.contains(t))),
              r = Array.from(new Set(n));
            return o ? [o] : r.length > 0 ? r : [e];
          })(e, a).flatMap((e) =>
            Array.from(
              e.querySelectorAll('[role="progressbar"], progress, [aria-busy="true"], [aria-valuenow]'),
            ),
          ),
        ),
      ).filter(t),
      c = l.map((e) => e.getAttribute('aria-valuenow')).filter((e) => Boolean(e));
    return {
      expectedCount: n,
      expectedVisiblePreviewCount: r,
      previewCount: a.length,
      newOrChangedElements: i,
      previewElements: a,
      mediaSignature: a.map(_e).sort().join('||'),
      readyImageCount: a.filter((e) => 'IMG' === e.tagName).length,
      readyVideoCount: a.filter((e) => 'VIDEO' === e.tagName).length,
      uploadInProgress: l.length > 0,
      uploadProgress: c.join(',') || null,
      sourceSchemes: s,
      ready: a.length >= r && 0 === l.length,
    };
  }
  function Fe(e, t, n) {
    if (!e) return JSON.stringify({ expectedCount: t, hasForm: !1 });
    const o = n || De(e),
      r = Be(e, t, o),
      i = Array.from(e.querySelectorAll(Oe)),
      a = {
        htmlLang: document.documentElement.lang || null,
        expectedCount: t,
        expectedVisiblePreviewCount: r.expectedVisiblePreviewCount,
        previewCapApplied: t > r.expectedVisiblePreviewCount,
        previewCount: r.previewCount,
        baselineMediaCount: o.size,
        currentMediaCount: i.length,
        newOrChangedMediaCount: r.newOrChangedElements.length,
        readyImageCount: r.readyImageCount,
        readyVideoCount: r.readyVideoCount,
        sourceSchemes: r.sourceSchemes,
        uploadInProgress: r.uploadInProgress,
        uploadProgress: r.uploadProgress,
        hasProgressbar: Boolean(e.querySelector('[role="progressbar"]')),
      };
    return JSON.stringify(a).slice(0, 1500);
  }
  async function qe(e, t, n, o) {
    var r, i;
    const timeoutMs = null == o?.timeoutMs ? 40000 + 10000 * Math.max(0, t - 1) : o.timeoutMs;
    const pollMs = null == o?.pollMs ? 500 : o.pollMs;
    const c = Date.now();
    let stable = 0,
      lastState = '',
      lastSignature = '';
    for (; Date.now() - c < timeoutMs;) {
      const snap = Be(e, t, n);
      const phase = snap.ready
        ? 'CONFIRMED'
        : snap.previewCount < snap.expectedVisiblePreviewCount
          ? 'WAITING_FOR_PREVIEWS'
          : 'WAITING_FOR_UPLOAD';
      const state = [
        snap.mediaSignature,
        snap.uploadInProgress ? 'uploading' : 'not_uploading',
        snap.uploadProgress || '',
        phase,
      ].join('|');
      if (state !== lastState) {
        lastState = state;
        o?.onProgress?.({
          mediaExpectedCount: t,
          mediaPreviewCount: snap.previewCount,
          mediaUploadInProgress: snap.uploadInProgress,
          mediaUploadProgress: snap.uploadProgress,
          mediaAttachmentPhase: phase,
          mediaAttachmentDiagnostics: Fe(e, t, n),
        });
      }
      if (snap.ready) {
        stable = snap.mediaSignature === lastSignature ? stable + 1 : 1;
        lastSignature = snap.mediaSignature;
        if (stable >= 2) {
          o?.onProgress?.({
            mediaExpectedCount: t,
            mediaPreviewCount: snap.previewCount,
            mediaUploadInProgress: false,
            mediaUploadProgress: null,
            mediaAttachmentPhase: 'CONFIRMED',
            mediaAttachmentDiagnostics: Fe(e, t, n),
          });
          return true;
        }
      } else {
        stable = 0;
        lastSignature = '';
      }
      await Ne(pollMs);
    }
    const finalDiag = Fe(e, t, n);
    o?.onProgress?.({
      mediaExpectedCount: t,
      mediaPreviewCount: Be(e, t, n).previewCount,
      mediaUploadInProgress: false,
      mediaUploadProgress: null,
      mediaAttachmentPhase: 'MEDIA_TIMEOUT',
      mediaAttachmentDiagnostics: finalDiag,
    });
    return false;
  }
  function He(e, o) {
    if (!t(e) || !n(e)) return -1e4;
    const a = r(e);
    if (i([a.join(' ')], Me)) return -1e4;
    let s = 0;
    i(a, j) && (s += 100);
    const l = e.getBoundingClientRect(),
      c = o.getBoundingClientRect();
    return (Math.abs(l.top - c.bottom) < 360 && (s += 20), e.querySelector('svg, img, i') && (s += 10), s);
  }
  async function pasteMediaFiles(mediaEntries, textbox, opts) {
    if (!Array.isArray(mediaEntries) || !mediaEntries.length || !textbox)
      return {
        success: false,
        errorCode: 'MEDIA_PASTE_UNAVAILABLE',
        diagnostics: 'No media entries or textbox',
      };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      // This is the media-upload mechanism from the supplied FAB source:
      // focus/click the Facebook textbox, select its contents, then paste ONE File
      // per ClipboardEvent using a fresh DataTransfer, with a 1s processing gap.
      textbox.focus();
      textbox.click();
      let selection = window.getSelection();
      let range = document.createRange();
      range.selectNodeContents(textbox);
      selection?.removeAllRanges();
      selection?.addRange(range);
      for (let index = 0; index < mediaEntries.length; index++) {
        const entry = mediaEntries[index] || {};
        const dataUrl = String(entry.data || '');
        const comma = dataUrl.indexOf(',');
        if (comma < 0) throw new Error(`Invalid media data for ${entry.filename || `file ${index + 1}`}`);
        const header = dataUrl.slice(0, comma);
        const match = header.match(/^data:([^;]+);base64$/i);
        const mime = String(entry.mimeType || match?.[1] || 'application/octet-stream');
        const binary = atob(dataUrl.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        const blob = new Blob([bytes], { type: mime });
        const sourceName = String(entry.filename || '').trim();
        const extByMime = {
          'video/mp4': 'mp4',
          'video/quicktime': 'mov',
          'video/webm': 'webm',
          'video/x-m4v': 'm4v',
          'video/avi': 'avi',
          'video/x-msvideo': 'avi',
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
          'image/bmp': 'bmp',
          'image/heic': 'heic',
          'image/heif': 'heif',
        };
        const expectedExt = extByMime[String(mime).toLowerCase()] || '';
        let fileName = sourceName || `upload_${index + 1}.${expectedExt || 'bin'}`;
        if (expectedExt) {
          const currentExt = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
          const isVideo = String(mime).toLowerCase().startsWith('video/');
          const isImage = String(mime).toLowerCase().startsWith('image/');
          const videoExts = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', 'mpeg', 'mpg', '3gp']);
          const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif']);
          if (
            (isVideo && !videoExts.has(currentExt)) ||
            (isImage && !imageExts.has(currentExt)) ||
            !currentExt
          ) {
            fileName =
              (currentExt ? fileName.slice(0, -(currentExt.length + 1)) : fileName) + `.${expectedExt}`;
          }
        }
        const file = new File([blob], fileName, { type: mime });
        const dt = new DataTransfer();
        dt.items.add(file);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        textbox.dispatchEvent(pasteEvent);
        try {
          textbox.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        } catch {}
        opts?.onProgress?.({
          mediaExpectedCount: mediaEntries.length,
          mediaPreviewCount: 0,
          mediaUploadInProgress: true,
          mediaUploadProgress: null,
          mediaAttachmentPhase: 'MEDIA_PASTE_FILE',
          mediaAttachmentDiagnostics: `REFERENCE_PASTE_FILE:${index + 1}/${mediaEntries.length}:${file.name}`,
        });
        await wait(1000);
      }
      await wait(2000);
      opts?.onProgress?.({
        mediaExpectedCount: mediaEntries.length,
        mediaPreviewCount: 0,
        mediaUploadInProgress: false,
        mediaUploadProgress: null,
        mediaAttachmentPhase: 'MEDIA_PASTE_COMPLETE',
        mediaAttachmentDiagnostics: `REFERENCE_PASTE_COMPLETE:${mediaEntries.length}/${mediaEntries.length}`,
      });
      return {
        success: true,
        method: 'reference-clipboard-paste',
        diagnostics: `REFERENCE_PASTE_COMPLETE:${mediaEntries.length}/${mediaEntries.length}`,
      };
    } catch (e) {
      const msg = e?.message || String(e);
      // Reference-media dispatch is recoverable; the caller already converts the
      // failure into the existing media retry path. Keep it out of Chrome's red
      // extension error surface while preserving diagnostics in posting status.
      console.debug('[MediaAttachment] Reference clipboard paste failed (recoverable):', msg);
      return {
        success: false,
        errorCode: 'MEDIA_PASTE_DISPATCH_FAILED',
        diagnostics: `REFERENCE_PASTE_FAILED:${msg}`,
      };
    }
  }
  async function ze(mediaEntries, textbox, opts) {
    if (!Array.isArray(mediaEntries) || !mediaEntries.length) return { success: true };
    const progress = (p) => {
      try {
        opts?.onProgress?.(p);
      } catch {}
    };
    progress({
      mediaExpectedCount: mediaEntries.length,
      mediaPreviewCount: 0,
      mediaUploadInProgress: true,
      mediaUploadProgress: null,
      mediaAttachmentPhase: 'REFERENCE_MEDIA_PASTE_START',
      mediaAttachmentDiagnostics: 'Using supplied FAB per-file clipboard media logic',
    });
    const result = await pasteMediaFiles(mediaEntries, textbox, { onProgress: progress });
    if (result.success) return result;
    progress({
      mediaExpectedCount: mediaEntries.length,
      mediaPreviewCount: 0,
      mediaUploadInProgress: false,
      mediaUploadProgress: null,
      mediaAttachmentPhase: 'MEDIA_PASTE_FAILED',
      mediaAttachmentDiagnostics: result.diagnostics || 'Reference clipboard paste failed',
    });
    return result;
  }
  const Ge = [
      'join group',
      'request to join',
      'приєднатися до групи',
      'надіслати запит',
      'запит на приєднання',
      'присоединиться к группе',
      'вступить в группу',
      'отправить запрос',
      'запрос на вступление',
      'unirte al grupo',
      'solicitar unirte',
      'solicitar unirse',
      'rejoindre le groupe',
      'demander à rejoindre',
      'gruppe beitreten',
      'beitrittsanfrage',
      'participar do grupo',
      'solicitar participação',
      'tham gia nhóm',
      'yêu cầu tham gia',
    ],
    je = [
      'requested',
      'request sent',
      'membership pending',
      'запит надіслано',
      'очікує схвалення',
      'запрос отправлен',
      'заявка отправлена',
      'ожидает одобрения',
      'solicitud enviada',
      'pendiente de aprobación',
      'demande envoyée',
      'en attente d’approbation',
      'anfrage gesendet',
      'ausstehend',
      'solicitação enviada',
      'pendente de aprovação',
      'đã gửi yêu cầu',
      'đang chờ phê duyệt',
    ],
    $e = ['joined', 'joined group'],
    Ve = [
      "this content isn't available",
      "you're not a member",
      'you must be a member',
      'you need to be a member',
      'цей вміст недоступний',
      'ви не є учасником',
      'потрібно бути учасником',
      'контент недоступен',
      'вы не являетесь участником',
      'нужно быть участником',
      'este contenido no está disponible',
      'debes ser miembro',
      'ce contenu n’est pas disponible',
      'vous devez être membre',
      'dieser inhalt ist nicht verfügbar',
      'du musst mitglied sein',
      'este conteúdo não está disponível',
      'você precisa ser membro',
      'nội dung này hiện không có',
      'bạn phải là thành viên',
    ];
  function Ke() {
    const e = [
        ...Array.from(
          document.querySelectorAll(
            'div[role="button"], button, a, textarea, input[placeholder], [role="textbox"]',
          ),
        )
          .filter(t)
          .flatMap(r),
        ...Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"], span'))
          .filter(t)
          .filter((e) => {
            const t = e.innerText || e.textContent || '';
            return t.length > 0 && t.length <= 180;
          })
          .slice(0, 250)
          .flatMap(r),
      ],
      n = i(e, $e),
      o = i(
        e,
        (function () {
          const e = ie(oe());
          return e.key && 'en' !== e.key ? [...te, ...e.hints] : te;
        })(),
      ),
      a = i(e, je),
      s = i(e, Ge),
      l = i(e, Ve);
    return n || o
      ? { kind: 'READY' }
      : a
        ? {
            kind: 'BLOCKED',
            errorCode: 'MEMBERSHIP_REQUEST_PENDING',
            userMessage: 'Membership request is still pending',
          }
        : l || s
          ? { kind: 'BLOCKED', errorCode: 'NOT_MEMBER', userMessage: 'Join the group first' }
          : { kind: 'UNKNOWN' };
  }
  function detectTemporarilyPausedGroup() {
    const text = String(document.body?.innerText || document.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const phrases = [
      'this group is temporarily paused',
      'group is temporarily paused',
      'group activity will resume',
      'nhóm này đang tạm dừng',
      'hoạt động của nhóm sẽ tiếp tục',
      'ce groupe est temporairement suspendu',
      'la actividad del grupo se reanudará',
    ];
    return phrases.some((x) => text.includes(x));
  }
  const We = 'fb-crossposter-automation-banner';
  function Xe() {
    const e = document.getElementById(We);
    return e instanceof HTMLDivElement ? e : null;
  }
  function Je(e) {
    (function () {
      const e = Xe();
      if (e) return e;
      const t = document.createElement('div');
      return (
        (t.id = We),
        (t.style.position = 'fixed'),
        (t.style.top = '12px'),
        (t.style.right = '12px'),
        (t.style.zIndex = '2147483647'),
        (t.style.maxWidth = '280px'),
        (t.style.padding = '10px 12px'),
        (t.style.border = '1px solid rgba(148, 163, 184, 0.35)'),
        (t.style.borderRadius = '12px'),
        (t.style.background = 'rgba(15, 23, 42, 0.92)'),
        (t.style.color = '#f8fafc'),
        (t.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.24)'),
        (t.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'),
        (t.style.fontSize = '13px'),
        (t.style.fontWeight = '600'),
        (t.style.lineHeight = '1.45'),
        (t.style.whiteSpace = 'pre-line'),
        (t.style.pointerEvents = 'none'),
        document.body.appendChild(t),
        t
      );
    })().textContent = e;
  }
  function Ye(e) {
    Je(e);
  }
  async function Qe(groupId) {
    const observationId = crypto.randomUUID();
    let timer = null,
      domTimer = null,
      disposed = false,
      armed = false,
      postClicked = false,
      lastPostId = null,
      resolvePromise;
    const cleanup = () => {
      if (domTimer) clearInterval(domTimer);
      if (timer) clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      try {
        domObserver?.disconnect();
      } catch {}
      promiseCleanupRegistry.delete(observationId);
    };
    let domObserver = null;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const finish = (result) => {
      if (disposed) return;
      disposed = true;
      cleanup();
      // A post ID from Facebook's response survives even when the outcome came from the DOM or a timeout.
      resolvePromise(!result.postId && lastPostId ? { ...result, postId: lastPostId } : result);
    };
    const normalize = (x) =>
      String(x || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const scanDom = () => {
      if (disposed || !postClicked) return;
      const body = normalize(document.body?.innerText || document.body?.textContent || '');
      if (detectExplicitPostPending(document)) {
        finish({ kind: 'PENDING_APPROVAL', domConfirmed: true });
        return;
      }
      const publishedPhrases = [
        'your post has been published',
        'post published',
        'your post was published',
        'published successfully',
      ];
      if (publishedPhrases.some((x) => body.includes(x))) {
        finish({ kind: 'PUBLISHED', domConfirmed: true });
        return;
      }
    };
    const onMessage = (event) => {
      if (disposed || event.source !== window || event.origin !== window.location.origin) return;
      const d = event.data || {};
      if (d.source === 'AGP_CONTENT_SCRIPT' && d.type === '__FBMP_DOM_SCAN') return;
      if (
        d.source === 'AGP_POST_RESPONSE_BRIDGE' &&
        d.type === 'OBSERVER_ARMED' &&
        d.observationId === observationId
      ) {
        armed = true;
        return;
      }
      if (
        d.source === 'AGP_POST_RESPONSE_OBSERVER' &&
        d.observationId === observationId &&
        String(d.groupId) === String(groupId)
      ) {
        if (!postClicked) return;
        const snap = d.snapshot || {};
        if (snap.postId) lastPostId = String(snap.postId);
        // Facebook's visible approval toast is authoritative for Pending.
        // A concrete group post URL is authoritative for Published even when Facebook
        // does not return the group_feed_story_edge in this particular GraphQL shape.
        // Requiring hasGroupFeedStoryEdge here caused real Photo/Text posts to fall
        // through to the dialog-closed fallback and display "Post URL unavailable".
        if (detectExplicitPostPending(document)) {
          finish({ kind: 'PENDING_APPROVAL', postId: snap.postId, pendingPostUrl: snap.pendingPostUrl });
          return;
        }
        const hasPublishedUrl = Boolean(snap.postUrl && !snap.pendingPostUrl);
        const hasPublishedStory = Boolean(snap.postId && hasPublishedUrl);
        const hasExplicitPending =
          Boolean(snap.pendingPostUrl) ||
          (Array.isArray(snap.pendingSignals) && snap.pendingSignals.length > 0);
        if (hasPublishedStory || hasPublishedUrl)
          finish({ kind: 'PUBLISHED', postId: snap.postId, postUrl: snap.postUrl });
        else if (hasExplicitPending)
          finish({ kind: 'PENDING_APPROVAL', postId: snap.postId, pendingPostUrl: snap.pendingPostUrl });
        // A weak/partial network snapshot is not a failure. Keep listening for the
        // Facebook confirmation toast or a stronger published-story signal.
        else scanDom();
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage(
      { source: 'AGP_CONTENT_SCRIPT', type: 'ARM_POST_RESPONSE_OBSERVER', observationId, groupId },
      window.location.origin,
    );
    domObserver = new MutationObserver(scanDom);
    domObserver.observe(document.documentElement || document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    domTimer = setInterval(scanDom, 350);
    promiseCleanupRegistry.set(observationId, cleanup);
    timer = setTimeout(
      () =>
        finish(
          armed
            ? { kind: 'DETECTOR_UNAVAILABLE', reason: 'RESPONSE_TIMEOUT' }
            : { kind: 'DETECTOR_UNAVAILABLE', reason: 'BRIDGE_FAILED' },
        ),
      27000,
    );
    return {
      markPostButtonClicked() {
        if (disposed) return;
        postClicked = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(
          () =>
            finish(
              armed
                ? { kind: 'DETECTOR_UNAVAILABLE', reason: 'RESPONSE_TIMEOUT' }
                : { kind: 'DETECTOR_UNAVAILABLE', reason: 'BRIDGE_FAILED' },
            ),
          27000,
        );
        scanDom();
      },
      waitForOutcome: () => promise,
      get postId() {
        return lastPostId;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        cleanup();
        window.postMessage(
          { source: 'AGP_CONTENT_SCRIPT', type: 'DISARM_POST_RESPONSE_OBSERVER', observationId },
          window.location.origin,
        );
        resolvePromise({ kind: 'UNCONFIRMED', disposed: true });
      },
    };
  }
  function normalizeComposerResultUrl(value) {
    try {
      const u = new URL(String(value || ''), window.location.origin);
      return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      return null;
    }
  }
  function captureComposerResultUrlBaseline(groupId) {
    const id = String(groupId || '').trim();
    const baseline = new Set();
    if (!id) return baseline;
    const prefixes = [`/groups/${id}/posts/`, `/groups/${id}/permalink/`];
    const add = (value) => {
      try {
        const u = new URL(String(value || ''), window.location.origin);
        const path = u.pathname.replace(/\/+$/, '');
        if (prefixes.some((prefix) => path.includes(prefix))) {
          const key = normalizeComposerResultUrl(u.href);
          if (key) baseline.add(key);
        }
      } catch {}
    };
    for (const a of Array.from(document.querySelectorAll('a[href]'))) add(a.href);
    for (const el of Array.from(document.querySelectorAll('[data-href],[data-permalink]'))) {
      add(el.getAttribute?.('data-href'));
      add(el.getAttribute?.('data-permalink'));
    }
    return baseline;
  }
  function canonicalFacebookPostUrl(groupId, postId) {
    const gid = String(groupId || '').trim(),
      pid = String(postId || '').trim();
    return gid && /^\d+$/.test(gid) && pid && /^\d+$/.test(pid)
      ? `https://www.facebook.com/groups/${gid}/posts/${pid}`
      : null;
  }
  function findComposerResultUrl(groupId, kind, baseline) {
    const id = String(groupId || '').trim();
    if (!id) return null;
    const prefixes =
      kind === 'PENDING_APPROVAL'
        ? [`/groups/${id}/pending_posts/`]
        : [`/groups/${id}/posts/`, `/groups/${id}/permalink/`];
    const candidates = [];
    const push = (v) => {
      try {
        const u = new URL(String(v || ''), window.location.origin),
          path = u.pathname.replace(/\/+$/, '');
        if (!prefixes.some((prefix) => path.includes(prefix))) return;
        const normalized = normalizeComposerResultUrl(u.href);
        if (baseline && normalized && baseline.has(normalized)) return;
        if (!candidates.includes(u.href)) candidates.push(u.href);
      } catch {}
    };
    for (const a of Array.from(document.querySelectorAll('a[href]'))) push(a.href);
    for (const el of Array.from(document.querySelectorAll('[data-href],[data-permalink],[href]'))) {
      push(el.getAttribute?.('data-href'));
      push(el.getAttribute?.('data-permalink'));
    }
    if (kind === 'PUBLISHED') push(window.location.href);
    return candidates[0] || null;
  }
  async function waitForComposerResultUrl(groupId, kind, baseline, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const url = findComposerResultUrl(groupId, kind, baseline);
      if (url) return url;
      await V(0.25);
    }
    return findComposerResultUrl(groupId, kind, baseline) || null;
  }
  function detectAccountPostingRestriction(root) {
    const text = String(
      root?.innerText || root?.textContent || document.body?.innerText || document.body?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const phrases = [
      'your account is restricted from posting',
      'your account has been restricted from posting',
      'your account is temporarily restricted',
      'your account has been temporarily restricted',
      'you are temporarily blocked from using this feature',
      'you’re temporarily blocked from using this feature',
      'you have been temporarily blocked from posting',
      'you have been blocked from posting',
      'we restricted your account',
      'your account has been restricted',
      'your account is limited',
      'you cannot post because your account is restricted',
      "you can't post because your account is restricted",
      'bạn bị hạn chế đăng bài',
      'tài khoản của bạn bị hạn chế đăng bài',
      'tài khoản của bạn đã bị hạn chế',
    ];
    return phrases.some((p) => text.includes(p));
  }

  function detectExplicitPostFailure(root) {
    const text = String(
      root?.innerText || root?.textContent || document.body?.innerText || document.body?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const phrases = [
      'something went wrong',
      "couldn't post",
      'could not post',
      "can't post",
      'cannot post',
      'failed to publish',
      'unable to publish',
      'post failed',
      'publishing failed',
      "we couldn't publish",
      'we could not publish',
      'bạn không thể đăng',
      'đăng bài thất bại',
    ];
    return phrases.some((p) => text.includes(p));
  }
  function detectExplicitPostPending(root) {
    const text = String(
      root?.innerText || root?.textContent || document.body?.innerText || document.body?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const phrases = [
      "thanks for your post! it's been submitted to the group admins for approval",
      'submitted to the group admins for approval',
      'your post is pending approval',
      'your post is pending',
      'post is pending approval',
      'post is pending',
      'your post is awaiting admin approval',
      'awaiting admin approval',
      'awaiting group admin approval',
      'pending admin approval',
      'pending approval',
      'your post has been submitted for approval',
      'your post was submitted for approval',
    ];
    if (phrases.some((p) => text.includes(p))) return true;
    // Facebook's group page can render a pending card after the Create post
    // dialog closes. Detect that card structurally as well as by its text.
    const nodes = Array.from((root || document).querySelectorAll?.('[role="article"],div,section')) || [];
    return nodes.some((el) => {
      const t = String(el.innerText || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!t || t.length > 900) return false;
      return (
        t.includes('your post is pending') ||
        (t.includes('pending admin approval') && t.includes('manage posts')) ||
        (t.includes('awaiting admin approval') && t.includes('manage posts'))
      );
    });
  }
  const promiseCleanupRegistry = new Map();
  function Ze(e) {
    if (e.taskId && e.runId && e.groupId)
      try {
        chrome.runtime
          .sendMessage({
            action: 'POSTING_STATUS_CHANGED',
            taskId: e.taskId,
            runId: e.runId,
            groupId: e.groupId,
            status: { ...e },
          })
          .catch(() => {});
      } catch {}
  }
  function et(e, t) {
    e && (Object.assign(e, t, { lastUpdatedAt: new Date().toISOString() }), Ze(e));
  }
  function tt(e) {
    if (null == e ? void 0 : e.abortRequested)
      throw (et(e, { stage: 'ABORT_REQUESTED' }), new Error('Posting aborted'));
  }
  async function nt(e, t = F, n = q, o = H) {
    const r = Date.now();
    for (await V(t / 1e3); Date.now() - r < n;) {
      const t = e.closest('[role="dialog"]');
      if (!(document.contains(e) && e.isConnected && t && document.contains(t)))
        return { confirmed: !0, confirmationType: 'DIALOG_CLOSED' };
      await V(o / 1e3);
    }
    return { confirmed: !1 };
  }
  function detectGroupPostingSkip() {
    const normalize = (v) =>
      String(v ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const body = normalize(document.body?.innerText || document.body?.textContent || '');
    const visibleComposerTrigger =
      /^(?:write something(?:\.{3})?|create post|create a post|what'?s on your mind|start a post|post something|post an update|đăng bài|tạo bài viết|viết gì đó|اكتب شيئًا|إنشاء منشور)$/iu;
    const visibleTriggerExists = Array.from(
      document.querySelectorAll('button,[role="button"],[role="textbox"],textarea'),
    )
      .filter((el) => t(el))
      .some((el) =>
        visibleComposerTrigger.test(
          normalize(
            [
              el.innerText,
              el.textContent,
              el.getAttribute?.('aria-label'),
              el.getAttribute?.('title'),
              el.getAttribute?.('placeholder'),
            ]
              .filter(Boolean)
              .join(' '),
          ),
        ),
      );
    const blocked = [
      {
        code: 'GROUP_ARCHIVED',
        message: 'This group has been archived. Skipping this group.',
        phrases: [
          'this group has been archived',
          'group has been archived',
          'this group was archived',
          'nhóm này đã được lưu trữ',
          'nhóm đã được lưu trữ',
          'grupo foi arquivado',
          'groupe a été archivé',
          'gruppo è stato archiviato',
          'gruppe wurde archiviert',
          'группа была архивирована',
          'группа архивирована',
        ],
      },
      {
        code: 'GROUP_TEMPORARILY_PAUSED',
        message: 'This group is paused. Skipping this group.',
        phrases: [
          'this group is paused',
          'this group is temporarily paused',
          'group is paused',
          'group is temporarily paused',
          'group activity will resume',
          'nhóm này đang tạm dừng',
          'hoạt động của nhóm sẽ tiếp tục',
          'ce groupe est temporairement suspendu',
          'la actividad del grupo se reanudará',
          'gruppo è temporaneamente sospeso',
          'gruppe ist vorübergehend pausiert',
        ],
      },
      {
        code: 'GROUP_SUSPENDED_RESTRICTED',
        message: 'This group is suspended or restricted. Skipping this group.',
        phrases: [
          'this group is suspended',
          'group is suspended',
          'this group has been suspended',
          'this group is restricted',
          'group is restricted',
          'posting is restricted',
          'posting has been restricted',
          'you are restricted from posting',
          'you’re restricted from posting',
          'you cannot post in this group',
          'you can’t post in this group',
          'you cannot post to this group',
          'you can’t post to this group',
          'nhóm này bị đình chỉ',
          'nhóm này bị hạn chế',
        ],
      },
      {
        code: 'GROUP_ADMIN_ONLY',
        message: 'Only admins or moderators can post in this group. Skipping this group.',
        phrases: [
          'only admins can post',
          'only admins and moderators can post',
          'only administrators can post',
          'only moderators can post',
          'admins only can post',
          'admin-only posting',
          'chỉ quản trị viên mới có thể đăng',
          'chỉ quản trị viên và người kiểm duyệt mới có thể đăng',
        ],
      },
      {
        code: 'GROUP_POSTING_RESTRICTED',
        message: 'Posting is restricted for this account in this group. Skipping this group.',
        phrases: [
          'you are not allowed to post',
          'you’re not allowed to post',
          'you are not allowed to publish',
          'you’re not allowed to publish',
          'you cannot publish in this group',
          'you can’t publish in this group',
          'posting is limited',
          'posting limit',
          'you have been restricted from posting',
          'you have been temporarily restricted from posting',
          'bạn không được phép đăng',
          'bạn bị hạn chế đăng bài',
        ],
      },
      {
        code: 'GROUP_PARTICIPATION_REQUIRED',
        message:
          'Facebook requires membership or participation approval before posting. Skipping this group.',
        phrases: [
          'membership request is pending',
          'request to join is pending',
          'your membership is pending',
          'answer questions to join',
          'answer the questions to join',
          'membership is waiting for approval',
          'waiting for approval to join',
          'participation is required',
          'approval is required before you can post',
          'you must be approved to participate',
          'keanggotaan anda menunggu persetujuan',
          'đang chờ phê duyệt để tham gia',
        ],
      },
    ];
    for (const item of blocked)
      if (item.phrases.some((p) => body.includes(p)) && !visibleTriggerExists)
        return { skip: true, code: item.code, message: item.message };
    const visible = (el) => {
      if (!el || !t(el) || el.closest('[role="navigation"],[role="complementary"]')) return false;
      const rr = el.getBoundingClientRect?.();
      return !!rr && rr.width > 0 && rr.height > 0;
    };
    const labelOf = (el) =>
      normalize(
        [
          el?.innerText,
          el?.textContent,
          el?.getAttribute?.('aria-label'),
          el?.getAttribute?.('title'),
          el?.getAttribute?.('placeholder'),
        ]
          .filter(Boolean)
          .join(' '),
      );
    const nodes = Array.from(
      document.querySelectorAll('button,[role="button"],[role="textbox"],textarea,input[type="submit"]'),
    ).filter(visible);
    const postTrigger =
      /^(?:write something(?:\.{3})?|create post|create a post|what'?s on your mind|start a post|post something|post an update|đăng bài|tạo bài viết|viết gì đó|اكتب شيئًا|إنشاء منشور)$/iu;
    const triggerNodes = nodes.filter(
      (el) =>
        postTrigger.test(labelOf(el)) ||
        /\b(?:write something|create(?: a)? post|what'?s on your mind|start a post|post something)\b/i.test(
          labelOf(el),
        ),
    );
    const disabledTrigger = triggerNodes.find(
      (el) => !n(el) || String(el.getAttribute?.('aria-disabled') || '').toLowerCase() === 'true',
    );
    if (disabledTrigger)
      return {
        skip: true,
        code: 'GROUP_COMPOSER_DISABLED',
        message: 'The Create post / Write something control is disabled. Skipping this group.',
      };
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter(t)
      .reverse()
      .find((d) => le(d) || be(d));
    const textbox = dialog ? le(dialog) || be(dialog) : null;
    if (textbox) {
      if (!n(textbox) || String(textbox.getAttribute?.('aria-disabled') || '').toLowerCase() === 'true')
        return {
          skip: true,
          code: 'GROUP_COMPOSER_DISABLED',
          message: 'The Facebook post composer is disabled. Skipping this group.',
        };
      return { skip: false, ready: true, hasTrigger: true, hasComposer: true, focusable: true };
    }
    const structuralForm = nodes.find(
      (el) => el.matches?.('[role="textbox"],textarea') && el.closest('form') && n(el),
    );
    if (structuralForm)
      return { skip: false, ready: true, hasTrigger: true, hasComposer: true, focusable: true };
    const commerce =
      /\b(?:buy\s*(?:&|and)\s*sell|buy\s*sell|sell\s+something|create\s+listing|marketplace|mua\s*(?:&|và|va)\s*bán|mua bán|mua\s+ban|bán\s+hàng|ban hang|mua\s+va\s+ban|kauf(?:en)?\s+und\s+verkauf|acheter\s+et\s+vendre|comprar y vender|compra e venda|купить и продать|продажа|продаю|بيع وشراء)/iu;
    const discussion =
      /^(?:discussion|discuss|posts?|home|thảo luận|bài viết|bai viet|обсуждение|публикации|diskussion|discusión|discussão|discussione|討論|讨论|อภิปราย)$/iu;
    const labels = nodes.map(labelOf).filter(Boolean);
    // A visible Write something/Create post surface is authoritative. Some
    // buy/sell group pages still expose a fully working text composer while
    // their page body also contains marketplace labels. Never let those labels
    // override an actual posting control.
    if (triggerNodes.length || structuralForm)
      return { skip: false, hasTrigger: true, hasComposer: !!structuralForm, focusable: !!structuralForm };
    const hasCommerce = labels.some((x) => commerce.test(x)) || commerce.test(body);
    const hasDiscussion = Array.from(document.querySelectorAll('[role="tab"],a,button,span,div'))
      .filter(visible)
      .some((el) => discussion.test(labelOf(el)));
    const hasMediaOnly =
      labels.some((x) =>
        /^(?:photo\/?video|photo|video|add photo\/?video|ảnh\/?video|foto\/?vídeo)$/i.test(x),
      ) &&
      !triggerNodes.length &&
      !structuralForm;
    if (hasCommerce && !hasDiscussion)
      return {
        skip: true,
        code: 'GROUP_BUY_SELL_NO_DISCUSSION',
        message: 'This buy/sell group has no Discussion/Create post surface. Skipping this group.',
      };
    if (hasMediaOnly)
      return {
        skip: true,
        code: 'GROUP_MEDIA_ONLY_COMPOSER',
        message:
          'This group exposes only Photo/Video shortcuts and no text-post composer. Skipping this group.',
      };
    return { skip: false, unknown: true, hasTrigger: false, hasComposer: false };
  }

  function detectNoCreatePostOption() {
    const result = detectGroupPostingSkip();
    if (result?.skip) return result;
    const visible = (el) => {
      if (!el || !t(el) || el.closest('[role="navigation"],[role="complementary"]')) return false;
      const rr = el.getBoundingClientRect?.();
      return !!rr && rr.width > 0 && rr.height > 0;
    };
    const normalize = (v) =>
      String(v ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const labelOf = (el) =>
      normalize(
        [
          el?.innerText,
          el?.textContent,
          el?.getAttribute?.('aria-label'),
          el?.getAttribute?.('title'),
          el?.getAttribute?.('placeholder'),
        ]
          .filter(Boolean)
          .join(' '),
      );
    const nodes = Array.from(
      document.querySelectorAll('button,[role="button"],[role="textbox"],textarea,input[type="submit"]'),
    ).filter(visible);
    const postSignals = nodes.some((el) =>
      /\b(?:create(?: a)? post|write something|what'?s on your mind|start a post|post something)\b/i.test(
        labelOf(el),
      ),
    );
    const composer = nodes.some(
      (el) => el.matches?.('[role="textbox"],textarea') && el.closest('form') && n(el),
    );
    if (composer || postSignals) return { skip: false, hasPostBox: composer, hasTrigger: postSignals };
    const body = normalize(document.body?.innerText || document.body?.textContent || '');
    const hardBlocked =
      /\b(?:this group is paused|this group has been archived|this group is suspended|this group is restricted|only admins can post|posting is restricted|membership request is pending|request to join is pending)\b/i.test(
        body,
      );
    if (hardBlocked) {
      const r = detectGroupPostingSkip();
      if (r?.skip) return r;
    }
    return { skip: false, unknown: true, hasPostBox: false, hasTrigger: false };
  }
  function dismissFacebookEntitySuggestions() {
    try {
      const active = document.activeElement;
      const body = String(document.body?.innerText || '').toLowerCase();
      if (active && active.matches?.('[contenteditable="true"][role="textbox"]')) {
        active.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
        active.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      }
      const popups = Array.from(
        document.querySelectorAll('[role="listbox"],[role="option"],[role="dialog"]'),
      ).filter(t);
      popups.forEach((p) => {
        const tx = String(p.innerText || p.textContent || '').toLowerCase();
        if (/mention|people you may be referring to|tag|suggestion/.test(tx))
          try {
            p.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            );
          } catch {}
      });
      return body;
    } catch {
      return '';
    }
  }
  async function ot(e, n, o, r, i, background, a) {
    let s = !1,
      l = null;
    // Idempotency guard: the service worker should send one POST_TO_GROUP request
    // per runId. If Chrome/Facebook delivers the same request again while the
    // existing run is active, do not open/click a second composer.
    if (
      a &&
      a.taskId === e &&
      a.runId === n &&
      a.groupId === o &&
      a.stage &&
      a.stage !== 'IDLE' &&
      !a.completed &&
      !a.failed
    ) {
      return {
        success: false,
        pending: false,
        retryable: true,
        error: 'A posting action for this group is already in progress.',
        errorCode: 'POST_ALREADY_IN_PROGRESS',
        duplicateRequest: true,
      };
    }
    a &&
      (function (e, t, n, o) {
        (Object.assign(e, {
          taskId: t || null,
          runId: n || null,
          groupId: o,
          stage: 'INITIALIZING',
          postButtonClicked: !1,
          postButtonClickedAt: void 0,
          confirmationSeen: !1,
          confirmationSeenAt: void 0,
          confirmationType: void 0,
          completed: !1,
          failed: !1,
          abortRequested: !1,
          postUrl: void 0,
          groupName: void 0,
          errorCode: void 0,
          errorMessage: void 0,
          composerDiagnostics: void 0,
          composerHtmlLang: void 0,
          composerMatchedLang: void 0,
          composerMatchedHint: void 0,
          backgroundResult: void 0,
          mediaExpectedCount: void 0,
          mediaPreviewCount: void 0,
          mediaAttachmentEvidenceCount: void 0,
          mediaUploadInProgress: void 0,
          mediaUploadProgress: void 0,
          mediaAttachmentPhase: void 0,
          mediaAttachmentDiagnostics: void 0,
          lastUpdatedAt: new Date().toISOString(),
        }),
          Ze(e));
      })(a, e, n, o);
    // Read by the catch block too, after a failure past the Post click.
    let postUrlBaseline;
    let mediaHasVideo = false;
    try {
      if ((tt(a), !I())) throw new Error('User not logged in to Facebook');
      const postingSkip = detectGroupPostingSkip();
      if (postingSkip.skip) {
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: postingSkip.code,
          errorMessage: postingSkip.message,
        });
        Ye(`Skipping group: ${postingSkip.message}`);
        return {
          success: false,
          skipped: true,
          error: postingSkip.message,
          errorCode: postingSkip.code,
          userMessage: postingSkip.message,
        };
      }
      (!(function (
        e = 'Posting in progress\nPlease don’t click or close this window.\nIt will close automatically.',
      ) {
        Je(e);
      })(),
        (s = !0),
        'complete' !== document.readyState &&
          (await new Promise((e) => window.addEventListener('load', () => e()))),
        await V(T),
        tt(a));
      const e = Ke();
      if ('BLOCKED' === e.kind) {
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: e.errorCode,
          errorMessage: e.userMessage,
        });
        Ye(`Skipping group: ${e.userMessage}`);
        return {
          success: false,
          skipped: true,
          error: e.userMessage,
          errorCode: e.errorCode,
          userMessage: e.userMessage,
        };
      }
      if (detectTemporarilyPausedGroup()) {
        const msg = 'This group is paused. Skipping this group.';
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: 'GROUP_TEMPORARILY_PAUSED',
          errorMessage: msg,
        });
        Ye(msg);
        return {
          success: false,
          skipped: true,
          error: msg,
          errorCode: 'GROUP_TEMPORARILY_PAUSED',
          userMessage: msg,
        };
      }
      let eligibility = detectNoCreatePostOption();
      if (eligibility.unknown && !eligibility.hasTrigger && !eligibility.hasPostBox) {
        // Facebook often renders the group shell first and the Discussion/Create post
        // surface a little later. A 300ms decision caused false SKIPPED results even
        // when the group visibly had a working Write something/Create post control.
        // Wait for the real surface to settle before declaring the group ineligible.
        const eligibilityDeadline = Date.now() + 5000;
        while (eligibility.unknown && !eligibility.skip && Date.now() < eligibilityDeadline) {
          await V(0.25);
          eligibility = detectNoCreatePostOption();
          if (!eligibility.unknown) break;
        }
        // Unknown is NOT evidence that posting is unavailable. Let pe() perform the
        // authoritative composer-open attempt; only explicit skip conditions above
        // are allowed to skip before opening the composer.
      }
      if (eligibility.skip) {
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: eligibility.code,
          errorMessage: eligibility.message,
        });
        Ye(`Skipping group: ${eligibility.message}`);
        return {
          success: false,
          skipped: true,
          error: eligibility.message,
          errorCode: eligibility.code,
          userMessage: eligibility.message,
        };
      }
      let n = [];
      let mediaPreloadProgress = null;
      let mediaPreloadError = null;
      (et(a, {
        composerHtmlLang: document.documentElement.lang || null,
        composerMatchedLang: c.matchedLang || null,
        composerMatchedHint: c.matchedHint || null,
      }),
        await V(k),
        tt(a));
      const composerOpen = await pe();
      if (!composerOpen?.success) {
        const msg = composerOpen?.message || 'Facebook did not open the Create post composer.';
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: composerOpen?.code || 'GROUP_COMPOSER_NOT_OPEN',
          errorMessage: msg,
          composerDiagnostics: composerOpen?.diagnostics || null,
        });
        Ye(msg);
        return {
          success: false,
          skipped: true,
          error: msg,
          errorCode: composerOpen?.code || 'GROUP_COMPOSER_NOT_OPEN',
          userMessage: msg,
        };
      }
      const u = await waitForReferenceComposerTextbox(6000);
      if (!u) {
        const msg = "Facebook's post composer textbox was not found after the composer opened.";
        et(a, {
          completed: true,
          confirmationSeen: false,
          confirmationType: 'SKIPPED',
          stage: 'SKIPPED',
          errorCode: 'TEXTBOX_NOT_FOUND',
          errorMessage: msg,
        });
        Ye(msg);
        return {
          success: false,
          skipped: true,
          error: msg,
          errorCode: 'TEXTBOX_NOT_FOUND',
          userMessage: msg,
        };
      }
      try {
        u.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        u.click?.();
        u.focus?.();
        await V(0.15);
      } catch {}
      tt(a);
      // Capture existing post/permalink links before clicking Post. Any matching
      // URL that appears after submission is therefore a strong new-post signal.
      postUrlBaseline = captureComposerResultUrlBaseline(o);
      if (i.length) {
        et(a, {
          stage: 'FETCHING_MEDIA',
          mediaExpectedCount: i.length,
          mediaAttachmentPhase: 'REFERENCE_MEDIA_FETCHING',
          mediaAttachmentDiagnostics: 'Preloading selected media from shared extension-origin IndexedDB',
        });
        try {
          n = await xe(i, {
            timeoutMs: 120000,
            onProgress: (p) => {
              mediaPreloadProgress = p;
            },
          });
          if (!Array.isArray(n) || n.length !== i.length)
            throw new Error(
              `Failed to load all selected media. Expected ${i.length}, got ${Array.isArray(n) ? n.length : 0}`,
            );
        } catch (err) {
          const msg = err?.message || String(err);
          et(a, {
            failed: true,
            stage: 'FAILED',
            errorCode: 'MEDIA_FETCH_FAILED',
            errorMessage: msg,
            mediaExpectedCount: i.length,
            mediaAttachmentPhase: 'MEDIA_FETCH_FAILED',
            mediaAttachmentDiagnostics: msg,
          });
          Ye(`Media loading failed: ${msg}`);
          throw Ae('MEDIA_FETCH_FAILED', "Couldn't load selected media", msg);
        }
      }
      ((l = await Qe(o)), et(a, { stage: 'INJECTING_TEXT' }));
      let injection;
      try {
        injection = await Te(r, u, {
          referenceFabMediaEntries: n,
          shouldAbort: () => !0 === (null == a ? void 0 : a.abortRequested),
          beforeSubmit: async (box) => {
            // v5.56 CRITICAL: text-only posts must NEVER enter the media-loading path.
            // The absence of mediaIds is authoritative; do not call GET_POST_MEDIA or wait for files.
            if (!Array.isArray(i) || !i.length) return true;
            if (Array.isArray(n) && n.length) return true;

            et(a, {
              stage: 'FETCHING_MEDIA',
              mediaExpectedCount: i.length,
              mediaAttachmentPhase: 'REFERENCE_MEDIA_FETCHING',
              mediaAttachmentDiagnostics:
                'Loading media through GET_POST_MEDIA for supplied reference paste logic',
            });
            try {
              n = await xe(i, {
                timeoutMs: 120000,
                onProgress: (p) => {
                  mediaPreloadProgress = p;
                },
              });
              if (!Array.isArray(n) || n.length !== i.length)
                throw new Error(
                  `Failed to load all selected media. Expected ${i.length}, got ${Array.isArray(n) ? n.length : 0}`,
                );
            } catch (err) {
              const msg = err?.message || String(err);
              et(a, {
                failed: true,
                stage: 'FAILED',
                errorCode: 'MEDIA_FETCH_FAILED',
                errorMessage: msg,
                mediaExpectedCount: i.length,
                mediaAttachmentPhase: 'MEDIA_FETCH_FAILED',
                mediaAttachmentDiagnostics: msg,
              });
              Ye(`Media loading failed: ${msg}`);
              throw Ae('MEDIA_FETCH_FAILED', "Couldn't load selected media", msg);
            }
            if (a?.abortRequested) throw new Error('Posting aborted before media attachment');
            et(a, {
              stage: 'ATTACHING_MEDIA',
              mediaExpectedCount: n.length,
              mediaPreviewCount: 0,
              mediaUploadInProgress: true,
              mediaUploadProgress: null,
              mediaAttachmentPhase: 'REFERENCE_MEDIA_PASTE',
            });
            const mediaResult = await ze(n, box, {
              onProgress: (e) => {
                et(a, { stage: 'ATTACHING_MEDIA', ...e });
              },
            });
            if (!mediaResult.success) {
              et(a, {
                failed: true,
                stage: 'FAILED',
                errorCode: mediaResult.errorCode,
                errorMessage: mediaResult.diagnostics || void 0,
                mediaAttachmentDiagnostics: mediaResult.diagnostics || null,
              });
              throw Ae(
                mediaResult.errorCode,
                "Couldn't attach media",
                mediaResult.diagnostics
                  ? `Media attachment failed. ${mediaResult.diagnostics}`
                  : 'Media attachment failed',
              );
            }
            await V(0.35);
            return true;
          },
          onReadyToSubmit: () => {
            et(a, { stage: 'READY_TO_SUBMIT' });
          },
          background: i.length ? '' : String(background || ''),
          onBackgroundResult: (r) => a && (a.backgroundResult = r),
          mediaIds: i.length ? i : [],
          onPostButtonClicked: () => {
            (l && l.markPostButtonClicked(),
              et(a, {
                postButtonClicked: !0,
                postButtonClickedAt: new Date().toISOString(),
                stage: 'SUBMITTED',
              }));
          },
        });
      } catch (err) {
        const code = err?.code;
        if (detectAccountPostingRestriction(document)) {
          const msg = 'Facebook reported an account-level posting restriction. Posting stopped.';
          et(a, {
            completed: true,
            failed: true,
            accountRestricted: true,
            stage: 'FAILED',
            errorCode: 'ACCOUNT_POSTING_RESTRICTED',
            errorMessage: msg,
          });
          Ye(msg);
          return {
            success: false,
            stopped: true,
            accountRestricted: true,
            error: msg,
            errorCode: 'ACCOUNT_POSTING_RESTRICTED',
          };
        }
        if (['TEXT_INJECTION_FAILED', 'COMPOSER_NOT_FOCUSABLE'].includes(String(code))) {
          const msg =
            err?.userMessage ||
            err?.message ||
            'Facebook could not complete the posting action on this group.';
          et(a, {
            completed: true,
            failed: false,
            confirmationSeen: false,
            confirmationType: 'RETRYABLE',
            stage: 'FAILED',
            errorCode: String(code),
            errorMessage: msg,
          });
          Ye(`Retrying group after transient composer error: ${msg}`);
          return {
            success: false,
            skipped: false,
            retryable: true,
            error: msg,
            errorCode: String(code),
            userMessage: msg,
          };
        }
        if (String(code) === 'TEXTBOX_NOT_FOUND') {
          const msg = err?.userMessage || err?.message || "Facebook's post composer textbox was not found.";
          et(a, {
            completed: true,
            failed: false,
            confirmationSeen: false,
            confirmationType: 'SKIPPED',
            stage: 'SKIPPED',
            errorCode: String(code),
            errorMessage: msg,
          });
          Ye(`Skipping group: ${msg}`);
          return { success: false, skipped: true, error: msg, errorCode: String(code), userMessage: msg };
        }
        throw err;
      }
      if (!injection?.submitted) throw new Error('Failed to inject content into composer');
      mediaHasVideo =
        Array.isArray(n) &&
        n.some((e) =>
          String(e?.mimeType || '')
            .toLowerCase()
            .startsWith('video/'),
        );
      const m = await Promise.race([
        l.waitForOutcome(),
        (async () => {
          const closed = await nt(u, 0, 5e3, 250);
          if (!closed?.confirmed) return new Promise(() => {});
          // VIDEO TERMINAL FAST-PATH: once the video has finished processing, the
          // Post button has been clicked, and Facebook closes Create Post, the
          // submission is terminal for this queue. Do not wait for Facebook's
          // asynchronous post URL/GraphQL processing before moving on.
          // Explicit admin-approval evidence still wins if it is already visible.
          if (mediaHasVideo) {
            // Video is special: Facebook may close Create post first and only then
            // render the "Your post is pending / awaiting admin approval" card on the
            // underlying group page. Never classify the video as Published before that
            // short post-dialog grace window has had a chance to expose the approval
            // state. We do NOT wait for the video URL/transcoding to finish.
            const pendingDeadline = Date.now() + 6500;
            while (Date.now() < pendingDeadline) {
              if (detectExplicitPostPending(document))
                return { kind: 'PENDING_APPROVAL', domConfirmed: true, dialogClosed: true };
              await V(250);
            }
            // v5.84: if no explicit pending evidence appeared, Published is terminal
            // for the queue even when Facebook delays the final video URL. URL recovery
            // remains best-effort and does not decide Published vs Pending.
            const videoUrl = await waitForComposerResultUrl(o, 'PUBLISHED', postUrlBaseline, 1500);
            if (detectExplicitPostPending(document))
              return { kind: 'PENDING_APPROVAL', domConfirmed: true, dialogClosed: true };
            return { kind: 'PUBLISHED', postUrl: videoUrl || void 0, domConfirmed: true, dialogClosed: true };
          }
          // Keep the proven v5.63 resolution path for text/photo posts unchanged.
          const detected = await Promise.race([l.waitForOutcome(), V(2500).then(() => null)]);
          if (
            detected &&
            detected.kind &&
            detected.kind !== 'DETECTOR_UNAVAILABLE' &&
            detected.kind !== 'UNCONFIRMED'
          )
            return detected;
          if (detectExplicitPostPending(document))
            return { kind: 'PENDING_APPROVAL', domConfirmed: true, dialogClosed: true };
          const recoveredUrl = await waitForComposerResultUrl(o, 'PUBLISHED', postUrlBaseline, 5000);
          if (recoveredUrl)
            return { kind: 'PUBLISHED', postUrl: recoveredUrl, domConfirmed: true, dialogClosed: true };
          return { kind: 'DETECTOR_UNAVAILABLE', postId: l.postId, domConfirmed: true, dialogClosed: true };
        })(),
      ]);
      const g = (function () {
        var e, n;
        const o = Array.from(document.querySelectorAll('h1')).find(t),
          r = f((null == (e = null == o ? void 0 : o.textContent) ? void 0 : e.trim()) || '');
        if (r && r.length <= 120) return r;
        const i = document.querySelector('meta[property="og:title"]'),
          a = f((null == (n = null == i ? void 0 : i.getAttribute('content')) ? void 0 : n.trim()) || '');
        if (a && a.length <= 120) return a;
        const s = document.title.match(/^(.+?)\s*[|·-]/);
        if (s) return f(s[1].trim()) || null;
        return null;
      })();
      switch (m.kind) {
        case 'PUBLISHED': {
          const resolvedPostUrl =
            m.postUrl ||
            canonicalFacebookPostUrl(o, m.postId) ||
            (mediaHasVideo ? null : await waitForComposerResultUrl(o, 'PUBLISHED', postUrlBaseline, 5000));
          return (
            et(a, {
              completed: !0,
              confirmationSeen: !0,
              confirmationSeenAt: new Date().toISOString(),
              confirmationType: 'POSTED',
              postId: m.postId || null,
              postUrl: resolvedPostUrl || null,
              pendingPostUrl: void 0,
              stage: 'COMPLETED',
              groupName: g || void 0,
            }),
            Ye('Post submitted successfully. Moving to the next group...'),
            {
              success: !0,
              postId: m.postId,
              postUrl: resolvedPostUrl || null,
              groupName: g || void 0,
              warningCode: void 0,
              composerHtmlLang: document.documentElement.lang || null,
              composerMatchedLang: c.matchedLang || null,
              composerMatchedHint: c.matchedHint || null,
              mediaHasVideo,
              mediaExpectedCount: (null == a ? void 0 : a.mediaExpectedCount) ?? null,
              mediaPreviewCount: (null == a ? void 0 : a.mediaPreviewCount) ?? null,
              mediaUploadInProgress: (null == a ? void 0 : a.mediaUploadInProgress) ?? null,
              mediaUploadProgress: (null == a ? void 0 : a.mediaUploadProgress) || null,
              mediaAttachmentPhase: (null == a ? void 0 : a.mediaAttachmentPhase) || null,
              mediaAttachmentDiagnostics: (null == a ? void 0 : a.mediaAttachmentDiagnostics) || null,
            }
          );
        }
        case 'PENDING_APPROVAL':
          return (
            et(a, {
              completed: !0,
              confirmationSeen: !0,
              confirmationSeenAt: new Date().toISOString(),
              confirmationType: 'ADMIN_APPROVAL',
              postId: m.postId || null,
              stage: 'COMPLETED',
              postUrl: void 0,
              pendingPostUrl: `https://www.facebook.com/groups/${String(o || '').trim()}/my_pending_content`,
              groupName: g || void 0,
            }),
            Ye('Post submitted for admin approval. Moving to the next group...'),
            {
              success: !0,
              postId: m.postId || null,
              postUrl: void 0,
              pendingPostUrl: `https://www.facebook.com/groups/${String(o || '').trim()}/my_pending_content`,
              groupName: g || void 0,
              warningCode: 'POST_REQUIRES_ADMIN_APPROVAL',
              composerHtmlLang: document.documentElement.lang || null,
              composerMatchedLang: c.matchedLang || null,
              composerMatchedHint: c.matchedHint || null,
              mediaExpectedCount: (null == a ? void 0 : a.mediaExpectedCount) ?? null,
              mediaPreviewCount: (null == a ? void 0 : a.mediaPreviewCount) ?? null,
              mediaUploadInProgress: (null == a ? void 0 : a.mediaUploadInProgress) ?? null,
              mediaUploadProgress: (null == a ? void 0 : a.mediaUploadProgress) || null,
              mediaAttachmentPhase: (null == a ? void 0 : a.mediaAttachmentPhase) || null,
              mediaAttachmentDiagnostics: (null == a ? void 0 : a.mediaAttachmentDiagnostics) || null,
            }
          );
        case 'DETECTOR_UNAVAILABLE': {
          const dialogClosed = await nt(u, 0, 3e3, 250);
          const pendingUrl = `https://www.facebook.com/groups/${String(o || '').trim()}/my_pending_content`;
          if (!a?.postButtonClicked) {
            et(a, {
              completed: !1,
              failed: !1,
              confirmationSeen: !1,
              confirmationType: 'POST_CLICK_UNCONFIRMED',
              stage: 'FAILED',
              errorCode: 'POST_CLICK_UNCONFIRMED',
              errorMessage:
                'Facebook Post button activation was not confirmed. The group will be retried instead of being marked as submitted.',
            });
            Ye('Post button activation was not confirmed. Retrying this group...');
            return {
              success: !1,
              skipped: !1,
              retryable: !0,
              error: 'Facebook Post button activation was not confirmed.',
              errorCode: 'POST_CLICK_UNCONFIRMED',
            };
          }
          if (detectExplicitPostPending(document)) {
            et(a, {
              completed: !0,
              confirmationSeen: !0,
              confirmationType: 'ADMIN_APPROVAL',
              stage: 'COMPLETED',
              postId: m.postId || null,
              postUrl: void 0,
              pendingPostUrl: pendingUrl,
              groupName: g || void 0,
            });
            Ye('Post submitted for admin approval. Moving to the next group...');
            return {
              success: !0,
              pending: !0,
              postId: m.postId || null,
              postUrl: void 0,
              pendingPostUrl: pendingUrl,
              groupName: g || void 0,
              warningCode: 'POST_REQUIRES_ADMIN_APPROVAL',
              mediaHasVideo,
            };
          }
          if (m.postId) {
            const postUrl = canonicalFacebookPostUrl(o, m.postId);
            et(a, {
              completed: !0,
              confirmationSeen: !0,
              confirmationType: 'POSTED',
              stage: 'COMPLETED',
              postId: m.postId,
              postUrl,
              pendingPostUrl: void 0,
              groupName: g || void 0,
            });
            Ye('Post submitted successfully. Moving to the next group...');
            return {
              success: !0,
              pending: !1,
              postId: m.postId,
              postUrl,
              groupName: g || void 0,
              warningCode: void 0,
              mediaHasVideo,
            };
          }
          if (dialogClosed.confirmed) {
            const recoveredUrl = await waitForComposerResultUrl(o, 'PUBLISHED', postUrlBaseline, 5000);
            if (recoveredUrl) {
              et(a, {
                completed: !0,
                confirmationSeen: !0,
                confirmationType: 'POSTED',
                stage: 'COMPLETED',
                postId: null,
                postUrl: recoveredUrl,
                pendingPostUrl: void 0,
                groupName: g || void 0,
              });
              Ye('Post submitted successfully. Moving to the next group...');
              return {
                success: !0,
                pending: !1,
                postUrl: recoveredUrl,
                pendingPostUrl: void 0,
                groupName: g || void 0,
                warningCode: void 0,
                recoveredAfterPostClick: !0,
                mediaHasVideo,
              };
            }
            et(a, {
              completed: !0,
              confirmationSeen: !0,
              confirmationType: 'POSTED',
              stage: 'COMPLETED',
              postId: null,
              postUrl: void 0,
              pendingPostUrl: void 0,
              groupName: g || void 0,
            });
            Ye('Post submitted successfully. Moving to the next group...');
            return {
              success: !0,
              pending: !1,
              postUrl: void 0,
              pendingPostUrl: void 0,
              groupName: g || void 0,
              warningCode: 'POST_URL_UNAVAILABLE',
              recoveredAfterPostClick: !0,
              mediaHasVideo,
            };
          }
          // CRITICAL: if the Create post dialog is still open after the click attempts,
          // never advance the queue. The visible Post button means Facebook did not
          // complete the submit transition. Force this group through the retry path.
          et(a, {
            completed: !1,
            failed: !1,
            confirmationSeen: !1,
            confirmationType: 'POST_SUBMISSION_UNCONFIRMED',
            stage: 'FAILED',
            errorCode: 'POST_SUBMISSION_UNCONFIRMED',
            errorMessage:
              'Facebook Create post is still open after Post activation; submission was not confirmed.',
          });
          Ye(
            'Facebook did not close the Create post dialog after Post activation. Retrying this group instead of moving to the next group.',
          );
          return {
            success: !1,
            skipped: !1,
            retryable: !0,
            error: 'Facebook Create post is still open after Post activation.',
            errorCode: 'POST_SUBMISSION_UNCONFIRMED',
          };
        }
        default:
          return (
            et(a, {
              completed: !1,
              confirmationSeen: !1,
              confirmationType: 'UNKNOWN',
              stage: 'SUBMITTED',
              postUrl: void 0,
              groupName: g || void 0,
            }),
            Ye('Post submitted. Moving to the next group...'),
            {
              success: !0,
              postUrl: void 0,
              groupName: g || void 0,
              warningCode: 'POST_SUBMISSION_UNCONFIRMED',
              composerHtmlLang: document.documentElement.lang || null,
              composerMatchedLang: c.matchedLang || null,
              composerMatchedHint: c.matchedHint || null,
              mediaExpectedCount: (null == a ? void 0 : a.mediaExpectedCount) ?? null,
              mediaPreviewCount: (null == a ? void 0 : a.mediaPreviewCount) ?? null,
              mediaUploadInProgress: (null == a ? void 0 : a.mediaUploadInProgress) ?? null,
              mediaUploadProgress: (null == a ? void 0 : a.mediaUploadProgress) || null,
              mediaAttachmentPhase: (null == a ? void 0 : a.mediaAttachmentPhase) || null,
              mediaAttachmentDiagnostics: (null == a ? void 0 : a.mediaAttachmentDiagnostics) || null,
            }
          );
      }
    } catch (c) {
      const e = (function (e) {
        return e instanceof Error && 'string' == typeof e.code && 'string' == typeof e.userMessage;
      })(c)
        ? c
        : null;
      if (!isRetryableMediaError(c)) {
        console.error('[Posting] Error in postToFacebookGroup:', c);
      } else {
        console.debug(
          '[Posting] Recoverable media event; existing retry path will handle it:',
          String(c?.code || c?.message || c),
        );
      }
      if (detectAccountPostingRestriction(document)) {
        const msg = 'Facebook reported an account-level posting restriction. Posting stopped.';
        et(a, {
          completed: true,
          failed: true,
          accountRestricted: true,
          stage: 'FAILED',
          errorCode: 'ACCOUNT_POSTING_RESTRICTED',
          errorMessage: msg,
        });
        Ye(msg);
        return {
          success: false,
          stopped: true,
          accountRestricted: true,
          error: msg,
          errorCode: 'ACCOUNT_POSTING_RESTRICTED',
        };
      }
      const explicitFailure = detectExplicitPostFailure(document);
      if (!a?.postButtonClicked && String(c?.code || '') !== 'POST_CLICK_UNCONFIRMED') {
        const msg = 'Facebook Post button activation was not confirmed.';
        return { success: !1, skipped: !1, retryable: !0, error: msg, errorCode: 'POST_CLICK_UNCONFIRMED' };
      }
      if (a?.postButtonClicked && !explicitFailure) {
        const pendingUrl = `https://www.facebook.com/groups/${String(o || '').trim()}/my_pending_content`;
        const dialogGone = !document.contains(u) || !u.isConnected || !u.closest('[role="dialog"]');
        const explicitPending = detectExplicitPostPending(document);
        if (dialogGone || a.postId) {
          if (explicitPending) {
            et(a, {
              completed: !0,
              failed: !1,
              confirmationSeen: !0,
              confirmationType: 'ADMIN_APPROVAL',
              stage: 'COMPLETED',
              postId: a.postId || null,
              postUrl: void 0,
              pendingPostUrl: pendingUrl,
              errorCode: void 0,
              errorMessage: void 0,
            });
            Ye('Post submitted for admin approval. Moving to the next group...');
            return {
              success: !0,
              pending: !0,
              postId: a.postId || null,
              postUrl: void 0,
              pendingPostUrl: pendingUrl,
              warningCode: 'POST_REQUIRES_ADMIN_APPROVAL',
              recoveredAfterPostClick: !0,
            };
          }
          const recoveredPostUrl = a.postId
            ? canonicalFacebookPostUrl(o, a.postId)
            : mediaHasVideo
              ? null
              : await waitForComposerResultUrl(o, 'PUBLISHED', postUrlBaseline, 5000);
          et(a, {
            completed: !0,
            failed: !1,
            confirmationSeen: !!(dialogGone || a.postId),
            confirmationType: 'POSTED',
            stage: 'COMPLETED',
            postId: a.postId || null,
            postUrl: recoveredPostUrl || void 0,
            pendingPostUrl: void 0,
            errorCode: void 0,
            errorMessage: void 0,
          });
          Ye('Post submitted successfully. Moving to the next group...');
          return {
            success: !0,
            pending: !1,
            postId: a.postId || null,
            postUrl: recoveredPostUrl || void 0,
            pendingPostUrl: void 0,
            warningCode: void 0,
            recoveredAfterPostClick: !0,
            mediaHasVideo,
          };
        }
      }
      s && Ye('Posting failed. Closing window...');
      return (
        a &&
          !a.completed &&
          et(a, {
            failed: !0,
            stage: 'FAILED',
            errorCode: (null == e ? void 0 : e.code) || 'UNKNOWN',
            errorMessage: c.message || 'Unknown error',
          }),
        {
          success: !1,
          error: c.message || 'Unknown error',
          errorCode: (null == e ? void 0 : e.code) || 'UNKNOWN',
          userMessage: (null == e ? void 0 : e.userMessage) || 'Facebook layout changed on this group page',
          composerDiagnostics: (null == a ? void 0 : a.composerDiagnostics) || null,
          composerHtmlLang:
            (null == a ? void 0 : a.composerHtmlLang) || document.documentElement.lang || null,
          composerMatchedLang: (null == a ? void 0 : a.composerMatchedLang) || null,
          composerMatchedHint: (null == a ? void 0 : a.composerMatchedHint) || null,
          mediaExpectedCount: (null == a ? void 0 : a.mediaExpectedCount) ?? null,
          mediaPreviewCount: (null == a ? void 0 : a.mediaPreviewCount) ?? null,
          mediaUploadInProgress: (null == a ? void 0 : a.mediaUploadInProgress) ?? null,
          mediaUploadProgress: (null == a ? void 0 : a.mediaUploadProgress) || null,
          mediaAttachmentPhase: (null == a ? void 0 : a.mediaAttachmentPhase) || null,
          mediaAttachmentDiagnostics: (null == a ? void 0 : a.mediaAttachmentDiagnostics) || null,
        }
      );
    } finally {
      null == l || l.dispose();
    }
  }
  async function rt(e, t = 15e3) {
    const n = Date.now();
    for (; Date.now() - n < t;) {
      const t = await e();
      if (t) return t;
      await new Promise((e) => setTimeout(e, 500));
    }
    return null;
  }
  function it(e) {
    return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  }
  function at(e) {
    return !e.hasAttribute('disabled') && 'true' !== e.getAttribute('aria-disabled');
  }
  function st(e) {
    return e.innerText || e.textContent || '';
  }
  function lt(e) {
    const t = Array.from(e.querySelectorAll('a[href]'));
    for (const n of t)
      try {
        const e = new URL(n.href, window.location.origin).searchParams.get('comment_id');
        if (e) return e;
      } catch {}
  }
  async function ct(e) {
    const t = (function () {
      const e = [];
      return {
        add(t) {
          e.includes(t) || e.push(t);
        },
        value: () => e.join('|'),
      };
    })();
    if (
      (t.add('REQUESTED'),
      !(function (e, t, n) {
        try {
          const o = new URL(e).pathname.split('/').filter(Boolean);
          return 'groups' === o[0] && o[1] === t && ('posts' === o[2] || 'permalink' === o[2]) && o[3] === n;
        } catch {
          return !1;
        }
      })(window.location.href, e.groupId, e.postId))
    )
      return (
        t.add('PERMALINK_URL_MISMATCH'),
        { kind: 'SKIPPED', reason: 'POST_URL_MISMATCH', diagnostics: t.value() }
      );
    t.add('PERMALINK_URL_CONFIRMED');
    const n = await rt(
      () =>
        (function (e) {
          const t = Array.from(
            e.querySelectorAll('[role="textbox"][contenteditable="true"][data-lexical-editor="true"]'),
          ).filter((e) => it(e) && at(e));
          return 1 === t.length ? t[0] : null;
        })(document),
      15e3,
    );
    if (!n)
      return (
        t.add('TEXTBOX_NOT_FOUND'),
        { kind: 'SKIPPED', reason: 'COMMENT_TEXTBOX_NOT_FOUND', diagnostics: t.value() }
      );
    t.add('TEXTBOX_FOUND');
    const o = n.closest('[role="dialog"]');
    let r = await (async function (e, t) {
      (e.scrollIntoView({ block: 'center', inline: 'nearest' }),
        e.click(),
        e.focus(),
        e.dispatchEvent(new Event('input', { bubbles: !0, cancelable: !0 })));
      const n = new DataTransfer(),
        o = Ie(t);
      (n.setData('text/plain', o), n.setData('text/html', Ce(o)));
      const r = new ClipboardEvent('paste', { bubbles: !0, cancelable: !0, clipboardData: n });
      return (
        e.dispatchEvent(r),
        e.dispatchEvent(new Event('input', { bubbles: !0, cancelable: !0 })),
        await rt(() => st(e).includes(t), 3e3),
        st(e).trim() === t.trim()
      );
    })(n, e.commentText);
    if (
      (r ||
        ((r = (function (e, t) {
          (e.click(), e.focus());
          const n = document.createRange(),
            o = window.getSelection(),
            r = e.querySelector('p') ?? e.firstChild ?? e;
          if (!r) return !1;
          (n.selectNodeContents(r),
            n.collapse(!1),
            null == o || o.removeAllRanges(),
            null == o || o.addRange(n));
          const i = document.execCommand('insertText', !1, t);
          return (e.dispatchEvent(new Event('input', { bubbles: !0 })), i);
        })(n, e.commentText)),
        r && (await rt(() => st(n).includes(e.commentText), 3e3))),
      !r || st(n).trim() !== e.commentText.trim())
    )
      return (
        t.add('INSERTION_FAILED'),
        { kind: 'SKIPPED', reason: 'COMMENT_INSERTION_FAILED', diagnostics: t.value() }
      );
    t.add('INSERT_OK');
    const i = o
      ? (function (e) {
          const t = e.querySelector('#focused-state-composer-submit [role="button"]');
          return t && it(t) && at(t) ? t : null;
        })(o)
      : null;
    if (!i || !o)
      return (
        t.add('SUBMIT_NOT_FOUND'),
        { kind: 'FAILED', reason: 'COMMENT_SUBMIT_NOT_FOUND', diagnostics: t.value() }
      );
    (t.add('SUBMIT_FOUND'),
      (function (e) {
        var t;
        (e.scrollIntoView({ block: 'center', inline: 'nearest' }), null == (t = e.focus) || t.call(e));
        const n =
          e.closest('[role="button"]:not([aria-disabled="true"])') ?? e.closest('button:not(:disabled)') ?? e;
        (n.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: !0, cancelable: !0, composed: !0, view: window }),
        ),
          n.dispatchEvent(
            new MouseEvent('mouseup', { bubbles: !0, cancelable: !0, composed: !0, view: window }),
          ),
          n.dispatchEvent(
            new MouseEvent('click', { bubbles: !0, cancelable: !0, composed: !0, view: window }),
          ));
      })(i),
      t.add('SUBMIT_BUTTON_CLICKED'));
    const a = await (async function (e, t, n) {
      return (await rt(() => {
        const o = st(t),
          r = Array.from(e.querySelectorAll('[role="article"]')).find(
            (e) => e.innerText.includes(n) && !t.contains(e),
          );
        return Boolean(r && !o.includes(n));
      }, 25e3))
        ? { posted: !0, commentId: lt(e) }
        : { posted: !1 };
    })(o, n, e.commentText);
    return a.posted
      ? (t.add('CONFIRMED'), { kind: 'POSTED', commentId: a.commentId, diagnostics: t.value() })
      : (t.add('CONFIRMATION_FAILED'),
        { kind: 'FAILED', reason: 'COMMENT_CONFIRMATION_FAILED', diagnostics: t.value() });
  }
  const ut = {
    taskId: null,
    runId: null,
    groupId: null,
    stage: 'IDLE',
    postButtonClicked: !1,
    confirmationSeen: !1,
    completed: !1,
    failed: !1,
    abortRequested: !1,
  };

  // FB Group Bulk Poster V11: isolated real-post bridge. Group sync stays in the
  // original baseline content/content.js. This bridge exposes only posting actions.
  chrome.runtime.onMessage.addListener((e, t, n) => {
    switch (e?.action) {
      case 'PING_FB_POSTER':
        n({ status: 'facebook_poster_alive' });
        return false;
      case 'POST_TO_GROUP': {
        const postContent =
          typeof e.content === 'string'
            ? e.content
            : e.content && typeof e.content.message === 'string'
              ? e.content.message
              : String(e.content ?? '');
        const postMediaIds = Array.isArray(e.mediaIds) ? e.mediaIds : [];
        const postBackground = typeof e.background === 'string' ? e.background : '';
        return (
          ot(e.taskId, e.runId, e.groupId, postContent, postMediaIds, postBackground, ut)
            .then((r) => n({ ...r, backgroundResult: ut?.backgroundResult }))
            .catch((err) =>
              n({
                success: false,
                error: err?.message || 'Failed to post',
                errorCode: err?.code || 'UNKNOWN',
              }),
            ),
          true
        );
      }
      case 'POST_FIRST_COMMENT':
        return (
          ct({ groupId: e.groupId, postId: e.postId, commentText: e.commentText })
            .then((r) => n({ success: true, result: r }))
            .catch((err) =>
              n({
                success: false,
                result: { kind: 'FAILED', reason: 'COMMENT_EXCEPTION' },
                error: err?.message || String(err),
              }),
            ),
          true
        );
      case 'GET_ACTIVE_POSTING_STATUS':
        n({ success: true, status: ut });
        return false;
      case 'ABORT_ACTIVE_POSTING':
        if ((e.taskId && ut.taskId !== e.taskId) || (e.runId && ut.runId !== e.runId)) {
          n({ success: false });
          return false;
        }
        et(ut, { abortRequested: true, stage: 'ABORT_REQUESTED' });
        n({ success: true });
        return false;
      default:
        return false;
    }
  });
}
