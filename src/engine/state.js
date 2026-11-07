// Mutable state shared across engine modules (ES imports are read-only bindings).
export const state = {
  FB_PAGE_SYNC_ACTIVE_TAB_ID: null,
  FB_MANAGED_PAGE_SYNC_PROMISE: null,
  __fbAccountGuardRunning: false,
  activeSyncJob: null,
  activeCoverJob: null,
  syncLifelinePort: null,
  realPostJob: null,
  profileCheckPromise: null,
};
