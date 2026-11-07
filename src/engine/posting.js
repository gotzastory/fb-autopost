// Facebook automation engine: posting. Plain JS on purpose: injected functions are
// serialized by chrome.scripting, so this code must stay free of transpile helpers.
import {
  spintaxAutoSpin,
  spintaxCreateAutoPlanner,
  spintaxCreatePlanner,
  validateSpintax,
} from '../lib/spintax';
import { state } from './state';
import { deletePostingMedia, savePostingMedia } from './media';
import { switchFacebookIdentityInTab } from './pages';
import { getFacebookCookieUserId, isValidFacebookUserId, resetForAccountChange, sleep } from './profile';

export async function waitPostingTabReady(tabId, timeout = 6e4) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    if (tab.status === 'complete') {
      for (let i = 0; i < 24; i++) {
        const ping = await chrome.tabs
          .sendMessage(tabId, {
            action: 'PING_FB_POSTER',
          })
          .catch(() => null);
        if (ping?.status === 'facebook_poster_alive') return true;
        await sleep(100);
      }
    }
    await sleep(200);
  }
  return false;
}

export function postGroupUrl(id) {
  return `https://www.facebook.com/groups/${encodeURIComponent(String(id))}/`;
}

export async function closeRealPostingWindows(job) {
  const ids = [...(job?.windowIds || [])];
  job?.windowIds?.clear?.();
  for (const id of ids) {
    try {
      await chrome.windows.remove(id);
    } catch {}
  }
}

export async function runRealPostingJob({
  jobId: jobId,
  groups: groups,
  message: message,
  background: background = '',
  mediaIds: mediaIds = [],
  preserveMedia: preserveMedia = false,
  shuffleText: shuffleText = false,
  identity: identity = null,
}) {
  const results = [];
  let successCount = 0,
    pendingCount = 0,
    failCount = 0,
    skippedCount = 0;
  const total = groups.length;
  const exactMessage = String(message ?? '');
  const shuffleEnabled = !!shuffleText;
  let shufflePlanner = null;
  if (shuffleEnabled) {
    const validation = validateSpintax(exactMessage);
    if (!validation.valid) throw new Error(`Invalid Spintax: ${validation.error}`);
    const protectedWords = [
      ...new Set(
        [...(Array.isArray(groups) ? groups.map((g) => g?.name) : []), identity?.name]
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length >= 2),
      ),
    ];
    const prepared = validation.hasSpintax
      ? exactMessage
      : spintaxAutoSpin(exactMessage, 20, { protectedWords }).source;
    if (prepared !== exactMessage) {
      const preparedValidation = validateSpintax(prepared);
      if (!preparedValidation.valid) throw new Error(`Invalid Auto-Spin result: ${preparedValidation.error}`);
      shufflePlanner = spintaxCreateAutoPlanner(prepared, total);
    } else if (validation.hasSpintax) {
      shufflePlanner = spintaxCreatePlanner(exactMessage, total, {
        excludeOriginal: false,
      });
    }
    if (shufflePlanner && total > 1 && shufflePlanner.uniqueAvailable < total) {
    }
  }
  const delayMs = 5e3;
  const queueSkipCodes = new Set([
    'GROUP_ARCHIVED',
    'GROUP_TEMPORARILY_PAUSED',
    'GROUP_SUSPENDED_RESTRICTED',
    'GROUP_ADMIN_ONLY',
    'GROUP_POSTING_RESTRICTED',
    'GROUP_PARTICIPATION_REQUIRED',
    'GROUP_BUY_SELL_NO_DISCUSSION',
    'GROUP_NO_CREATE_POST',
    'GROUP_COMPOSER_NOT_OPEN',
    'GROUP_COMPOSER_DISABLED',
    'GROUP_MEDIA_ONLY_COMPOSER',
    'GROUP_POSTING_UNAVAILABLE',
    'GROUP_NO_POST_BUTTON',
    'MEMBERSHIP_REQUEST_PENDING',
    'NOT_MEMBER',
  ]);
  const emit = (payload) =>
    chrome.runtime
      .sendMessage({
        type: 'REAL_POST_PROGRESS',
        jobId: jobId,
        ...payload,
      })
      .catch(() => {});
  let postingWindowId = null;
  let postingTabId = null;
  const ensurePostingPopup = async (groupId, { reload: reload = false } = {}) => {
    const targetUrl = postGroupUrl(groupId);
    let alive = false;
    if (postingWindowId && postingTabId) {
      try {
        const w = await chrome.windows.get(postingWindowId);
        const t = await chrome.tabs.get(postingTabId);
        alive = !!(w?.id === postingWindowId && t?.id === postingTabId);
      } catch {
        alive = false;
      }
    }
    if (!alive) {
      if (state.realPostJob) state.realPostJob.postingNavigationExpected = true;
      const w = await chrome.windows.create({
        url: targetUrl,
        type: 'popup',
        width: 560,
        height: 720,
        left: 120,
        top: 80,
        focused: false,
      });
      postingWindowId = w.id || null;
      postingTabId = w.tabs?.[0]?.id || null;
      if (!postingWindowId || !postingTabId) throw new Error('Facebook posting window did not create a tab');
      if (state.realPostJob) {
        state.realPostJob.postingTabId = postingTabId;
        state.realPostJob.windowIds?.add?.(postingWindowId);
      }
    } else {
      const current = await chrome.tabs.get(postingTabId).catch(() => null);
      const currentUrl = String(current?.url || '');
      if (reload || currentUrl !== targetUrl) {
        if (state.realPostJob) state.realPostJob.postingNavigationExpected = true;
        await chrome.tabs.update(postingTabId, {
          url: targetUrl,
          active: false,
        });
      }
    }
    if (!(await waitPostingTabReady(postingTabId, 6e4))) {
      if (state.realPostJob) state.realPostJob.postingNavigationExpected = false;
      throw new Error(
        'Facebook posting page did not finish loading or poster content script was unavailable',
      );
    }
    if (state.realPostJob) state.realPostJob.postingNavigationExpected = false;
    return {
      windowId: postingWindowId,
      tabId: postingTabId,
    };
  };
  const waitForFacebookPostingSettled = async (tabId, timeoutMs = 12000) => {
    if (!tabId) return true;
    const started = Date.now();
    let stableClosed = 0;
    while (Date.now() - started < timeoutMs) {
      const r = await chrome.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            const visible = (el) => {
              if (!el) return false;
              const r = el.getBoundingClientRect?.();
              if (!r || r.width <= 0 || r.height <= 0) return false;
              const s = getComputedStyle(el);
              return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
            };
            const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
            const dialog =
              dialogs.reverse().find((d) => /create\s+post|post/i.test(String(d.innerText || ''))) || null;
            const body = String(document.body?.innerText || '')
              .replace(/\s+/g, ' ')
              .trim();
            const pending =
              /your post is pending|post is pending|awaiting admin approval|pending approval|bài viết của bạn đang chờ|đang chờ phê duyệt/i.test(
                body,
              );
            const posting = /posting in progress|publishing|posting\.\.\.|đang đăng|đang xuất bản/i.test(
              body,
            );
            if (!dialog) return { closed: true, pending, posting: false };
            const dialogText = String(dialog.innerText || '');
            const stillSubmitting =
              /posting in progress|publishing|posting\.\.\.|đang đăng|đang xuất bản/i.test(dialogText);
            const progress = !!dialog.querySelector('[role="progressbar"],[aria-busy="true"]');
            return { closed: false, pending, posting: posting || stillSubmitting || progress };
          },
        })
        .catch(() => []);
      const state = r?.[0]?.result;
      if (state?.closed) {
        stableClosed++;
        if (stableClosed >= 2) return true;
      } else {
        // Pending text on the underlying group page is not enough while the
        // Create post dialog is still present; closing then could still invoke
        // Facebook's unsaved-changes guard.
        stableClosed = 0;
      }
      await sleep(250);
    }
    return false;
  };

  const closePostingPopupForRetry = async (reason = 'retry') => {
    const wid = postingWindowId;
    if (state.realPostJob) state.realPostJob.suppressPopupLifecycle = true;
    postingWindowId = null;
    postingTabId = null;
    if (state.realPostJob) state.realPostJob.postingTabId = null;
    if (wid) {
      state.realPostJob?.windowIds?.delete?.(wid);
      await chrome.windows.remove(wid).catch(() => {});
    }
    if (state.realPostJob) state.realPostJob.suppressPopupLifecycle = false;
    emit({
      stage: 'retry-close',
      index: 0,
      total: total,
      groupId: '',
      groupName: '',
      message: `Closed Facebook posting popup before retry (${reason}).`,
    });
    await sleep(150);
  };
  try {
    for (let index = 0; index < groups.length; index++) {
      const g = groups[index];
      const groupId = String(g?.id || g?.groupId || '').trim();
      if (!groupId) continue;
      if (state.realPostJob?.stopped) {
        break;
      }
      const sessionUser = await getFacebookCookieUserId();
      const bound = (await chrome.storage.local.get('fb_account_binding')).fb_account_binding?.userId;
      if (sessionUser && isValidFacebookUserId(bound) && String(sessionUser) !== String(bound)) {
        state.realPostJob.stopped = true;
        await resetForAccountChange(bound, sessionUser).catch(() => {});
        break;
      }
      while (state.realPostJob?.paused && !state.realPostJob?.stopped) await sleep(250);
      if (state.realPostJob?.stopped) break;
      emit({
        stage: 'opening',
        index: index + 1,
        total: total,
        groupId: groupId,
        groupName: g?.name || groupId,
        message: `Post ${index + 1}/${total}: ${g?.name || groupId} — opening Facebook group`,
      });
      const groupMessage = shufflePlanner ? shufflePlanner.next(groupId) : exactMessage;
      if (shufflePlanner)
        emit({
          stage: 'variant',
          index: index + 1,
          total: total,
          groupId: groupId,
          groupName: g?.name || groupId,
          message: `${g?.name || groupId}: unique Spintax variation assigned for this group`,
          variant: groupMessage,
        });
      let last = null,
        groupSkipped = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (state.realPostJob?.stopped) break;
        if (attempt > 0)
          emit({
            stage: 'retry',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: `Retrying ${g?.name || groupId} (${attempt}/2)…`,
          });
        try {
          const popup = await ensurePostingPopup(groupId, {
            reload: attempt > 0,
          });
          const tabId = popup.tabId;
          if (identity?.name) {
            emit({
              stage: 'identity',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: `${g?.name || groupId}: switching Facebook posting identity to ${identity.name}…`,
            });
            const identityResult = await switchFacebookIdentityInTab(tabId, identity);
            if (!identityResult?.success)
              throw Object.assign(
                new Error(identityResult?.error || `Could not switch Facebook identity to ${identity.name}.`),
                {
                  code: 'FACEBOOK_IDENTITY_SWITCH_FAILED',
                },
              );
            await sleep(700);
          }
          emit({
            stage: 'composer',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: `${g?.name || groupId}: Facebook loaded — opening composer…`,
          });
          const runId = crypto.randomUUID();
          emit({
            stage: 'input',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: `${g?.name || groupId}: preparing post content…`,
            variant: groupMessage,
          });
          let response = null;
          try {
            const mediaWatchdog = mediaIds?.length
              ? (async () => {
                  let lastSignature = '';
                  let lastProgressAt = Date.now();
                  while (Date.now() - lastProgressAt < 10 * 60 * 1e3) {
                    if (state.realPostJob?.stopped)
                      throw new Error('Posting stopped while media was uploading');
                    const live = state.realPostJob?.statusByGroup?.get?.(String(groupId));
                    const stage = String(live?.stage || '').toUpperCase();
                    const mediaStage =
                      stage === 'FETCHING_MEDIA' || stage === 'ATTACHING_MEDIA' || stage === 'MEDIA';
                    if (mediaStage) {
                      const sig = JSON.stringify([
                        live?.mediaPreviewCount ?? null,
                        live?.mediaExpectedCount ?? null,
                        live?.mediaAttachmentEvidenceCount ?? null,
                        live?.mediaUploadProgress ?? null,
                        live?.mediaAttachmentPhase ?? null,
                      ]);
                      if (sig !== lastSignature) {
                        lastSignature = sig;
                        lastProgressAt = Date.now();
                      }
                      const expected = Number(live?.mediaExpectedCount || 0);
                      const accepted = Number(live?.mediaAttachmentEvidenceCount || 0);
                      const phase = String(live?.mediaAttachmentPhase || '').toUpperCase();
                      const acceptedByPhase = ['MEDIA_PASTE_COMPLETE', 'CONFIRMED'].includes(phase);
                      if ((accepted >= expected && expected > 0) || acceptedByPhase) {
                        lastProgressAt = Date.now();
                      } else if (Date.now() - lastProgressAt >= 90 * 1e3) {
                        await chrome.tabs
                          .sendMessage(tabId, {
                            action: 'ABORT_ACTIVE_POSTING',
                            taskId: jobId,
                            runId: runId,
                          })
                          .catch(() => {});
                        throw Object.assign(
                          new Error(
                            'Facebook media attachment made no measurable progress for 90 seconds. Retrying this group.',
                          ),
                          {
                            code: 'MEDIA_ATTACH_STALLED',
                          },
                        );
                      }
                    }
                    await sleep(1e3);
                  }
                })()
              : null;
            response = await Promise.race([
              chrome.tabs.sendMessage(tabId, {
                action: 'POST_TO_GROUP',
                taskId: jobId,
                runId: runId,
                groupId: groupId,
                content: groupMessage,
                background: String(background || ''),
                mediaIds: mediaIds,
              }),
              mediaWatchdog || new Promise(() => {}),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        mediaIds?.length
                          ? 'Facebook media posting action timed out after 12 minutes'
                          : 'Facebook posting action timed out after 20 minutes',
                      ),
                    ),
                  mediaIds?.length ? 12 * 60 * 1e3 : 20 * 60 * 1e3,
                ),
              ),
            ]);
          } catch (sendErr) {
            if (state.realPostJob?.stopped) {
              last = {
                success: false,
                stopped: true,
                error: 'Posting stopped by user.',
                errorCode: 'POSTING_STOPPED',
              };
              break;
            }
            let bridge = null;
            for (let recoveryWait = 0; recoveryWait < 5e3; recoveryWait += 250) {
              bridge = state.realPostJob?.statusByGroup?.get?.(groupId);
              if (bridge?.completed || bridge?.stage === 'COMPLETED') break;
              await sleep(250);
            }
            if (bridge?.completed || bridge?.stage === 'COMPLETED') {
              const confirmationType = String(bridge?.confirmationType || '').toUpperCase();
              if (confirmationType === 'ADMIN_APPROVAL') {
                response = {
                  success: true,
                  pending: true,
                  warningCode: 'POST_REQUIRES_ADMIN_APPROVAL',
                  postId: bridge.postId || null,
                  postUrl: null,
                  pendingPostUrl: bridge.pendingPostUrl || null,
                  mediaHasVideo: !!bridge.mediaHasVideo,
                  recoveredFromChannelError: true,
                };
              } else if (confirmationType === 'POSTED') {
                response = {
                  success: true,
                  pending: false,
                  warningCode: null,
                  postId: bridge.postId || null,
                  postUrl: bridge.postUrl || null,
                  pendingPostUrl: null,
                  mediaHasVideo: !!bridge.mediaHasVideo,
                  recoveredFromChannelError: true,
                };
              } else {
                // A completed bridge state without an explicit Facebook
                // confirmation is NOT a successful post. Do not let this
                // path create a false Success/Pending result.
                response = {
                  success: false,
                  pending: false,
                  error: 'Facebook did not provide an explicit post confirmation.',
                  errorCode: 'POST_SUBMISSION_UNCONFIRMED',
                  recoveredFromChannelError: true,
                };
              }
            } else {
              throw sendErr;
            }
          }
          last = response || {
            success: false,
            error: 'No response from Facebook posting content script',
          };
          if (last.backgroundResult && !last.backgroundResult.applied)
            emit({
              stage: 'background',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: `${g?.name || groupId}: Facebook background not applied (${last.backgroundResult.reason || 'unknown'})`,
            });
          if (!last?.success && !last?.skipped && state.realPostJob?.statusByGroup) {
            for (let recoveryWait = 0; recoveryWait < 5e3; recoveryWait += 250) {
              const live = state.realPostJob.statusByGroup.get(String(groupId));
              if (
                live?.confirmationType === 'ADMIN_APPROVAL' ||
                live?.confirmationType === 'POSTED' ||
                live?.stage === 'COMPLETED'
              ) {
                if (live.confirmationType === 'ADMIN_APPROVAL')
                  last = {
                    success: true,
                    pending: true,
                    postId: live.postId || null,
                    postUrl: null,
                    pendingPostUrl: live.pendingPostUrl || null,
                    warningCode: 'POST_REQUIRES_ADMIN_APPROVAL',
                    recoveredFromStatus: true,
                  };
                else if (live.confirmationType === 'POSTED')
                  last = {
                    success: true,
                    pending: false,
                    postId: live.postId || null,
                    postUrl: live.postUrl || null,
                    pendingPostUrl: null,
                    mediaHasVideo: !!live.mediaHasVideo,
                    warningCode: null,
                    recoveredFromStatus: true,
                  };
                if (last?.success) break;
              }
              await sleep(250);
            }
          }
          if (
            last?.stopped === true ||
            last?.accountRestricted === true ||
            String(last?.errorCode || '') === 'ACCOUNT_POSTING_RESTRICTED'
          ) {
            state.realPostJob.stopped = true;
            await closePostingPopupForRetry('Facebook account restriction');
            emit({
              stage: 'account-stop',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: 'Facebook reported an account-level posting restriction. Posting stopped.',
              result: last,
            });
            break;
          }
          const responseSkipCodes = queueSkipCodes;
          if (last?.skipped || responseSkipCodes.has(String(last.errorCode || ''))) {
            groupSkipped = true;
            skippedCount++;
            const skipMsg = String(last.error || 'This group is not eligible for posting.');
            results.push({
              groupId: groupId,
              groupName: g?.name || groupId,
              success: false,
              skipped: true,
              error: skipMsg,
              errorCode: String(last.errorCode),
            });
            emit({
              stage: 'result',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: `↷ ${g?.name || groupId}: skipped — ${skipMsg}`,
              result: {
                success: false,
                skipped: true,
                error: skipMsg,
                errorCode: String(last.errorCode),
              },
            });
            break;
          }
          emit({
            stage: 'result',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: last.success
              ? `✓ ${g?.name || groupId}: ${last.warningCode || 'Facebook confirmed submission'}`
              : `✗ ${g?.name || groupId}: ${last.error || 'Facebook did not confirm submission'}`,
            result: last,
          });
          const pending =
            !!last.success && (last.pending === true || last.warningCode === 'POST_REQUIRES_ADMIN_APPROVAL');
          const submitted = !!last.success;
          if (submitted) {
            // Do not close/reuse the Facebook popup while Create post is still
            // in its "Posting in progress" state. Facebook can keep a
            // beforeunload/unsaved-changes guard alive for a short time; closing
            // the popup at that exact moment produces the native "Leave" dialog
            // seen by the user. Wait for the composer to close or the pending
            // approval state to become visible before moving to the next group.
            await waitForFacebookPostingSettled(tabId, 12000).catch(() => {});
            if (pending) {
              pendingCount++;
              results.push({
                groupId: groupId,
                groupName: g?.name || groupId,
                success: true,
                pending: true,
                warningCode: last.warningCode || 'POST_SUBMISSION_UNCONFIRMED',
                postId: last.postId || null,
                postUrl: last.postUrl || null,
                pendingPostUrl: last.pendingPostUrl || null,
                mediaHasVideo: !!last.mediaHasVideo,
              });
            } else {
              successCount++;
              results.push({
                groupId: groupId,
                groupName: g?.name || groupId,
                success: true,
                warningCode: last.warningCode || null,
                postId: last.postId || null,
                postUrl: last.postUrl || null,
                pendingPostUrl: last.pendingPostUrl || null,
                mediaHasVideo: !!last.mediaHasVideo,
              });
            }
            break;
          }
          if (attempt < 1) {
            await closePostingPopupForRetry(last?.error || last?.errorCode || 'posting failure');
            continue;
          }
          if (String(last?.errorCode || '') === 'POST_BUTTON_NOT_FOUND') {
            state.realPostJob.stopped = true;
            await closePostingPopupForRetry('Post button is no longer clickable');
            emit({
              stage: 'post-stop',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: 'Facebook no longer exposes a clickable Post button. Posting stopped.',
              result: last,
            });
            break;
          }
          groupSkipped = true;
          skippedCount++;
          const finalSkipMsg = String(last?.error || 'Posting failed after one retry. Skipping this group.');
          results.push({
            groupId: groupId,
            groupName: g?.name || groupId,
            success: false,
            skipped: true,
            error: finalSkipMsg,
            errorCode: last?.errorCode || 'POST_FAILED_AFTER_RETRY',
          });
          emit({
            stage: 'result',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: `↷ ${g?.name || groupId}: skipped after retry — ${finalSkipMsg}`,
            result: {
              success: false,
              skipped: true,
              error: finalSkipMsg,
              errorCode: last?.errorCode || 'POST_FAILED_AFTER_RETRY',
            },
          });
        } catch (e) {
          if (state.realPostJob?.paused && !state.realPostJob?.stopped) {
            await sleep(200);
            attempt = -1;
            continue;
          }
          if (postingWindowId) {
            try {
              await chrome.windows.get(postingWindowId);
            } catch {
              state.realPostJob?.windowIds?.delete?.(postingWindowId);
              postingWindowId = null;
              postingTabId = null;
            }
          }
          if (state.realPostJob?.stopped) {
            last = {
              success: false,
              stopped: true,
              error: 'Posting stopped by user.',
              errorCode: 'POSTING_STOPPED',
            };
            break;
          }
          if (String(e?.code || '') === 'ACCOUNT_POSTING_RESTRICTED') {
            state.realPostJob.stopped = true;
            await closePostingPopupForRetry('Facebook account restriction');
            emit({
              stage: 'account-stop',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: 'Facebook reported an account-level posting restriction. Posting stopped.',
              result: {
                success: false,
                stopped: true,
                accountRestricted: true,
                error: e?.message || 'Account posting restriction',
                errorCode: 'ACCOUNT_POSTING_RESTRICTED',
              },
            });
            break;
          }
          last = {
            success: false,
            error: e?.message || String(e),
            errorCode: e?.code || 'POSTING_EXCEPTION',
            skipped: !!e?.skipped,
          };
          const skipCodes = queueSkipCodes;
          if (last?.skipped || skipCodes.has(String(last.errorCode || ''))) {
            groupSkipped = true;
            const msg = String(last.error || 'This group is not eligible for posting.');
            skippedCount++;
            results.push({
              groupId: groupId,
              groupName: g?.name || groupId,
              success: false,
              skipped: true,
              error: msg,
              errorCode: last.errorCode,
            });
            emit({
              stage: 'result',
              index: index + 1,
              total: total,
              groupId: groupId,
              groupName: g?.name || groupId,
              message: `↷ ${g?.name || groupId}: skipped — ${msg}`,
              result: {
                success: false,
                skipped: true,
                error: msg,
                errorCode: last.errorCode,
              },
            });
            break;
          }
          if (attempt < 1) {
            await closePostingPopupForRetry(last?.error || last?.errorCode || 'posting exception');
            continue;
          }
          groupSkipped = true;
          skippedCount++;
          const finalSkipMsg = String(last?.error || 'Posting failed after one retry. Skipping this group.');
          results.push({
            groupId: groupId,
            groupName: g?.name || groupId,
            success: false,
            skipped: true,
            error: finalSkipMsg,
            errorCode: last?.errorCode || 'POSTING_EXCEPTION_AFTER_RETRY',
          });
          emit({
            stage: 'result',
            index: index + 1,
            total: total,
            groupId: groupId,
            groupName: g?.name || groupId,
            message: `↷ ${g?.name || groupId}: skipped after retry — ${finalSkipMsg}`,
            result: {
              success: false,
              skipped: true,
              error: finalSkipMsg,
              errorCode: last?.errorCode || 'POSTING_EXCEPTION_AFTER_RETRY',
            },
          });
        }
      }
      if (index < groups.length - 1 && !state.realPostJob?.stopped) {
        emit({
          stage: 'delay',
          index: index + 1,
          total: total,
          groupId: groupId,
          message: groupSkipped
            ? 'Skipped group — moving immediately to the next selected group…'
            : 'Current group finished — moving immediately to the next selected group…',
          variant: 'immediate-next',
        });
      }
    }
  } finally {
    if (postingWindowId) {
      if (state.realPostJob) state.realPostJob.suppressPopupLifecycle = true;
      state.realPostJob?.windowIds?.delete?.(postingWindowId);
      await chrome.windows.remove(postingWindowId).catch(() => {});
      postingWindowId = null;
      postingTabId = null;
      if (state.realPostJob) state.realPostJob.postingTabId = null;
      if (state.realPostJob) state.realPostJob.suppressPopupLifecycle = false;
    }
  }
  const stopped = !!state.realPostJob?.stopped;
  emit({
    stage: 'complete',
    total: total,
    successCount: successCount,
    pendingCount: pendingCount,
    failCount: failCount,
    stopped: stopped,
    results: results,
    message: `Posting finished: ${successCount} published, ${pendingCount} pending, ${failCount} failed${stopped ? ' (stopped)' : ''}.`,
  });
  const job = state.realPostJob;
  state.realPostJob = null;
  if (job?.mediaIds?.length && !job.preserveMedia) await deletePostingMedia(job.mediaIds).catch(() => {});
  return {
    success: successCount > 0 || pendingCount > 0 || skippedCount === total,
    successCount: successCount,
    pendingCount: pendingCount,
    failCount: failCount,
    skippedCount: skippedCount,
    total: total,
    stopped: stopped,
    results: results,
  };
}

export async function startRealPosting(m, send) {
  if (state.realPostJob?.running)
    return {
      success: false,
      error: 'A real Facebook posting job is already running.',
    };
  const groups = Array.isArray(m.groups) ? m.groups : [];
  if (!groups.length)
    return {
      success: false,
      error: 'No groups selected.',
    };
  if (!String(m.message || '').trim() && !(m.files || []).length && !(m.mediaIds || []).length)
    return {
      success: false,
      error: 'Add text or photo/video first.',
    };
  let mediaIds = Array.isArray(m.mediaIds) ? m.mediaIds.filter(Boolean) : [];
  if (!mediaIds.length && (m.files || []).length) mediaIds = await savePostingMedia(m.files || []);
  const jobId = crypto.randomUUID();
  state.realPostJob = {
    jobId: jobId,
    running: true,
    paused: false,
    stopped: false,
    mediaIds: mediaIds,
    windowIds: new Set(),
    postingTabId: null,
    postingNavigationExpected: false,
    suppressPopupLifecycle: false,
    lastHeartbeat: Date.now(),
    dashboardSessionId: String(m.dashboardSessionId || ''),
    scheduled: false,
    preserveMedia: false,
    statusByGroup: new Map(),
  };
  runRealPostingJob({
    jobId: jobId,
    groups: groups,
    message: m.message,
    background: String(m.background || ''),
    mediaIds: mediaIds,
    shuffleText: !!m.shuffleText,
    identity: m.identity || null,
  }).catch((e) => {
    chrome.runtime
      .sendMessage({
        type: 'REAL_POST_PROGRESS',
        jobId: jobId,
        stage: 'complete',
        total: groups.length,
        successCount: 0,
        failCount: groups.length,
        stopped: false,
        message: `Posting engine error: ${e?.message || String(e)}`,
      })
      .catch(() => {});
    state.realPostJob = null;
  });
  return {
    success: true,
    jobId: jobId,
  };
}
