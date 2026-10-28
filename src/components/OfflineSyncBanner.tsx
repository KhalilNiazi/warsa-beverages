import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, CloudUpload, Database } from 'lucide-react';
import { getSyncQueueCount, syncPendingMutations } from '../utils/indexedDB';
import { getGoogleSheetSyncRuntimeStatus } from '../api';
import { GoogleSheetSyncRuntimeStatus } from '../types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export function OfflineSyncBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [justSynced, setJustSynced] = useState<boolean>(false);
  const [cloudStatus, setCloudStatus] = useState<GoogleSheetSyncRuntimeStatus>(() => getGoogleSheetSyncRuntimeStatus());
  const [saveBannerMsg, setSaveBannerMsg] = useState<string | null>(null);

  const updateQueueStatus = async () => {
    const count = await getSyncQueueCount();
    setQueueCount(count);
  };

  useEffect(() => {
    updateQueueStatus();

    const handleOnline = () => {
      setIsOnline(true);
      handleManualSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      updateQueueStatus();
    };

    const handleQueueChange = () => {
      updateQueueStatus();
    };

    const handleCloudSyncStatus = (e: CustomEvent<GoogleSheetSyncRuntimeStatus>) => {
      const s = e.detail;
      setCloudStatus(s);
      if (s.state === 'SAVED' && s.lastAction) {
        setSaveBannerMsg(`Data is Saved to Google Sheet (${s.sheetName || 'Warsa Beverage'}) ✓`);
        const timer = setTimeout(() => {
          setSaveBannerMsg(null);
        }, 3500);
        return () => clearTimeout(timer);
      } else if (s.state === 'ERROR' && s.lastError) {
        setSaveBannerMsg(`Sync Notice: ${s.lastError}`);
        const timer = setTimeout(() => {
          setSaveBannerMsg(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('warsa_offline_queue_changed' as any, handleQueueChange);
    window.addEventListener('warsa_cloud_sync_status' as any, handleCloudSyncStatus);

    const interval = setInterval(updateQueueStatus, 8000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('warsa_offline_queue_changed' as any, handleQueueChange);
      window.removeEventListener('warsa_cloud_sync_status' as any, handleCloudSyncStatus);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncPendingMutations();
      await updateQueueStatus();
      if (res.syncedCount > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 4000);
      }
    } catch (e) {
      console.warn('Manual sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // If online, no queued items, no active save message, and not just synced, don't show banner
  if (isOnline && queueCount === 0 && !justSynced && !isSyncing && !saveBannerMsg) {
    return null;
  }

  return (
    <div className="w-full transition-all duration-300">
      {/* 0. Cloud sync result banner */}
      {saveBannerMsg && isOnline && (
        <div className={cn(
          "px-4 py-1.5 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in transition-colors",
          saveBannerMsg.includes('Saved') && "bg-emerald-600 text-white",
          saveBannerMsg.includes('Notice') && "bg-amber-600 text-white"
        )}>
          <div className="flex items-center gap-2">
            {saveBannerMsg.includes('Saved') && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white" />}
            {saveBannerMsg.includes('Notice') && <Database className="h-3.5 w-3.5 shrink-0 text-white" />}
            <span>{saveBannerMsg}</span>
          </div>
          <span className="text-[10px] tracking-wider uppercase opacity-90 font-mono">GOOGLE SHEETS LIVE</span>
        </div>
      )}

      {/* 1. Offline Mode Banner - Light Red & White */}
      {!isOnline && (
        <div className="bg-red-50 text-red-900 border-b border-red-200 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-red-600" />
            <span>
              <strong>Offline Mode Active:</strong> All orders, dispatches, and edits are securely cached locally in IndexedDB.
            </span>
          </div>
          {queueCount > 0 && (
            <span className="bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs">
              {queueCount} change{queueCount > 1 ? 's' : ''} queued
            </span>
          )}
        </div>
      )}

      {/* 2. Connection Restored / Syncing Banner */}
      {isOnline && isSyncing && !saveBannerMsg && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-white" />
            <span>
              <strong>Replaying Offline Changes:</strong> Synchronizing {queueCount} queued change{queueCount > 1 ? 's' : ''} with Google Sheets &amp; Firestore...
            </span>
          </div>
        </div>
      )}

      {/* 3. Online with Pending Queue (Awaiting Sync or Manual Trigger) */}
      {isOnline && !isSyncing && queueCount > 0 && !saveBannerMsg && (
        <div className="bg-red-50 text-red-900 border-b border-red-200 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong>Connection Restored:</strong> {queueCount} offline change{queueCount > 1 ? 's' : ''} stored locally in IndexedDB ready to sync.
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleManualSync}
            className="h-6 text-[11px] bg-red-600 text-white hover:bg-red-700 font-bold px-2.5 rounded-md gap-1 shadow-xs cursor-pointer"
          >
            <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
            Sync Now
          </Button>
        </div>
      )}

      {/* 4. Success Toast Notification */}
      {justSynced && queueCount === 0 && !saveBannerMsg && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
            <span>
              <strong>Synchronization Complete:</strong> All queued changes were successfully saved to Google Sheets &amp; Firestore!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
