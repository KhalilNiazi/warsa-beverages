/**
 * Automatic Google Sheet synchronization.
 * - Pushes pending/failed local changes whenever the app is online and signed in.
 * - Pulls fresh cloud data periodically when nothing is waiting to upload.
 * No manual "Sync Pending" / "Pull from Sheet" click is needed.
 */
import { auth } from '@/src/lib/firebase';
import { getAllFromIDB, STORES, syncPendingMutations } from './indexedDB';

const PUSH_INTERVAL_MS = 15_000;
const PULL_INTERVAL_MS = 3 * 60_000;

let started = false;
let stopFn: (() => void) | null = null;

export function startAutoSync(options: {
  canPull: boolean;
  pull: () => Promise<unknown>;
}): () => void {
  if (started && stopFn) return stopFn;
  started = true;

  let pushing = false;
  let pulling = false;
  let lastPull = Date.now();
  let pullFailureCount = 0;
  let nextPullAttemptAt = 0;

  const ready = () =>
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
    !!auth.currentUser &&
    !auth.currentUser.isAnonymous;

  const pendingTotal = async (): Promise<number> => {
    try {
      const all = await getAllFromIDB<{ status?: string }>(STORES.SYNC_QUEUE);
      return all.length;
    } catch {
      return 0;
    }
  };

  const pushNow = async () => {
    if (pushing || !ready()) return;
    pushing = true;
    try {
      await syncPendingMutations();
    } catch (e) {
      console.warn('[AutoSync] push notice:', e);
    } finally {
      pushing = false;
    }
  };

  const pullNow = async () => {
    if (!options.canPull || pulling || pushing || !ready()) return;
    if (Date.now() < nextPullAttemptAt) return;
    // Never overwrite local data while uploads are waiting, or while a form/dialog is open.
    if ((await pendingTotal()) > 0) return;
    if (document.querySelector('.responsive-dialog-portal')) return;
    pulling = true;
    try {
      const result = await options.pull();
      if (typeof result === 'object' && result !== null && 'success' in result && result.success === false) {
        pullFailureCount += 1;
        nextPullAttemptAt = Date.now() + Math.min(120_000, 30_000 * (2 ** (pullFailureCount - 1)));
        lastPull = Date.now();
        return;
      }
      pullFailureCount = 0;
      nextPullAttemptAt = 0;
      lastPull = Date.now();
    } catch (e) {
      console.warn('[AutoSync] pull notice:', e);
      pullFailureCount += 1;
      nextPullAttemptAt = Date.now() + Math.min(120_000, 30_000 * (2 ** (pullFailureCount - 1)));
      lastPull = Date.now();
    } finally {
      pulling = false;
    }
  };

  const tick = async () => {
    await pushNow();
    if (Date.now() - lastPull >= PULL_INTERVAL_MS) await pullNow();
  };

  const onOnline = () => {
    lastPull = 0;
    nextPullAttemptAt = 0;
    void tick();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
  const onQueueChanged = () => { setTimeout(() => void pushNow(), 1500); };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('warsa_offline_queue_changed' as any, onQueueChanged);
  const timer = window.setInterval(() => void tick(), PUSH_INTERVAL_MS);
  setTimeout(() => void pushNow(), 2000);

  stopFn = () => {
    window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('warsa_offline_queue_changed' as any, onQueueChanged);
    started = false;
    stopFn = null;
  };
  return stopFn;
}