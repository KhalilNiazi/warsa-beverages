/**
 * WARSA KFM Beverages - IndexedDB Local Persistence & Offline Sync Engine
 * 
 * Provides:
 * - High-capacity asynchronous IndexedDB object stores for all application entities
 * - Offline viewing of inventory, sales, outlets, dispatches, cash slips, and ledgers
 * - Persistent mutation queue (syncQueue) for actions executed during connectivity outages
 * - Automatic background synchronization and replay once network is restored
 */
import { getFirebaseIdToken, getAppCheckToken } from '../lib/firebase';


const DB_NAME = 'WarsaOfflineDB';
const DB_VERSION = 2;

export const STORES = {
  INVENTORY: 'inventory',
  SALES: 'sales',
  OUTLETS: 'outlets',
  DISPATCH: 'dispatchLoads',
  CASH_SLIPS: 'cashSlips',
  PAYMENTS: 'payments',
  CLOSINGS: 'dailyClosings',
  STOCK_INWARD: 'stockInward',
  STOCK_MOVEMENTS: 'stockMovements',
  ROUTES: 'routes',
  USERS: 'appUsers',
  ORDER_BOOKERS: 'orderBookers',
  SYNC_QUEUE: 'syncQueue'
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

export interface SyncQueueItem {
  id: string;
  mutationId: string;
  action: string;
  payload: any;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  nextAttemptAt?: number;
  lastError?: string;
}

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

/**
 * Initializes and upgrades the IndexedDB instance
 */
export function openWarsaDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores if they do not exist
      const storeConfigs: Array<{ name: StoreName; keyPath: string }> = [
        { name: STORES.INVENTORY, keyPath: 'ID' },
        { name: STORES.SALES, keyPath: 'ID' },
        { name: STORES.OUTLETS, keyPath: 'ID' },
        { name: STORES.DISPATCH, keyPath: 'ID' },
        { name: STORES.CASH_SLIPS, keyPath: 'id' },
        { name: STORES.PAYMENTS, keyPath: 'ID' },
        { name: STORES.CLOSINGS, keyPath: 'ID' },
        { name: STORES.STOCK_INWARD, keyPath: 'ID' },
        { name: STORES.STOCK_MOVEMENTS, keyPath: 'ID' },
        { name: STORES.ROUTES, keyPath: 'ID' },
        { name: STORES.USERS, keyPath: 'id' },
        { name: STORES.ORDER_BOOKERS, keyPath: 'ID' },
        { name: STORES.SYNC_QUEUE, keyPath: 'id' }
      ];

      for (const config of storeConfigs) {
        if (!db.objectStoreNames.contains(config.name)) {
          const store = db.createObjectStore(config.name, { keyPath: config.keyPath });
          if (config.name === STORES.SYNC_QUEUE) {
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbOpenPromise = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      dbOpenPromise = null;
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbOpenPromise;
}

/**
 * Saves or updates a single item in an object store
 */
export async function saveToIDB<T = any>(storeName: StoreName, item: T): Promise<void> {
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error saving to ${storeName}:`, err);
  }
}

/**
 * Clears all items from an object store
 */
export async function clearIDBStore(storeName: StoreName): Promise<void> {
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error clearing store ${storeName}:`, err);
  }
}

/**
 * Replaces all items in an object store with fresh items (clears previous and inserts new)
 */
export async function replaceStoreInIDB<T = any>(storeName: StoreName, items: T[]): Promise<void> {
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      if (Array.isArray(items)) {
        for (const item of items) {
          store.put(item);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error replacing store in ${storeName}:`, err);
  }
}

/**
 * Replaces/bulk upserts multiple items into an object store
 */
export async function bulkSaveToIDB<T = any>(storeName: StoreName, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const item of items) {
        store.put(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error bulk saving to ${storeName}:`, err);
  }
}

/**
 * Retrieves all items from an object store
 */
export async function getAllFromIDB<T = any>(storeName: StoreName): Promise<T[]> {
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error reading from ${storeName}:`, err);
    return [];
  }
}

/**
 * Deletes an item by key from an object store
 */
export async function deleteFromIDB(storeName: StoreName, key: string | number): Promise<void> {
  try {
    const db = await openWarsaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error deleting key ${key} from ${storeName}:`, err);
  }
}

// =========================================================================
// OFFLINE MUTATION SYNC QUEUE
// =========================================================================

/**
 * Queues an offline mutation for automatic replay when online with deduplication
 */
export async function queueOfflineMutation(action: string, payload: any, mutationId?: string): Promise<SyncQueueItem> {
  const targetId = payload && typeof payload === 'object'
    ? String(payload.ID || payload.id || payload.Id || payload.Code || payload.code || payload.slipNumber || '').trim()
    : String(payload || '').trim();

  // Deduplicate: purge stale or conflicting queue items for the same entity
  try {
    const existing = await getAllFromIDB<SyncQueueItem>(STORES.SYNC_QUEUE);
    for (const it of existing) {
      const itId = it.payload && typeof it.payload === 'object'
        ? String(it.payload.ID || it.payload.id || it.payload.Id || it.payload.Code || it.payload.code || it.payload.slipNumber || '').trim()
        : String(it.payload || '').trim();

      if (itId && targetId && itId === targetId) {
        if (action.startsWith('delete')) {
          // If we are deleting this entity, purge any previous pending saves or previous duplicate deletes
          await deleteFromIDB(STORES.SYNC_QUEUE, it.id);
        } else if (action === it.action) {
          // If saving the same entity again, remove the old mutation and keep only the latest state
          await deleteFromIDB(STORES.SYNC_QUEUE, it.id);
        }
      }
    }
  } catch (err) {
    console.warn('[Sync Queue] Deduplication notice:', err);
  }

  const item: SyncQueueItem = {
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    mutationId: mutationId || crypto.randomUUID(),
    action,
    payload,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    retryCount: 0
  };

  await saveToIDB(STORES.SYNC_QUEUE, item);
  
  // Dispatch custom window event to update UI indicators
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('warsa_offline_queue_changed'));
  }

  // If Service Worker Background Sync is supported, request a sync
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => {
      // @ts-ignore
      if (reg.sync) reg.sync.register('warsa-background-sync').catch(() => {});
    }).catch(() => {});
  }

  return item;
}

/**
 * Returns all pending sync queue items
 */
export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const all = await getAllFromIDB<SyncQueueItem>(STORES.SYNC_QUEUE);
    const now = Date.now();
    return all.filter(item =>
      (item.status === 'PENDING' || item.status === 'FAILED') &&
      (!item.nextAttemptAt || item.nextAttemptAt <= now)
    );
  } catch {
    return [];
  }
}

/**
 * Removes a synced item from the queue
 */
export async function removeSyncQueueItem(id: string): Promise<void> {
  await deleteFromIDB(STORES.SYNC_QUEUE, id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('warsa_offline_queue_changed'));
  }
}

/**
 * Purges all sync queue items for a specific entity ID (e.g. after successful delete)
 */
export async function purgeSyncQueueForEntity(entityId: string): Promise<void> {
  if (!entityId) return;
  try {
    const all = await getAllFromIDB<SyncQueueItem>(STORES.SYNC_QUEUE);
    for (const it of all) {
      const itId = it.payload && typeof it.payload === 'object'
        ? String(it.payload.ID || it.payload.id || it.payload.Id || it.payload.Code || it.payload.code || '').trim()
        : String(it.payload || '').trim();
      if (itId === entityId.trim()) {
        await deleteFromIDB(STORES.SYNC_QUEUE, it.id);
      }
    }
  } catch (e) {}
}

/**
 * Returns the count of pending offline sync items
 */
export async function getSyncQueueCount(): Promise<number> {
  const pending = await getPendingSyncQueue();
  return pending.length;
}

let isSyncing = false;

/**
 * Synchronizes and replays all pending offline mutations to the Google Sheets endpoint.
 * Uses atomic batch mutations when multiple items exist to eliminate lock collisions.
 */
export async function syncPendingMutations(
  syncEndpointUrl?: string,
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; failedCount: number }> {
  if (isSyncing) {
    return { success: false, syncedCount: 0, failedCount: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedCount: 0, failedCount: 0 };
  }

  const url = syncEndpointUrl || getSettingsUrl();
  if (!url || !url.trim()) {
    return { success: false, syncedCount: 0, failedCount: 0 };
  }

  const items = await getPendingSyncQueue();
  if (items.length === 0) {
    return { success: true, syncedCount: 0, failedCount: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;

  try {
    const idToken = await getFirebaseIdToken(true);
    const appCheckToken = await getAppCheckToken();
    if (!idToken) {
      return { success: false, syncedCount: 0, failedCount: items.length };
    }
    // 1. Try batch execution first if more than 1 item is queued
    if (items.length > 1) {
      try {
        for (const item of items) {
          if (!item.mutationId) {
            item.mutationId = crypto.randomUUID();
            await saveToIDB(STORES.SYNC_QUEUE, item);
          }
        }
        const batchPayload = items.map(it => ({
          action: it.action,
          data: it.payload,
          mutationId: it.mutationId
        }));

        const cleanUrl = url.trim();
        const response = await fetch(cleanUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'batchMutations',
            data: batchPayload,
            idToken,
            appCheckToken: appCheckToken || undefined
          }),
          redirect: 'follow'
        });

        const result = await response.json().catch(() => null);

        if (response.ok && result && result.success) {
          // All items in the batch processed successfully in 1 single HTTP request!
          for (const it of items) {
            await removeSyncQueueItem(it.id);
          }
          syncedCount = items.length;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('warsa_last_cloud_sync', new Date().toISOString());
          }
          if (onProgress) onProgress(syncedCount, items.length);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('warsa_offline_queue_changed', {
              detail: { syncedCount, failedCount: 0 }
            }));
            window.dispatchEvent(new CustomEvent('warsa_cloud_sync_status', {
              detail: {
                state: 'SAVED',
                lastSyncTime: new Date().toISOString(),
                pendingCount: 0,
                inFlightCount: 0,
                isOnline: true,
                sheetName: result?.sheetName || 'Warsa Beverage'
              }
            }));
          }

          return { success: true, syncedCount, failedCount: 0 };
        }
      } catch (batchErr) {
        console.warn('[Batch Sync] Falling back to sequential replay:', batchErr);
      }
    }

    // 2. Sequential fallback with lock interval to prevent concurrent lock storms
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.mutationId) {
        item.mutationId = crypto.randomUUID();
        await saveToIDB(STORES.SYNC_QUEUE, item);
      }

      if (item.retryCount > 0) {
        const delayMs = Math.min(30_000, 500 * (2 ** Math.min(item.retryCount, 6)));
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Mark as SYNCING
      item.status = 'SYNCING';
      await saveToIDB(STORES.SYNC_QUEUE, item);

      try {
        const cleanUrl = url.trim();
        let isOk = false;
        let result: any = null;

        if (!isOk) {
          const response = await fetch(cleanUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
              action: item.action,
              data: item.payload,
              mutationId: item.mutationId,
              idToken,
              appCheckToken: appCheckToken || undefined
            }),
            redirect: 'follow'
          });

          result = await response.json().catch(() => null);
          isOk = response.ok && result?.success === true;
        }

        if (isOk) {
          await removeSyncQueueItem(item.id);
          syncedCount++;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('warsa_last_cloud_sync', new Date().toISOString());
          }
        } else {
          item.status = 'FAILED';
          item.retryCount += 1;
          item.nextAttemptAt = Date.now() + Math.min(30_000, 500 * (2 ** Math.min(item.retryCount, 6)));
          item.lastError = result?.error || 'Sync execution failed';
          
          await saveToIDB(STORES.SYNC_QUEUE, item);
          failedCount++;
        }
      } catch (err: any) {
        item.status = 'FAILED';
        item.retryCount += 1;
        item.nextAttemptAt = Date.now() + Math.min(30_000, 500 * (2 ** Math.min(item.retryCount, 6)));
        item.lastError = err?.message || 'Network unreachable';
        await saveToIDB(STORES.SYNC_QUEUE, item);
        failedCount++;
        break; // Network down, pause until next online event
      }

      if (onProgress) {
        onProgress(syncedCount, items.length);
      }

      // Small 150ms delay between items to allow Google Apps Script lock release
      if (i < items.length - 1) {
        await new Promise(res => setTimeout(res, 150));
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('warsa_offline_queue_changed', {
        detail: { syncedCount, failedCount }
      }));
      if (syncedCount > 0) {
        window.dispatchEvent(new CustomEvent('warsa_cloud_sync_status', {
          detail: {
            state: failedCount === 0 ? 'SAVED' : 'ERROR',
            lastSyncTime: new Date().toISOString(),
            pendingCount: failedCount,
            inFlightCount: 0,
            isOnline: true
          }
        }));
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount
    };
  } finally {
    isSyncing = false;
  }
}

const DEFAULT_APPS_SCRIPT_URL = '/api/google-sheets';

function getSettingsUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('warsa_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        return DEFAULT_APPS_SCRIPT_URL;
      }
    }
  } catch {}
  return DEFAULT_APPS_SCRIPT_URL.trim();
}
