// Facebook automation engine: listeners. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import { state } from './state';
import { addManualGroup } from './groups';
import { switchFacebookIdentity } from './identity';
import {
  deletePostingMedia,
  getPostingMedia,
  getPostingMediaChunk,
  savePostingMedia,
  streamMediaBytes,
  streamMediaInfo,
} from './media';
import { syncManagedFacebookPages } from './pages';
import { closeRealPostingWindows, startRealPosting } from './posting';
import {
  enforceAccountBinding,
  getProfile,
  isValidFacebookUserId,
  runInstallProfileChecking,
} from './profile';
import {
  attachSyncLifeline,
  cancelActiveSync,
  loadGroupsForCurrentIdentity,
  pauseActiveCover,
  pauseActiveSync,
  resumeActiveCover,
  resumeActiveSync,
  syncGroupCoversOnly,
  syncGroups,
} from './sync';

// Every chrome.* listener lives here so they register synchronously at worker start.
export function registerListeners() {
  try {
    chrome.cookies.onChanged.addListener(async (info) => {
      try {
        if (info?.cookie?.name !== 'c_user') return;
        if (!/(^|\.)facebook\.com$/i.test(String(info?.cookie?.domain || '').replace(/^\./, ''))) return;
        await enforceAccountBinding();
      } catch {}
    });
  } catch {}

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo?.status !== 'loading') return;
    const job = state.realPostJob;
    if (!job?.running || job.stopped || job.suppressPopupLifecycle) return;
    if (Number(job.postingTabId) === Number(tabId) && !job.postingNavigationExpected) {
      job.stopped = true;
      closeRealPostingWindows(job).catch(() => {});
      chrome.runtime
        .sendMessage({
          type: 'REAL_POST_PROGRESS',
          jobId: job.jobId,
          stage: 'post-stop',
          index: 0,
          total: 0,
          groupId: '',
          groupName: '',
          message: 'Facebook posting popup was reloaded. Posting stopped and the popup was closed.',
        })
        .catch(() => {});
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    const job = state.realPostJob;
    if (!job?.running || job.stopped || job.suppressPopupLifecycle) return;
    if (Number(job.postingTabId) === Number(tabId)) {
      job.stopped = true;
      chrome.runtime
        .sendMessage({
          type: 'REAL_POST_PROGRESS',
          jobId: job.jobId,
          stage: 'post-stop',
          index: 0,
          total: 0,
          groupId: '',
          groupName: '',
          message: 'Facebook posting popup was closed. Posting stopped.',
        })
        .catch(() => {});
    }
  });

  setInterval(() => {}, 2e3);

  chrome.runtime.onInstalled.addListener((details) => {
    if (details?.reason === 'install') runInstallProfileChecking('install').catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    runInstallProfileChecking('startup').catch(() => {});
  });

  chrome.runtime.onConnect.addListener((port) => {
    attachSyncLifeline(port);
    if (port.name === 'FBMP_MEDIA_STREAM_V1') {
      port.onMessage.addListener(async (m) => {
        try {
          if (m?.type === 'MEDIA_INFO') {
            port.postMessage({
              type: 'MEDIA_INFO_RESULT',
              requestId: m.requestId,
              info: await streamMediaInfo(m.mediaId),
            });
            return;
          }
          if (m?.type === 'MEDIA_CHUNK') {
            const buffer = await streamMediaBytes(m.mediaId, m.start, m.end);
            port.postMessage({
              type: 'MEDIA_CHUNK_RESULT',
              requestId: m.requestId,
              mediaId: String(m.mediaId || ''),
              start: Number(m.start) || 0,
              end: Number(m.end) || 0,
              buffer: buffer,
            });
            return;
          }
        } catch (e) {
          port.postMessage({
            type: 'MEDIA_STREAM_ERROR',
            requestId: m?.requestId,
            error: e?.message || String(e),
          });
        }
      });
    }
  });

  chrome.runtime.onMessage.addListener((m, _, send) => {
    if (m?.action === 'POSTING_STATUS_CHANGED') {
      const st = m.status || {};
      if (state.realPostJob && st.groupId) {
        try {
          state.realPostJob.statusByGroup?.set?.(String(st.groupId), {
            ...st,
          });
        } catch {}
      }
      if (state.realPostJob && st.accountRestricted === true) {
        state.realPostJob.stopped = true;
        closeRealPostingWindows(state.realPostJob).catch(() => {});
        chrome.runtime
          .sendMessage({
            type: 'REAL_POST_PROGRESS',
            jobId: state.realPostJob.jobId,
            stage: 'account-stop',
            index: 0,
            total: 0,
            groupId: st.groupId || '',
            groupName: st.groupName || '',
            message: 'Facebook reported an account-level posting restriction. Posting stopped.',
          })
          .catch(() => {});
      }
      const stage = String(st.stage || '').toUpperCase();
      const map = {
        INITIALIZING: 'opening',
        FETCHING_MEDIA: 'media',
        OPENING_COMPOSER: 'composer',
        ATTACHING_MEDIA: 'media',
        INJECTING_TEXT: 'input',
        READY_TO_SUBMIT: 'ready',
        SUBMITTED: 'publishing',
        COMPLETED: 'engine-complete',
        FAILED: 'error',
      };
      const label = {
        INITIALIZING: 'Starting Facebook action…',
        FETCHING_MEDIA: 'Loading selected media…',
        OPENING_COMPOSER: 'Opening Facebook composer…',
        ATTACHING_MEDIA: 'Uploading photo/video…',
        INJECTING_TEXT: 'Writing post content…',
        READY_TO_SUBMIT: 'Post is ready to publish…',
        SUBMITTED: 'Publishing to Facebook…',
        COMPLETED: 'Facebook submission result resolved.',
        FAILED: 'Facebook reported an error.',
      };
      chrome.runtime
        .sendMessage({
          type: 'REAL_POST_PROGRESS',
          jobId: st.taskId,
          stage: map[stage] || 'engine',
          index: 0,
          total: 0,
          groupId: st.groupId,
          groupName: st.groupName || '',
          message: label[stage] || `Facebook: ${stage || 'working'}…`,
          engineStatus: st,
        })
        .catch(() => {});
      return false;
    }
    if (m?.type === 'SAVE_POST_MEDIA') {
      savePostingMedia(m.files || [])
        .then((ids) =>
          send({
            success: true,
            mediaIds: ids,
          }),
        )
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'GET_POST_MEDIA') {
      getPostingMedia(m.mediaIds || [])
        .then((files) =>
          send({
            files: files,
          }),
        )
        .catch((e) =>
          send({
            files: [],
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'DELETE_POST_MEDIA') {
      deletePostingMedia(m.mediaIds || [])
        .then(() =>
          send({
            success: true,
          }),
        )
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'SYNC_PAGES') {
      // Deduplicate rapid refresh clicks / duplicate dashboard messages.
      // Only one Page-sync worker tab may exist for a sync session.
      if (state.FB_MANAGED_PAGE_SYNC_PROMISE) {
        state.FB_MANAGED_PAGE_SYNC_PROMISE.then(send).catch((e) =>
          send({
            success: false,
            error: e?.message || String(e),
          }),
        );
        return true;
      }
      state.FB_MANAGED_PAGE_SYNC_PROMISE = syncManagedFacebookPages(_?.tab?.id || null).catch((e) => ({
        success: false,
        error: e?.message || String(e),
        pages: [],
      }));
      state.FB_MANAGED_PAGE_SYNC_PROMISE.then(send).catch(() => {});
      state.FB_MANAGED_PAGE_SYNC_PROMISE.finally(() => {
        state.FB_MANAGED_PAGE_SYNC_PROMISE = null;
      });
      return true;
    }
    if (m?.type === 'SWITCH_FACEBOOK_IDENTITY') {
      switchFacebookIdentity(m.identity || {})
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e?.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'START_REAL_POSTING') {
      startRealPosting(m, send)
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'PAUSE_REAL_POSTING') {
      if (state.realPostJob) {
        state.realPostJob.paused = true;
        closeRealPostingWindows(state.realPostJob).catch(() => {});
      }
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'RESUME_REAL_POSTING') {
      if (state.realPostJob) state.realPostJob.paused = false;
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'REAL_POSTING_HEARTBEAT') {
      if (state.realPostJob && (!m.jobId || m.jobId === state.realPostJob.jobId))
        state.realPostJob.lastHeartbeat = Date.now();
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'STOP_REAL_POSTING') {
      if (state.realPostJob) {
        state.realPostJob.stopped = true;
        closeRealPostingWindows(state.realPostJob).catch(() => {});
      }
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'PAUSE_COVER_SYNC') {
      pauseActiveCover()
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'RESUME_COVER_SYNC') {
      resumeActiveCover()
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'PAUSE_GROUP_SYNC') {
      pauseActiveSync()
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'RESUME_GROUP_SYNC') {
      resumeActiveSync()
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'STOP_GROUP_SYNC') {
      cancelActiveSync(m.reason || 'Group sync stopped.').catch(() => {});
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'STOP_ALL_ACTIVITY') {
      if (state.realPostJob) {
        state.realPostJob.stopped = true;
        closeRealPostingWindows(state.realPostJob).catch(() => {});
      }
      cancelActiveSync(m.reason || 'Activity stopped because the dashboard was reloaded or closed.').catch(
        () => {},
      );
      send({
        success: true,
      });
      return false;
    }
    if (m?.type === 'GET_REAL_POSTING_STATUS') {
      send({
        success: true,
        job: state.realPostJob
          ? {
              jobId: state.realPostJob.jobId,
              running: state.realPostJob.running,
              paused: state.realPostJob.paused,
              stopped: state.realPostJob.stopped,
            }
          : null,
      });
      return false;
    }
    if (m?.type === 'GET_MEDIA_FILE_CHUNK') {
      getPostingMediaChunk(m.mediaId, m.start, m.end)
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'GET_MEDIA_FILES') {
      getPostingMedia(m.mediaIds || [])
        .then((files) =>
          send({
            files: files,
          }),
        )
        .catch((e) =>
          send({
            files: [],
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'DELETE_MEDIA') {
      deletePostingMedia(m.mediaIds || [])
        .then(() =>
          send({
            success: true,
          }),
        )
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'GET_PROFILE') {
      getProfile()
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message,
          }),
        );
      return true;
    }
    if (m?.type === 'CHECK_LOGIN') {
      getProfile()
        .then((d) =>
          send({
            success: true,
            isLoggedIn: isValidFacebookUserId(d.profile?.id),
            userId: isValidFacebookUserId(d.profile?.id) ? d.profile.id : null,
          }),
        )
        .catch((e) =>
          send({
            success: false,
            error: e.message,
          }),
        );
      return true;
    }
    if (m?.type === 'SYNC_GROUPS') {
      syncGroups(_?.tab?.id || null)
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'SYNC_GROUP_COVERS') {
      syncGroupCoversOnly(m.selectedIds || m.groupIds || [])
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'ADD_MANUAL_GROUP') {
      addManualGroup(m.url)
        .then(send)
        .catch((e) =>
          send({
            success: false,
            error: e.message || String(e),
          }),
        );
      return true;
    }
    if (m?.type === 'LOAD_IDENTITY_GROUPS') {
      loadGroupsForCurrentIdentity()
        .then(send)
        .catch((e) => send({ success: false, error: e?.message || String(e) }));
      return true;
    }
    if (m?.type === 'GET_GROUPS') {
      chrome.storage.local.get('fb_groups_list').then((x) =>
        send({
          success: true,
          groups: x.fb_groups_list?.groups || [],
        }),
      );
      return true;
    }
    send({
      success: false,
      error: 'Unknown: ' + m?.type,
    });
    return false;
  });
}
