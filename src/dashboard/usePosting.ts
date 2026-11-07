import { useCallback, useEffect, useRef, useState } from 'react';
import { addLog, applyProgress, emptyProgress, type ProgressMessage, type ProgressState } from '@/lib/progress';
import { spintaxAutoSpin, spintaxCreateAutoPlanner, spintaxCreatePlanner, validateSpintax } from '@/lib/spintax';
import { errorText, send, type Group, type Identity } from '@/lib/types';

export interface PostRequest {
  groups: Group[];
  message: string;
  spintax: boolean;
  background: string;
  saveMedia: () => Promise<string[]>;
  mediaCount: number;
  identity: Identity;
}

/** Reports what spintax will do. Returns null when the text is invalid and posting must not start. */
function describeSpintax(message: string, groupCount: number): { notice: string; warning: boolean } | null {
  const v = validateSpintax(message);
  if (!v.valid) return null;
  const plural = (n: number) => `${n} unique variation${n === 1 ? '' : 's'}`;
  if (v.hasSpintax) {
    const { uniqueAvailable: n } = spintaxCreatePlanner(message, groupCount, { excludeOriginal: false });
    return groupCount > 1 && n < groupCount
      ? { notice: `Spintax enabled · ${plural(n)} available. Extra groups will reuse a variation.`, warning: true }
      : { notice: `Spintax enabled · ${plural(n)} available · each group will receive a different version.`, warning: false };
  }
  const auto = spintaxAutoSpin(message, 20);
  if (!auto.changed) return { notice: 'Spintax enabled · no safe wording variation was found, so the original text will be used.', warning: groupCount > 1 };
  const { uniqueAvailable: n } = spintaxCreateAutoPlanner(auto.source, groupCount);
  return groupCount > 1 && n < groupCount
    ? { notice: `Spintax enabled · Auto-Spin found ${auto.replacements.length} safe wording points · ${plural(n)}. Extra groups will reuse variations.`, warning: true }
    : { notice: `Spintax enabled · Auto-Spin found ${auto.replacements.length} safe wording points · ${plural(n)} available.`, warning: false };
}

export function usePosting(notify: (s: string) => void, groups: Group[], onAllPublished: () => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress());
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const onAllPublishedRef = useRef(onAllPublished);
  onAllPublishedRef.current = onAllPublished;

  const log = useCallback((...args: Parameters<typeof addLog> extends [unknown, ...infer R] ? R : never) => {
    setProgress((p) => addLog(p, ...args));
  }, []);

  const start = useCallback(
    async (req: PostRequest) => {
      if (!req.groups.length) return notify('Select at least one group first.');
      if (!req.message.trim() && !req.mediaCount) return notify('Add text or a photo/video first.');
      let spin: ReturnType<typeof describeSpintax> = null;
      if (req.spintax) {
        spin = describeSpintax(req.message, req.groups.length);
        if (!spin) return notify(`Invalid Spintax: ${validateSpintax(req.message).error}`);
      }
      let mediaIds: string[];
      try {
        mediaIds = await req.saveMedia();
      } catch (e) {
        return notify(`Could not save selected photo/video: ${errorText(e)}`);
      }
      let next = emptyProgress(req.groups.length);
      next = addLog(next, '', `Preparing a real post for ${req.groups.length} selected group${req.groups.length === 1 ? '' : 's'}…`);
      if (spin) next = addLog(next, spin.warning ? 'warning' : '', spin.notice);
      if (mediaIds.length) next = addLog(next, '', `Photo/video prepared (${mediaIds.length} file${mediaIds.length === 1 ? '' : 's'})`);
      setProgress(next);
      setVisible(true);
      setPaused(false);
      setJobId('starting');
      notify(spin?.notice ?? 'Starting the Facebook posting engine…');
      try {
        const reply = await send({
          type: 'START_REAL_POSTING',
          dashboardSessionId: crypto.randomUUID(),
          groups: req.groups.map((g) => ({ id: g.id, name: g.name, url: g.url })),
          message: req.message,
          shuffleText: req.spintax,
          background: req.spintax ? '' : req.background,
          mediaIds,
          identity: req.identity,
        });
        if (!reply?.success || !reply.jobId) throw new Error(reply?.error || 'Could not start the Facebook posting engine.');
        setJobId(reply.jobId);
        log('', `Posting engine started — Job ${reply.jobId.slice(0, 8)}`);
      } catch (e) {
        setJobId(null);
        notify(`Posting error: ${errorText(e)}`);
        log('error', `❌ ${errorText(e)}`, 'error');
      }
    },
    [log, notify],
  );

  const togglePause = useCallback(async () => {
    const nowPaused = !paused;
    setPaused(nowPaused);
    await send({ type: nowPaused ? 'PAUSE_REAL_POSTING' : 'RESUME_REAL_POSTING' }).catch(() => {});
    notify(nowPaused ? 'Posting paused. Current Facebook action will finish safely.' : 'Posting resumed…');
    log('', nowPaused ? 'Posting paused by user' : 'Posting resumed by user');
  }, [log, notify, paused]);

  const stop = useCallback(() => {
    void send({ type: 'STOP_REAL_POSTING' }).catch(() => {});
    setPaused(false);
    log('complete', 'Stop requested by user. Stopping Facebook and sync activity…', 'error');
    notify('Stopping all activity safely…');
  }, [log, notify]);

  // The engine stops a job when its heartbeat goes quiet.
  useEffect(() => {
    if (!jobId || jobId === 'starting') return;
    const timer = setInterval(() => void send({ type: 'REAL_POSTING_HEARTBEAT', jobId }).catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [jobId]);

  useEffect(() => {
    const onMessage = (m: ProgressMessage) => {
      if (m?.type !== 'REAL_POST_PROGRESS') return;
      const nameOf = (id: string) => groupsRef.current.find((g) => g.id === id)?.name;
      setProgress((current) => {
        const outcome = applyProgress(current, m, nameOf);
        // Runs after the state update, so a progress message never re-enters this updater.
        queueMicrotask(() => {
          if (outcome.notice) notify(outcome.notice);
          if (outcome.finished) {
            setJobId(null);
            setPaused(false);
            if (outcome.finished.published) onAllPublishedRef.current();
          }
        });
        return outcome.state;
      });
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [notify]);

  return { running: !!jobId, paused, visible, progress, start, togglePause, stop };
}
