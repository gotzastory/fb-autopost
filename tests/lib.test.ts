import { describe, expect, it } from 'vitest';
import { cleanName, cleanPages, groupsToCsv, hasDisplayName, isFacebookAssetUrl, isManualGroupUrl, normalizeGroups } from '../src/lib/groups';
import { limitMedia, mergeFiles } from '../src/lib/composer-media';
import { applyProgress, emptyProgress, summarize } from '../src/lib/progress';
import { spintaxAutoSpin, spintaxCreatePlanner, spintaxResolve, validateSpintax } from '../src/lib/spintax';

const file = (name: string, type: string) => new File(['x'], name, { type, lastModified: 1 });

describe('groups', () => {
  it('strips activity suffixes from names', () => {
    expect(cleanName('  Cats   of Bangkok  last active 3 hours ago')).toBe('Cats of Bangkok');
    expect(cleanName('Dogs 12 new posts')).toBe('Dogs');
  });
  it('rejects Facebook UI labels and numeric ids as display names', () => {
    expect(hasDisplayName({ id: '1', name: 'See all', url: '' })).toBe(false);
    expect(hasDisplayName({ id: '123', name: '123', url: '' })).toBe(false);
    expect(hasDisplayName({ id: '123', name: 'Thai Cooks', url: '' })).toBe(true);
  });
  it('dedupes by id, drops unsafe ids, and builds the url', () => {
    const out = normalizeGroups([{ id: '1', name: 'A' }, { groupId: '1', name: 'B' }, { id: 'x/../y', name: 'bad' }]);
    expect(out).toEqual([{ id: '1', groupId: '1', name: 'B', url: 'https://www.facebook.com/groups/1/' }]);
  });
  it('accepts only Facebook group URLs', () => {
    expect(isManualGroupUrl('https://www.facebook.com/groups/abc.def/')).toBe(true);
    expect(isManualGroupUrl('https://evil.example/groups/abc')).toBe(false);
    expect(isManualGroupUrl('https://facebook.com.evil.example/groups/abc')).toBe(false);
  });
  it('allows image downloads only from Facebook hosts over https', () => {
    expect(isFacebookAssetUrl('https://scontent.fbkk1-1.fna.fbcdn.net/v/a.jpg?x=1')).toBe(true);
    expect(isFacebookAssetUrl('https://lookaside.fbsbx.com/a.jpg')).toBe(true);
    expect(isFacebookAssetUrl('https://www.facebook.com/a.jpg')).toBe(true);
    expect(isFacebookAssetUrl('http://scontent.fbcdn.net/a.jpg')).toBe(false);
    expect(isFacebookAssetUrl('https://evil.example/a.jpg')).toBe(false);
    expect(isFacebookAssetUrl('https://fbcdn.net.evil.example/a.jpg')).toBe(false);
    expect(isFacebookAssetUrl('https://evilfbcdn.net/a.jpg')).toBe(false);
    expect(isFacebookAssetUrl('https://fbcdn.net@evil.example/a.jpg')).toBe(false);
    expect(isFacebookAssetUrl('not a url')).toBe(false);
  });
  it('filters scraped UI labels out of the Page list', () => {
    const pages = cleanPages([{ name: 'My Shop 3 notifications' }, { name: 'Create post' }, { name: 'Chat history is missing' }]);
    expect(pages.map((p) => p.name)).toEqual(['My Shop']);
  });
  it('quotes CSV cells', () => {
    expect(groupsToCsv([{ id: '1', name: 'a"b', url: 'u' }])).toContain('"a""b"');
  });
});

describe('media limits', () => {
  it('keeps 5 photos at most', () => {
    const r = limitMedia(Array.from({ length: 7 }, (_, i) => file(`${i}.png`, 'image/png')));
    expect(r.files).toHaveLength(5);
    expect(r.trimmed).toBe(true);
  });
  it('keeps 1 video + 3 photos in selection order', () => {
    const input = [file('a.png', 'image/png'), file('v1.mp4', 'video/mp4'), file('v2.mp4', 'video/mp4'), file('b.png', 'image/png'), file('c.png', 'image/png'), file('d.png', 'image/png')];
    expect(limitMedia(input).files.map((f) => f.name)).toEqual(['a.png', 'v1.mp4', 'b.png', 'c.png']);
  });
  it('ignores non-media files', () => {
    expect(limitMedia([file('a.pdf', 'application/pdf')]).files).toEqual([]);
  });
  it('does not add the same file twice', () => {
    const a = file('a.png', 'image/png');
    expect(mergeFiles([a], [file('a.png', 'image/png'), file('b.png', 'image/png')]).map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });
});

describe('progress', () => {
  const names = (id: string) => ({ '1': 'One', '2': 'Two' })[id];
  const msg = (stage: string, extra = {}) => ({ type: 'REAL_POST_PROGRESS' as const, stage, ...extra });

  it('tracks one row per group through its stages', () => {
    let s = applyProgress(emptyProgress(2), msg('opening', { index: 1, total: 2, groupId: '1' }), names).state;
    s = applyProgress(s, msg('publishing', { index: 1, total: 2, groupId: '1' }), names).state;
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ name: 'One', status: 'Publishing' });
  });
  it('links a confirmed post but never a non-Facebook url', () => {
    const ok = applyProgress(emptyProgress(1), msg('result', { index: 1, groupId: '1', result: { success: true, postUrl: 'https://www.facebook.com/groups/1/posts/9' } }), names).state;
    expect(ok.rows[0]!.href).toBe('https://www.facebook.com/groups/1/posts/9');
    const bad = applyProgress(emptyProgress(1), msg('result', { index: 1, groupId: '1', result: { success: true, postUrl: 'https://evil.example/x' } }), names).state;
    expect(bad.rows[0]!.href).toBe('');
    expect(bad.logs[0]!.url).toBe('');
  });
  it('sends admin-approval posts to the pending page', () => {
    const s = applyProgress(emptyProgress(1), msg('result', { index: 1, groupId: '1', result: { success: true, warningCode: 'POST_REQUIRES_ADMIN_APPROVAL' } }), names).state;
    expect(s.rows[0]!.status).toBe('Pending');
    expect(s.rows[0]!.href).toBe('https://www.facebook.com/groups/1/my_pending_content');
  });
  it('reports published only when every group succeeded', () => {
    const all = applyProgress(emptyProgress(2), msg('complete', { total: 2, results: [{ groupId: '1', success: true }, { groupId: '2', success: true }] }), names);
    expect(all.finished).toEqual({ stopped: false, published: true });
    expect(summarize(all.state)).toMatchObject({ success: 2, percent: 100 });
    const mixed = applyProgress(emptyProgress(2), msg('complete', { total: 2, results: [{ groupId: '1', success: true }, { groupId: '2', success: false, error: 'x' }] }), names);
    expect(mixed.finished?.published).toBe(false);
  });
  it('marks unfinished rows as stopped when the job is stopped', () => {
    const started = applyProgress(emptyProgress(1), msg('publishing', { index: 1, groupId: '1' }), names).state;
    const out = applyProgress(started, msg('complete', { total: 1, stopped: true, results: [] }), names);
    expect(out.state.rows[0]).toMatchObject({ status: 'STOP' });
    expect(out.finished).toEqual({ stopped: true, published: false });
  });
  it('surfaces an engine crash that has no per-group results', () => {
    const out = applyProgress(emptyProgress(2), msg('complete', { total: 2, failCount: 2, message: 'Posting engine error: boom' }), names);
    expect(out.notice).toBe('Posting engine error: boom');
    expect(out.finished?.published).toBe(false);
  });
});

describe('spintax', () => {
  it('validates syntax', () => {
    expect(validateSpintax('{a|b} c')).toMatchObject({ valid: true, hasSpintax: true, combinations: 2 });
    expect(validateSpintax('{a|b').valid).toBe(false);
    expect(validateSpintax('plain').hasSpintax).toBe(false);
  });
  it('resolves nested choices', () => {
    expect(spintaxResolve('{Hi {there|all}|Hello}', () => 0)).toBe('Hi there');
  });
  it('plans a different variation for each group', () => {
    const planner = spintaxCreatePlanner('{a|b|c}', 3, { excludeOriginal: false });
    expect(planner.uniqueAvailable).toBe(3);
    expect(new Set([planner.next('1'), planner.next('2'), planner.next('3')]).size).toBe(3);
  });
  it('auto-spin leaves links untouched', () => {
    const url = 'https://example.com/hello';
    expect(spintaxAutoSpin(`Hello everyone ${url}`, 20).source).toContain(url);
  });
});
