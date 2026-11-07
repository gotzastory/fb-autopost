// FB Group Bulk Poster — Spintax / Auto-Spin engine
// Supports explicit {option1|option2} Spintax plus conservative plain-text Auto-Spin.
// Auto-Spin keeps the original wording as the first option and only replaces the
// first occurrence of a small set of common, semantically close words/phrases.
// It is intentionally conservative: it does not rewrite hashtags, URLs, numbers,
// mentions, or every occurrence of a word.

function spintaxFindClosing(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function spintaxSplitTopLevel(body) {
  const out = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) throw new Error('Unexpected } in Spintax.');
    } else if (ch === '|' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) throw new Error('Unmatched { in Spintax.');
  out.push(body.slice(start));
  return out;
}

function spintaxHasChoiceSyntax(text) {
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    const end = spintaxFindClosing(s, i);
    if (end < 0) return false;
    const body = s.slice(i + 1, end);
    const parts = spintaxSplitTopLevel(body);
    if (parts.length >= 2) return true;
    i = end;
  }
  return false;
}

function spintaxParse(text) {
  const source = String(text ?? '');
  const parseLocal = (str) => {
    const nodes = [];
    let plain = '';
    const flush = () => { if (plain) { nodes.push({ type: 'text', value: plain }); plain = ''; } };
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== '{') {
        if (ch === '}') throw new Error('Unexpected } in Spintax.');
        plain += ch;
        continue;
      }
      const end = spintaxFindClosing(str, i);
      if (end < 0) throw new Error('Unmatched { in Spintax.');
      const body = str.slice(i + 1, end);
      const options = spintaxSplitTopLevel(body);
      if (options.length < 2) plain += str.slice(i, end + 1);
      else {
        flush();
        nodes.push({ type: 'choice', options: options.map(parseLocal) });
      }
      i = end;
    }
    flush();
    return nodes;
  };
  return { source, nodes: parseLocal(source) };
}

function spintaxCountNodes(nodes, cap = 1000000000) {
  let total = 1;
  for (const node of nodes) {
    if (node.type !== 'choice') continue;
    let choiceCount = 0;
    for (const option of node.options) {
      choiceCount += spintaxCountNodes(option, cap);
      if (choiceCount >= cap) { choiceCount = cap; break; }
    }
    total *= choiceCount;
    if (total >= cap) return cap;
  }
  return Math.max(1, Math.min(cap, total));
}

function spintaxResolveNodes(nodes, random = Math.random) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.value;
    else {
      const options = node.options || [];
      if (!options.length) continue;
      const index = Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * options.length);
      out += spintaxResolveNodes(options[index], random);
    }
  }
  return out;
}

function spintaxNormalizeOutput(value) {
  return String(value ?? '').replace(/\u0000/g, '');
}

function spintaxResolve(text, random = Math.random) {
  const parsed = spintaxParse(text);
  return spintaxNormalizeOutput(spintaxResolveNodes(parsed.nodes, random));
}

function spintaxExpandNodes(nodes, limit, out = ['']) {
  let current = out.slice();
  for (const node of nodes) {
    if (node.type === 'text') {
      current = current.map(prefix => prefix + node.value);
      continue;
    }
    const next = [];
    for (const prefix of current) {
      for (const option of node.options || []) {
        const suffixes = spintaxExpandNodes(option, limit, ['']);
        for (const suffix of suffixes) {
          next.push(prefix + suffix);
          if (next.length >= limit) break;
        }
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    current = next;
  }
  return current.slice(0, Math.max(1, limit));
}

function spintaxShuffle(array, random = Math.random) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Conservative vocabulary inspired by the referenced Auto-Spin behavior:
// keep the user's original term first, replace only the first occurrence of
// each matched term, and avoid broad mechanical rewriting.
// Spintax V2 — Safe Whitelist Engine
//
// Auto-Spin is deliberately NOT an open-ended synonym/rewrite engine.
// It may replace text only when the exact phrase exists in this whitelist.
// Every replacement keeps the original phrase as option #1. Anything that is
// not matched by this vocabulary remains byte-for-byte unchanged (apart from
// the final NUL sanitization used by the existing engine).
const SAFE_SPINTAX_VOCABULARY = [
  { category: 'greeting', variants: [
    ['Hi everyone', 'Hello everyone', 'Hey everyone', 'Hi folks'],
    ['Hi all', 'Hello all', 'Hey all'],
    ['Good morning everyone', 'Morning everyone', 'Good morning all']
  ]},
  { category: 'opener', variants: [
    ["I'd like to share", 'I want to share', 'Let me share'],
    ['Just wanted to share', 'Wanted to share', 'Quick share'],
    ['We currently have', 'We have', "We're currently offering"],
    ["I'm looking for", 'I am looking for', "I'm searching for"]
  ]},
  { category: 'connector', variants: [
    ['Also', 'In addition', 'On top of that'],
    ['However', 'That said', 'Still'],
    ['Therefore', 'So', 'As a result'],
    ['For example', 'For instance', 'As an example'],
    ['In short', 'To sum up', 'Long story short']
  ]},
  { category: 'quality', variants: [
    ['high quality', 'great quality', 'top quality'],
    ['reliable', 'trustworthy', 'dependable'],
    ['fast', 'quick', 'speedy'],
    ['affordable', 'budget friendly', 'reasonably priced'],
    ['easy to use', 'simple to use', 'user friendly'],
    ['a great fit', 'a good fit', 'a solid fit']
  ]},
  { category: 'cta_soft', variants: [
    ['Feel free to DM me', 'Feel free to message me', 'DM me anytime'],
    ['Comment below if interested', 'Drop a comment if interested', 'Leave a comment if interested'],
    ['Happy to answer any questions', 'Glad to answer any questions', 'Happy to help with any questions'],
    ['Let me know if this helps', 'Let me know if that helps', 'Hope this helps'],
    ['Thanks for reading', 'Thank you for reading', 'Thanks everyone']
  ]},
  { category: 'time', variants: [
    ['right now', 'at the moment', 'currently'],
    ['recently', 'lately', 'over the past few weeks'],
    ['this week', 'this coming week', 'over the next few days']
  ]},
  { category: 'closing', variants: [
    ['Best regards', 'Kind regards', 'Warm regards'],
    ['Have a great day', 'Have a nice day', 'Hope you have a good day'],
    ['Cheers', 'Thanks again', 'Appreciate it']
  ]},
  { category: 'emoji_safe', variants: [
    ['😊', '🙂', '😃'],
    ['👉', '➡️', '▶️'],
    ['✅', '✔️', '🟢']
  ]},

  // Existing project-specific vocabulary is retained, but now runs through
  // the same exact-match/protected-token pipeline as the core vocabulary.
  { category: 'project', variants: [
    ['Generate any visual imaginable', ['Create any visual imaginable', 'Produce any visual imaginable', 'Make any visual imaginable', 'Bring any visual to life', 'Make any visual you can imagine', 'Create any visual you can imagine', 'Produce any visual you can imagine', 'Turn any visual idea into reality', 'Create virtually any visual you can imagine', 'Produce visuals of any kind']],
    ['most realistic voice AI', ['most lifelike voice AI', 'most natural-sounding voice AI', 'highly realistic voice AI']],
    ['now with video', ['with video now', 'now featuring video', 'including video now']],
    ['with video', ['with video support', 'featuring video', 'including video']],
    ['Try free now', ['Try it free now', 'Try it at no cost now', 'Try it for free now', 'Give it a free try', 'Try it today at no cost', 'Try it at no cost today', 'Give it a try for free', 'Try it without paying now', 'Try it for free today', 'Give it a no-cost try']],
    ['Hours of', ['Long hours of', 'Many hours of', 'Extended hours of', 'Countless hours of', 'Plenty of hours of', 'Several hours of', 'Endless hours of', 'Extra hours of', 'A good stretch of time spent on', 'A considerable amount of time spent on']],
    ['proxy debugging', ['proxy troubleshooting', 'debugging proxy issues', 'troubleshooting proxy issues', 'working through proxy bugs', 'diagnosing proxy issues', 'fixing proxy issues', 'working on proxy issues', 'debugging proxy connections', 'troubleshooting proxy problems', 'diagnosing proxy problems']],
    ['debugging', ['troubleshooting', 'diagnosing issues', 'working through bugs', 'fixing issues']],
    ['How to use', ['How to try', 'How to work with', 'How to make use of']],
    ['in your kitchen', ['in the kitchen', 'at home in your kitchen', 'in your cooking space']],
    ['start creating free', ['start creating for free', 'start creating at no cost', 'begin creating for free']],
    ['automated workflows', ['automated processes', 'automated pipelines', 'automated workstreams']],
    ['single visual canvas', ['one visual canvas', 'single visual workspace', 'one visual workspace']],
    ['leading image & video AI models', ['top image & video AI models', 'leading AI models for image & video', 'top AI models for image & video']],
    ['creative pipelines', ['creative workflows', 'creative processes', 'creative systems']],
    ['scalable systems', ['scalable solutions', 'scalable workflows', 'scalable setups']],
    ['audio stack', ['audio toolkit', 'audio suite', 'audio setup']],
    ['TikTok users are discovering new brands', ['TikTok users are finding new brands', 'TikTok users are discovering fresh brands', 'TikTok users are finding fresh brands']],
    ['discovering new brands', ['finding new brands', 'discovering fresh brands', 'finding fresh brands']],
    ['every single day', ['every day', 'day after day']],
    ['Make sure they find yours', ['Make sure they notice yours', 'Make sure they discover yours', 'Make sure they see yours']],
    ['short videos', ['brief videos', 'quick videos', 'short-form videos']],
    ['more traffic', ['additional traffic', 'more visitors', 'increased traffic']],
    ['drive traffic', ['bring in traffic', 'attract traffic', 'generate traffic']],
    ['grow your audience', ['build your audience', 'expand your audience', 'reach more people']]
  ]}
];

const PROTECTED_PATTERNS = [
  /https?:\/\/\S+/giu,
  /\b(?:www\.)\S+\.\S+/giu,
  /[\w.+-]+@[\w-]+\.[\w.]+/giu,
  /(?:\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/gu,
  /(?<![\p{L}\p{N}_])\$?\d[\d.,]*\s?(?:k|K|%|USD|EUR|GBP)?(?![\p{L}\p{N}_])/gu,
  /#\w+/gu,
  /@\w+/gu,
  /\{[^{}]*\}/gu
];

function autoSpinEscapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function autoSpinPreserveCase(original, replacement) {
  const o = String(original ?? '');
  const r = String(replacement ?? '');
  if (!o || !r) return r;
  if (o === o.toUpperCase()) return r.toUpperCase();
  if (o[0] === o[0].toUpperCase() && o.slice(1) === o.slice(1).toLowerCase()) {
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  return r;
}

function autoSpinLower(value) {
  return String(value ?? '').toLocaleLowerCase();
}

function buildSafeVocabularyEntries() {
  const entries = [];
  for (const group of SAFE_SPINTAX_VOCABULARY) {
    for (const row of (group.variants || [])) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const rawVariants = Array.isArray(row[1])
        ? [row[0], ...row[1]]
        : row;
      const variants = rawVariants
        .map(v => String(v ?? '').trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.findIndex(x => autoSpinLower(x) === autoSpinLower(v)) === i);
      if (variants.length < 2) continue;
      // Every approved phrase is itself an exact whitelist entry. This means
      // `{high quality|great quality|top quality}` can be recognized whether
      // the source contains `high quality`, `great quality`, or `top quality`.
      for (const term of variants) {
        entries.push({
          category: group.category,
          term,
          alternatives: variants.filter(v => autoSpinLower(v) !== autoSpinLower(term))
        });
      }
    }
  }
  return entries.sort((a, b) => b.term.length - a.term.length);
}

const SAFE_SPINTAX_ENTRIES = buildSafeVocabularyEntries();

function autoSpinProtectSpans(source, protectedWords = []) {
  let text = String(source ?? '');
  const tokens = [];
  const tokenFor = value => `\uE000FBMP${tokens.length}\uE001`;
  const shield = (value) => {
    const token = tokenFor(value);
    tokens.push(String(value));
    return token;
  };

  // First shield caller-supplied names (Page/Group/Brand/Product/etc.). Longer
  // names are protected first so a shorter name cannot match inside them.
  const words = [...new Set((Array.isArray(protectedWords) ? protectedWords : [])
    .map(v => String(v ?? '').trim()).filter(v => v.length >= 2))]
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${autoSpinEscapeRegExp(word)}(?![\\p{L}\\p{N}_])`, 'giu');
    text = text.replace(re, m => shield(m));
  }
  for (const pattern of PROTECTED_PATTERNS) text = text.replace(pattern, m => shield(m));
  return {
    text,
    restore(value) {
      return String(value ?? '').replace(/\uE000FBMP(\d+)\uE001/g, (_, i) => tokens[Number(i)] ?? '');
    }
  };
}

function autoSpinMatchStart(text, term, from = 0) {
  const escaped = autoSpinEscapeRegExp(term);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
  re.lastIndex = Math.max(0, from);
  let match;
  while ((match = re.exec(text))) {
    const at = match.index;
    let depth = 0;
    let inside = false;
    // Existing generated `{...|...}` blocks are immutable for this pass.
    // This prevents a later, shorter whitelist entry from recursively
    // rewriting the alternatives that were just generated.
    for (let i = 0; i < at; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && depth > 0) depth--;
    }
    inside = depth > 0;
    if (!inside) return at;
    re.lastIndex = at + Math.max(1, match[0].length);
  }
  return -1;
}

function autoSpinReplaceFirst(source, term, alternatives) {
  const start = autoSpinMatchStart(source, term, 0);
  if (start < 0) return { source, changed: false };
  const original = source.slice(start, start + term.length);
  const options = [original, ...alternatives.map(a => autoSpinPreserveCase(original, a))]
    .filter((value, index, arr) => arr.findIndex(x => autoSpinLower(x) === autoSpinLower(value)) === index);
  if (options.length < 2) return { source, changed: false };
  return {
    source: source.slice(0, start) + `{${options.join('|')}}` + source.slice(start + term.length),
    changed: true
  };
}

function spintaxAutoSpin(text, maxTerms = 10, options = {}) {
  const source = String(text ?? '');
  if (!source.trim() || spintaxHasChoiceSyntax(source)) {
    return { source, changed: false, replacements: [], autoSpun: false, protectedCount: 0 };
  }

  const limit = Math.max(1, Number(maxTerms) || 10);
  const protectedLayer = autoSpinProtectSpans(source, options?.protectedWords || []);
  let output = protectedLayer.text;
  const replacements = [];
  const usedTerms = new Set();

  // Longest-match-first prevents `great` from winning before `great quality`.
  // Only one occurrence per whitelisted entry is changed, keeping variation
  // density conservative and avoiding mechanical rewriting of repeated words.
  for (const entry of SAFE_SPINTAX_ENTRIES) {
    if (replacements.length >= limit) break;
    if (usedTerms.has(autoSpinLower(entry.term))) continue;
    const result = autoSpinReplaceFirst(output, entry.term, entry.alternatives);
    if (!result.changed) continue;
    output = result.source;
    usedTerms.add(autoSpinLower(entry.term));
    replacements.push(entry.term);
  }

  const restored = protectedLayer.restore(output);
  const changed = restored !== source;
  return {
    source: changed ? restored : source,
    changed,
    replacements,
    autoSpun: changed,
    protectedCount: (source.length - protectedLayer.text.length) > 0 ? 1 : 0
  };
}

function spintaxExpandLimitedChanges(nodes, maxChanges, out = [{ text: '', changes: 0 }], limit = 5000) {
  let current = out.slice();
  for (const node of nodes) {
    if (node.type === 'text') {
      current = current.map(item => ({ text: item.text + node.value, changes: item.changes }));
      continue;
    }
    const next = [];
    for (const item of current) {
      const options = node.options || [];
      for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
        const changeDelta = optionIndex === 0 ? 0 : 1;
        const changes = item.changes + changeDelta;
        if (changes > maxChanges) continue;
        const suffixes = spintaxExpandLimitedChanges(options[optionIndex], maxChanges - changes, [{ text: '', changes: 0 }], limit);
        for (const suffix of suffixes) {
          next.push({ text: item.text + suffix.text, changes: changes + suffix.changes });
          if (next.length >= limit) break;
        }
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    current = next;
  }
  return current.slice(0, Math.max(1, limit));
}

function spintaxCreatePlanner(text, count = 1, options = {}) {
  const source = String(text ?? '');
  const parsed = spintaxParse(source);
  const requested = Math.max(1, Number(count) || 1);
  const limitedChanges = Number.isFinite(Number(options?.maxChanges))
    ? Math.max(1, Math.floor(Number(options.maxChanges)))
    : null;
  const excludeOriginal = options?.excludeOriginal !== false;
  const combinationCount = spintaxCountNodes(parsed.nodes);
  const exactPoolLimit = Math.min(Math.max(requested * 2, 1), 5000);
  let pool = [];

  if (limitedChanges !== null) {
    // Auto-Spin mode: preserve the original text as option #1 for every
    // generated choice and change only a small number of terms per post.
    // We deliberately exclude the all-original version so selected groups
    // receive actual variations whenever enough combinations exist.
    const entries = spintaxExpandLimitedChanges(parsed.nodes, limitedChanges, [{ text: '', changes: 0 }], 5000);
    pool = [...new Set(entries
      .filter(item => excludeOriginal ? (item.changes >= 1 && item.changes <= limitedChanges) : (item.changes >= 0 && item.changes <= limitedChanges))
      .map(item => spintaxNormalizeOutput(item.text)))];
    pool = spintaxShuffle(pool);
  } else if (combinationCount <= exactPoolLimit) {
    pool = spintaxExpandNodes(parsed.nodes, Math.max(1, combinationCount));
    pool = [...new Set(pool.map(spintaxNormalizeOutput))];
    pool = spintaxShuffle(pool);
  } else {
    const seen = new Set();
    const maxAttempts = Math.max(200, requested * 80);
    for (let i = 0; i < maxAttempts && seen.size < requested; i++) {
      seen.add(spintaxNormalizeOutput(spintaxResolveNodes(parsed.nodes)));
    }
    pool = [...seen];
  }

  let cursor = 0;
  const assigned = new Map();
  const used = new Set();
  const fallback = () => {
    if (limitedChanges !== null) {
      const entries = spintaxExpandLimitedChanges(parsed.nodes, limitedChanges, [{ text: '', changes: 0 }], 5000)
        .filter(item => excludeOriginal ? (item.changes >= 1 && item.changes <= limitedChanges) : (item.changes >= 0 && item.changes <= limitedChanges))
        .map(item => spintaxNormalizeOutput(item.text));
      for (const value of spintaxShuffle([...new Set(entries)])) {
        if (!used.has(value)) { used.add(value); return value; }
      }
    }
    return spintaxNormalizeOutput(spintaxResolveNodes(parsed.nodes));
  };
  const pickFresh = () => {
    while (cursor < pool.length) {
      const value = pool[cursor++];
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
    return fallback();
  };

  return {
    source,
    hasSpintax: spintaxHasChoiceSyntax(source),
    combinationCount,
    uniqueAvailable: pool.length,
    enoughUnique: pool.length >= requested,
    maxChanges: limitedChanges,
    excludeOriginal,
    next(key = '') {
      const id = String(key ?? '');
      if (assigned.has(id)) return assigned.get(id);
      const value = pickFresh();
      assigned.set(id, value);
      return value;
    }
  };
}

function spintaxCreateAutoPlanner(text, count = 1) {
  const requested = Math.max(1, Number(count) || 1);
  // Keep variations close to the original. Prefer two wording changes, then
  // three, then four only when more unique group versions are genuinely needed.
  // The caller must never block the Post button merely because the finite pool
  // is smaller than the selected group count.
  const limits = [2, 3, 4];
  let best = null;
  for (const maxChanges of limits) {
    const planner = spintaxCreatePlanner(text, requested, { maxChanges, excludeOriginal: true });
    if (!best || planner.uniqueAvailable > best.uniqueAvailable) best = planner;
    if (requested <= 1 || planner.uniqueAvailable >= requested) return planner;
  }
  return best || spintaxCreatePlanner(text, requested, { maxChanges: 2, excludeOriginal: true });
}

function validateSpintax(text) {
  try {
    const parsed = spintaxParse(text);
    return { valid: true, hasSpintax: spintaxHasChoiceSyntax(text), combinations: spintaxCountNodes(parsed.nodes) };
  } catch (error) {
    return { valid: false, hasSpintax: false, combinations: 0, error: error?.message || String(error) };
  }
}

export { spintaxParse, spintaxResolve, spintaxCreatePlanner, spintaxCreateAutoPlanner, validateSpintax, spintaxHasChoiceSyntax, spintaxAutoSpin };
