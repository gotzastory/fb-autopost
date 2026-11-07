// Turns the engine's REAL_POST_PROGRESS messages into what the Activity log shows.

export type LogState = 'info' | 'working' | 'success' | 'pending' | 'error' | 'stop';

export interface ProgressRow {
  index: number;
  id: string;
  name: string;
  status: string;
  href: string;
  label: string;
}

export interface ProgressLog {
  key: number;
  kind: string;
  text: string;
  state: LogState;
  url: string;
}

export interface ProgressState {
  rows: ProgressRow[];
  logs: ProgressLog[];
  total: number;
}

export interface PostResult {
  groupId?: string;
  groupName?: string;
  success?: boolean;
  pending?: boolean;
  skipped?: boolean;
  warningCode?: string;
  error?: string;
  postUrl?: string;
  pendingPostUrl?: string;
  mediaHasVideo?: boolean;
}

export interface ProgressMessage {
  type: 'REAL_POST_PROGRESS';
  stage: string;
  index?: number;
  total?: number;
  groupId?: string;
  groupName?: string;
  message?: string;
  stopped?: boolean;
  result?: PostResult;
  results?: PostResult[];
  engineStatus?: { mediaUploadProgress?: number };
  successCount?: number;
  pendingCount?: number;
  failCount?: number;
  skippedCount?: number;
}

export interface ProgressOutcome {
  state: ProgressState;
  notice?: string;
  /** Set when the job has ended. `published` means every group got a confirmed post. */
  finished?: { stopped: boolean; published: boolean };
}

export const emptyProgress = (total = 0): ProgressState => ({ rows: [], logs: [], total });

let logKey = 0;

export function addLog(s: ProgressState, kind: string, text: string, state: LogState = 'info', url = ''): ProgressState {
  return { ...s, logs: [...s.logs, { key: ++logKey, kind, text, state, url: isFacebookUrl(url) ? url : '' }] };
}

/** Links shown in the log come from Facebook responses, so only Facebook URLs are made clickable. */
export const isFacebookUrl = (url: string) => /^https:\/\/www\.facebook\.com\//i.test(url);

const isPending = (r?: PostResult) => !!r?.pending || r?.warningCode === 'POST_REQUIRES_ADMIN_APPROVAL';

function setRow(s: ProgressState, m: { index: number; id: string; name: string }, status: string, url = '', noUrlLabel = ''): ProgressState {
  let href = '';
  if ((status === 'Success' || status === 'Pending') && isFacebookUrl(url)) href = url;
  else if (status === 'Pending') href = `https://www.facebook.com/groups/${m.id}/my_pending_content`;
  const row: ProgressRow = { index: m.index, id: m.id, name: m.name, status, href, label: href || noUrlLabel };
  const at = s.rows.findIndex((r) => r.id === m.id);
  const rows = at >= 0 ? s.rows.map((r, i) => (i === at ? { ...row, index: r.index } : r)) : [...s.rows, row];
  return { ...s, rows };
}

function resultStatus(r?: PostResult): 'Pending' | 'Skipped' | 'Success' | 'Failed' {
  if (isPending(r)) return 'Pending';
  if (r?.skipped) return 'Skipped';
  return r?.success ? 'Success' : 'Failed';
}

export function summarize(s: ProgressState) {
  const count = (status: string) => s.rows.filter((r) => r.status === status).length;
  const success = count('Success');
  const pending = count('Pending');
  const failed = count('Failed');
  const skipped = count('Skipped');
  const total = Math.max(s.rows.length, s.total);
  const percent = total ? Math.min(100, Math.round(((success + pending + failed + skipped) / total) * 100)) : 0;
  return { success, pending, failed, skipped, percent };
}

const WORKING_STAGES: Record<string, { status: string; log?: (name: string) => string; state?: LogState }> = {
  opening: { status: 'Opening', log: (n) => `Opening ${n}`, state: 'info' },
  composer: { status: 'Composing', log: (n) => `${n}: opening composer…`, state: 'working' },
  input: { status: 'Writing', log: (n) => `${n}: preparing content…`, state: 'working' },
  media: { status: 'Uploading', log: (n) => `${n}: uploading media…`, state: 'working' },
  ready: { status: 'Ready', log: (n) => `${n}: ready to publish`, state: 'working' },
  publishing: { status: 'Publishing', log: (n) => `${n}: publishing…`, state: 'working' },
  retry: { status: 'Retrying', log: (n) => `Retrying ${n}…`, state: 'info' },
  'engine-complete': { status: 'Confirming' },
};

export function applyProgress(s: ProgressState, m: ProgressMessage, nameOf: (id: string) => string | undefined): ProgressOutcome {
  const id = String(m.groupId ?? '');
  const name = nameOf(id) || m.groupName || id || 'Facebook group';
  const at = { index: Number(m.index) || 1, id, name };
  const total = Number(m.total) || s.total;
  const base = { ...s, total };

  const working = WORKING_STAGES[m.stage];
  if (working) {
    let next = setRow(base, at, working.status);
    if (working.log) next = addLog(next, m.stage === 'opening' ? 'group-start' : '', m.message || working.log(name), working.state);
    return { state: next, notice: m.stage === 'opening' ? `Opening Facebook group ${at.index}/${total}: ${name}…` : undefined };
  }

  switch (m.stage) {
    case 'result': {
      const status = resultStatus(m.result);
      const url = m.result?.postUrl || m.result?.pendingPostUrl || '';
      const label =
        status === 'Skipped'
          ? `Skipped · ${m.result?.error || 'Not eligible for posting'}`
          : status === 'Failed'
            ? m.result?.error || 'Facebook did not confirm submission'
            : m.result?.mediaHasVideo
              ? 'Published · Video processing by Facebook; post URL may appear later'
              : 'Published · Post URL unavailable';
      const icon = { Pending: '⏳', Skipped: '↷', Success: '✓', Failed: '✗' }[status];
      const words = { Pending: 'Your post is pending', Skipped: 'Skipped', Success: 'Published and confirmed', Failed: 'not confirmed' }[status];
      const logState: LogState = status === 'Pending' ? 'pending' : status === 'Skipped' ? 'info' : status === 'Success' ? 'success' : 'error';
      const linked = status === 'Success' || status === 'Pending' ? url : '';
      return { state: addLog(setRow(base, at, status, url, label), 'group-result', m.message || `${icon} ${name}: ${words}`, logState, linked) };
    }
    case 'error':
      return {
        state: addLog(setRow(base, at, 'Failed', '', m.result?.error || m.message || 'Facebook posting failed'), 'group-result', m.message || `✗ ${name}: posting failed`, 'error'),
      };
    case 'delay':
      return { state: addLog(base, '', m.message || 'Waiting before next group…') };
    case 'background':
      return { state: addLog(base, '', `⚠ ${m.message || `${name}: Facebook background not applied`}`, 'pending') };
    case 'account-stop':
    case 'post-stop': {
      const text = m.message || (m.stage === 'account-stop' ? 'Facebook reported an account-level posting restriction. Posting stopped.' : 'Facebook no longer exposes a clickable Post button. Posting stopped.');
      return { state: addLog(base, 'complete', text, 'stop'), notice: text };
    }
    case 'complete': {
      let next = base;
      (m.results ?? []).forEach((r, i) => {
        const gid = String(r.groupId ?? '');
        const status = resultStatus(r);
        const label =
          status === 'Skipped'
            ? `Skipped · ${r.error || 'Not eligible for posting'}`
            : status === 'Failed'
              ? r.error || 'Failed'
              : r.mediaHasVideo
                ? 'Published · Video processing by Facebook; post URL may appear later'
                : 'Published · Post URL unavailable';
        next = setRow(next, { index: i + 1, id: gid, name: nameOf(gid) || r.groupName || gid }, status, r.postUrl || r.pendingPostUrl || '', label);
      });
      if (m.stopped) {
        const settled = ['Success', 'Pending', 'Failed', 'Skipped'];
        next = { ...next, rows: next.rows.map((r) => (settled.includes(r.status) ? r : { ...r, status: 'STOP', label: 'Stopped before finishing' })) };
      }
      const sum = summarize(next);
      // An engine crash reports only counts and a message, with no per-group results.
      const success = m.results?.length ? sum.success : Number(m.successCount) || 0;
      const pending = m.results?.length ? sum.pending : Number(m.pendingCount) || 0;
      const failed = m.results?.length ? sum.failed : Number(m.failCount) || 0;
      const skipped = m.results?.length ? sum.skipped : Number(m.skippedCount) || 0;
      const stopped = !!m.stopped;
      const text = stopped
        ? '⏹ Posting stopped!'
        : m.results?.length || !m.message
          ? `✅ Posting finished — ${success} success, ${pending} pending, ${failed} failed, ${skipped} skipped.`
          : m.message;
      const state: LogState = stopped ? 'stop' : failed ? 'error' : pending ? 'pending' : 'success';
      return {
        state: addLog(next, 'complete', text, state),
        notice: text,
        finished: { stopped, published: !stopped && failed === 0 && pending === 0 && skipped === 0 && success === total && total > 0 },
      };
    }
    default:
      return { state: base };
  }
}
