import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Cloud, 
  CloudCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  WifiOff, 
  ExternalLink, 
  Database, 
  Check, 
  Clock, 
  Info,
  Server,
  DownloadCloud,
  Trash2
} from 'lucide-react';
import { 
  getGoogleSheetSyncRuntimeStatus, 
  testGoogleAppsScript, 
  syncAllDataNow, 
  pullAllDataFromGoogleSheet,
  purgeTemporaryMockDataFromStorage,
  getSettings,
  DEFAULT_SPREADSHEET_ID
} from '@/src/api';
import { GoogleSheetSyncRuntimeStatus, GoogleSheetSyncState, SyncLogEntry } from '@/src/types';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

interface GoogleSheetSyncStatusProps {
  variant?: 'badge' | 'full' | 'floating';
  className?: string;
}

export function GoogleSheetSyncStatus({ variant = 'badge', className }: GoogleSheetSyncStatusProps) {
  const [status, setStatus] = useState<GoogleSheetSyncRuntimeStatus>(() => getGoogleSheetSyncRuntimeStatus());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [failedLog, setFailedLog] = useState<SyncLogEntry | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'saving' | 'saved' | 'error' } | null>(null);

  useEffect(() => {
    const handleStatusUpdate = (e: CustomEvent<GoogleSheetSyncRuntimeStatus>) => {
      const newStatus = e.detail;
      setStatus(newStatus);

      // Trigger live runtime feedback toast when state transitions
      if (newStatus.state === 'SAVED' && newStatus.lastAction) {
        const actionLabel = formatActionName(newStatus.lastAction, newStatus.lastTargetId);
        setToastMessage({
          text: `Data Saved: ${actionLabel} written to Google Sheet (${newStatus.sheetName || 'Warsa Beverage'})`,
          type: 'saved'
        });
        const timer = setTimeout(() => {
          setToastMessage(null);
        }, 4000);
        return () => clearTimeout(timer);
      } else if (newStatus.state === 'ERROR' && newStatus.lastError) {
        setToastMessage({
          text: `Sync Error: ${newStatus.lastError}`,
          type: 'error'
        });
        const timer = setTimeout(() => {
          setToastMessage(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('warsa_cloud_sync_status' as any, handleStatusUpdate);

    // Initial check
    setStatus(getGoogleSheetSyncRuntimeStatus());

    // Periodic time refresh for relative time ("2m ago")
    const interval = setInterval(() => {
      setStatus(prev => ({ ...prev }));
    }, 15000);

    return () => {
      window.removeEventListener('warsa_cloud_sync_status' as any, handleStatusUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleRunTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testGoogleAppsScript();
      if (res && res.success) {
        setTestResult(`Connected successfully to "${res.sheetName || 'Warsa Beverage'}"! Version: ${res.version || '4.0'}`);
      } else {
        setTestResult(`Connection failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setTestResult(`Error: ${err?.message || 'Could not reach endpoint'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const explainFailure = (err?: string): string => {
    const e = (err || '').toLowerCase();
    if (!e) return 'No error text was recorded. Press Retry; if it fails again the new error will appear here.';
    if (e.includes('not signed in') || e.includes('401') || e.includes('unauthorized') || e.includes('firebase id token'))
      return 'The Google Sheet could not verify your login. Sign out and sign in again. If it keeps happening, the Apps Script needs the FIREBASE_WEB_API_KEY script property and your account needs a role.';
    if (e.includes('forbidden') || e.includes('403') || e.includes('requires administrator'))
      return 'Your role is not allowed to do this action on the Google Sheet. Ask an admin.';
    if (e.includes('429') || e.includes('too many') || e.includes('rate limit'))
      return 'Too many requests in a short time. Wait a minute; the app will retry by itself.';
    if (e.includes('network') || e.includes('failed to fetch') || e.includes('unreachable'))
      return 'The server could not be reached. Check the internet connection; the app will retry by itself.';
    if (e.includes('http 404') || e.includes('http 500') || e.includes('http 502') || e.includes('unreadable') || e.includes('not configured') || e.includes('deployment'))
      return 'The Google Apps Script web app did not answer correctly. Check GOOGLE_APPS_SCRIPT_URL on the server and that the script is deployed as a Web App with access "Anyone".';
    if (e.includes('lock'))
      return 'The sheet was busy with another save. The app will retry by itself.';
    return 'The Google Sheet rejected this change. The message above is what the sheet returned.';
  };

  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      const res = await syncAllDataNow();
      setTestResult(res.message);
      setFailedLog(null);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleForceSync = async () => {
    setIsManualSyncing(true);
    try {
      const res = await syncAllDataNow();
      setTestResult(res.message);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handlePullFromSheet = async () => {
    setIsManualSyncing(true);
    setTestResult(null);
    try {
      const res = await pullAllDataFromGoogleSheet();
      if (res.success) {
        const countsStr = Object.entries(res.counts || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
        setTestResult(`Pulled live data from Google Sheet! (${countsStr || 'All sheets synchronized'})`);
      } else {
        setTestResult(`Pull failed: ${res.error || 'Check internet connection'}`);
      }
    } catch (e: any) {
      setTestResult(`Pull error: ${e?.message}`);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handlePurgeTemp = async () => {
    if (!window.confirm('Wipe any local temporary cached items and freshly load everything from your Google Sheet?')) return;
    setIsManualSyncing(true);
    setTestResult(null);
    try {
      purgeTemporaryMockDataFromStorage(true);
      const res = await pullAllDataFromGoogleSheet();
      if (res.success) {
        setTestResult('Temporary data wiped! Live Google Sheet data restored.');
      } else {
        setTestResult(`Restoration notice: ${res.error}`);
      }
    } finally {
      setIsManualSyncing(false);
    }
  };

  const getRelativeTime = (timeStr?: string) => {
    if (!timeStr) return 'Never';
    try {
      const date = new Date(timeStr);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return timeStr;
    }
  };

  const settings = getSettings();

  return (
    <>
      {/* 1. Full Card Variant (for Sidebars and Dashboards) */}
      {variant === 'full' ? (
        <div 
          onClick={() => setIsModalOpen(true)}
          className={cn(
            "p-2.5 rounded-xl border transition-all cursor-pointer select-none text-left shadow-2xs group hover:shadow-xs",
            status.state === 'SAVING' && "bg-red-50/70 border-red-300 ring-1 ring-red-400/30",
            status.state === 'SAVED' && "bg-emerald-50/50 border-emerald-300 hover:bg-emerald-50",
            status.state === 'QUEUED' && "bg-amber-50/60 border-amber-300",
            status.state === 'OFFLINE' && "bg-slate-50 border-slate-300",
            status.state === 'ERROR' && "bg-red-100/70 border-red-300",
            status.state === 'IDLE' && "bg-slate-50 border-slate-200",
            className
          )}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {status.state === 'SAVING' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                )}
                {status.state === 'SAVED' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  status.state === 'SAVING' ? "bg-red-600" :
                  status.state === 'SAVED' ? "bg-emerald-600" :
                  status.state === 'QUEUED' ? "bg-amber-500" :
                  status.state === 'OFFLINE' ? "bg-slate-400" :
                  status.state === 'ERROR' ? "bg-red-600" : "bg-emerald-500"
                )}></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">Google Sheet Sync</span>
            </div>
            <span className={cn(
              "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border",
              status.state === 'SAVING' && "bg-red-100 text-red-800 border-red-300 animate-pulse",
              status.state === 'SAVED' && "bg-emerald-100 text-emerald-800 border-emerald-300",
              status.state === 'QUEUED' && "bg-amber-100 text-amber-800 border-amber-300",
              status.state === 'OFFLINE' && "bg-slate-200 text-slate-800 border-slate-300",
              status.state === 'ERROR' && "bg-red-200 text-red-900 border-red-300",
              status.state === 'IDLE' && "bg-slate-100 text-slate-700 border-slate-200"
            )}>
              {status.state === 'SAVED' ? 'Data Saved' :
               status.state === 'SAVING' ? 'Background Sync' :
               status.state === 'QUEUED' ? `${status.pendingCount} Queued` :
               status.state === 'OFFLINE' ? 'Offline' :
               status.state === 'ERROR' ? 'Sync Error' : 'Connected'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-600 font-medium truncate max-w-[120px]" title={status.sheetName || 'Warsa Beverage'}>
              {status.sheetName || 'Warsa Beverage'}
            </span>
            <span className="text-[10px] text-slate-400">
              {getRelativeTime(status.lastSyncTime)}
            </span>
          </div>
        </div>
      ) : (
        /* Header Runtime Badge */
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border select-none",
            status.state === 'SAVING' && "bg-red-50 text-red-700 border-red-300 animate-pulse",
            status.state === 'SAVED' && "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100",
            status.state === 'QUEUED' && "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100",
            status.state === 'OFFLINE' && "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200",
            status.state === 'ERROR' && "bg-red-100 text-red-900 border-red-300 hover:bg-red-200",
            status.state === 'IDLE' && "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
            className
          )}
          title="Google Sheet live sync runtime status. Click for details."
        >
          {status.state === 'SAVING' && (
            <>
              <Cloud className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="font-bold">Background Sync</span>
            </>
          )}

          {status.state === 'SAVED' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-bold">Sheet: Saved</span>
              <span className="text-[10px] text-emerald-700 opacity-80 hidden sm:inline">
                ({getRelativeTime(status.lastSyncTime)})
              </span>
            </>
          )}

          {status.state === 'QUEUED' && (
            <>
              <Cloud className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-bold">{status.pendingCount} Queued</span>
            </>
          )}

          {status.state === 'OFFLINE' && (
            <>
              <WifiOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-bold">Offline (Cached)</span>
            </>
          )}

          {status.state === 'ERROR' && (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="font-bold">Sheet Sync Alert</span>
            </>
          )}

          {status.state === 'IDLE' && (
            <>
              <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Sheet: Connected</span>
            </>
          )}
        </button>
      )}

      {/* 2. Live Runtime Floating Notification Pill (rendered once on primary instance) */}
      {toastMessage && variant === 'full' && (
        <div 
          className="fixed bottom-20 md:bottom-4 right-4 z-40 animate-in slide-in-from-bottom-3 fade-in duration-200 max-w-sm pointer-events-auto"
          onClick={() => setIsModalOpen(true)}
        >
          <div className={cn(
            "p-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold cursor-pointer transition-transform hover:scale-[1.02]",
            toastMessage.type === 'saving' && "bg-white text-red-700 border-red-300 ring-2 ring-red-500/20",
            toastMessage.type === 'saved' && "bg-white text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20",
            toastMessage.type === 'error' && "bg-white text-red-800 border-red-300 ring-2 ring-red-500/20"
          )}>
            {toastMessage.type === 'saving' && (
              <RefreshCw className="w-4 h-4 text-red-600 animate-spin shrink-0" />
            )}
            {toastMessage.type === 'saved' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            {toastMessage.type === 'error' && (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <div className="flex-1">
              <p className="line-clamp-2 leading-tight">{toastMessage.text}</p>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">LIVE</span>
          </div>
        </div>
      )}

      {/* 3. Detailed Runtime Sync Status Modal */}
      <ResponsiveDialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Google Sheet Live Synchronization Status"
        subtitle="Real-time runtime tracking for cloud backend updates and offline persistence"
        className="max-w-xl"
      >
        <div className="space-y-4">
          {/* Status Overview Card */}
          <div className={cn(
            "p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3",
            status.state === 'SAVING' && "bg-red-50/70 border-red-200",
            status.state === 'SAVED' && "bg-emerald-50/70 border-emerald-200",
            status.state === 'QUEUED' && "bg-amber-50/70 border-amber-200",
            status.state === 'OFFLINE' && "bg-slate-50 border-slate-200",
            status.state === 'ERROR' && "bg-red-50/80 border-red-200",
            status.state === 'IDLE' && "bg-slate-50 border-slate-200"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs",
                status.state === 'SAVING' && "bg-red-600 text-white",
                status.state === 'SAVED' && "bg-emerald-600 text-white",
                status.state === 'QUEUED' && "bg-amber-500 text-white",
                status.state === 'OFFLINE' && "bg-slate-600 text-white",
                status.state === 'ERROR' && "bg-red-600 text-white",
                status.state === 'IDLE' && "bg-slate-700 text-white"
              )}>
                {status.state === 'SAVING' && <RefreshCw className="w-5 h-5 animate-spin" />}
                {status.state === 'SAVED' && <CheckCircle2 className="w-5 h-5" />}
                {status.state === 'QUEUED' && <Cloud className="w-5 h-5" />}
                {status.state === 'OFFLINE' && <WifiOff className="w-5 h-5" />}
                {status.state === 'ERROR' && <AlertTriangle className="w-5 h-5" />}
                {status.state === 'IDLE' && <Database className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">
                    {status.state === 'SAVING' && 'Background Synchronization Active'}
                    {status.state === 'SAVED' && 'Data is Saved in Google Sheet'}
                    {status.state === 'QUEUED' && 'Mutations Queued in Local Cache'}
                    {status.state === 'OFFLINE' && 'Offline Mode (IndexedDB Active)'}
                    {status.state === 'ERROR' && 'Synchronization Issue Detected'}
                    {status.state === 'IDLE' && 'Cloud Backend Ready'}
                  </h3>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                    status.state === 'SAVED' ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                    status.state === 'SAVING' ? "bg-red-100 text-red-800 border-red-300 animate-pulse" :
                    status.state === 'ERROR' ? "bg-red-100 text-red-900 border-red-300" :
                    "bg-slate-100 text-slate-700 border-slate-300"
                  )}>
                    {status.state}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Connected Sheet: <strong className="text-slate-900">{status.sheetName || 'Warsa Beverage'}</strong>
                </p>
              </div>
            </div>

            <div className="text-right sm:border-l sm:pl-4 border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Last Saved</span>
              <span className="text-xs font-bold text-slate-800">
                {getRelativeTime(status.lastSyncTime)}
              </span>
            </div>
          </div>

          {/* Details Specifications */}
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Spreadsheet Target</span>
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {status.sheetName || 'Warsa Beverage'} (Google Sheets)
              </span>
            </div>

            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Exact Timestamp</span>
              <span className="font-medium text-slate-800">
                {status.lastSyncTime ? format(new Date(status.lastSyncTime), 'yyyy-MM-dd HH:mm:ss') : 'None recorded yet'}
              </span>
            </div>

            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Internet Connectivity</span>
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                {status.isOnline ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Online
                  </span>
                ) : (
                  <span className="text-red-600 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-600"></span> Offline
                  </span>
                )}
              </span>
            </div>

            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">In-Flight Queue</span>
              <span className="font-semibold text-slate-800">
                {status.pendingCount} pending mutation(s)
              </span>
            </div>
          </div>

          {/* Test Feedback Notice */}
          {testResult && (
            <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-lg text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-red-600 shrink-0" />
              <span>{testResult}</span>
            </div>
          )}

          {/* Recent Live Activity Stream */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Recent Sync Activity Log</span>
              <span className="text-[10px] text-slate-500">Last 15 operations</span>
            </div>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1.5 text-xs">
              {(!status.recentLogs || status.recentLogs.length === 0) ? (
                <p className="text-slate-400 text-center py-4 text-xs italic">
                  No sync events recorded yet in this session. Edits will appear here in real-time.
                </p>
              ) : (
                status.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => log.status === 'FAILED' && setFailedLog(log)}
                    role={log.status === 'FAILED' ? 'button' : undefined}
                    className={cn(
                      "bg-white p-2 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2 shadow-2xs",
                      log.status === 'FAILED' && "cursor-pointer border-red-200 hover:bg-red-50/60"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {log.status === 'SAVED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      {log.status === 'SAVING' && <RefreshCw className="w-3.5 h-3.5 text-red-600 animate-spin shrink-0" />}
                      {log.status === 'QUEUED' && <Cloud className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      {log.status === 'FAILED' && <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-[11px] text-slate-900 block truncate">
                          {log.action} {log.targetId ? `(${log.targetId})` : ''}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {format(new Date(log.timestamp), 'HH:mm:ss')} &bull; {log.status === 'SAVED' ? 'Successfully saved to sheet' : log.status === 'FAILED' ? 'Failed - tap to see why' : log.status}
                        </span>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded",
                      log.status === 'SAVED' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                      log.status === 'SAVING' && "bg-red-50 text-red-700 border border-red-200",
                      log.status === 'QUEUED' && "bg-amber-50 text-amber-700 border border-amber-200",
                      log.status === 'FAILED' && "bg-red-50 text-red-700 border border-red-200"
                    )}>
                      {log.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePullFromSheet}
                disabled={isManualSyncing || isTesting}
                className="text-xs border-slate-300 hover:bg-red-50 hover:text-red-700 gap-1.5 font-bold"
              >
                <DownloadCloud className={cn("w-3.5 h-3.5 text-red-600", isManualSyncing && "animate-bounce")} />
                Pull from Sheet
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleForceSync}
                disabled={isManualSyncing || isTesting}
                className="text-xs border-slate-300 hover:bg-slate-100 gap-1.5"
              >
                <Server className="w-3.5 h-3.5 text-slate-600" />
                {isManualSyncing ? 'Syncing...' : 'Sync Pending'}
              </Button>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    
      <ResponsiveDialog
        isOpen={!!failedLog}
        onClose={() => setFailedLog(null)}
        title="Sync Failed"
        subtitle="Why this record did not reach the Google Sheet"
      >
        {failedLog && (
          <div className="space-y-4 pb-10 md:pb-0 text-sm">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
              <div className="p-3 flex justify-between gap-3">
                <span className="text-slate-500 font-medium">Record type</span>
                <span className="font-mono font-bold text-slate-900">{failedLog.action}</span>
              </div>
              <div className="p-3 flex justify-between gap-3">
                <span className="text-slate-500 font-medium">Invoice / Record ID</span>
                <span className="font-mono font-bold text-slate-900">{failedLog.targetId || 'n/a'}</span>
              </div>
              <div className="p-3 flex justify-between gap-3">
                <span className="text-slate-500 font-medium">Failed at</span>
                <span className="font-medium text-slate-800">{format(new Date(failedLog.timestamp), 'yyyy-MM-dd HH:mm:ss')}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-900 mb-1">Error returned</p>
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 p-3 text-xs font-mono break-words whitespace-pre-wrap">
                {failedLog.error || 'No error text recorded.'}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-900 mb-1">What to do</p>
              <p className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 text-xs leading-relaxed">
                {explainFailure(failedLog.error)}
              </p>
            </div>

            <p className="text-[11px] text-slate-500">
              Your data is safe on this device. Failed saves stay in the offline queue and are retried automatically.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setFailedLog(null)}>Close</Button>
              <Button size="sm" disabled={isRetrying} onClick={handleRetryFailed} className="bg-red-600 hover:bg-red-700 text-white font-bold">
                {isRetrying ? 'Retrying...' : 'Retry Now'}
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}

function formatActionName(action?: string, targetId?: string): string {
  if (!action) return 'Record';
  if (action.includes('Sale')) return `Order ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Inventory')) return `Product ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Outlet')) return `Customer Outlet ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Dispatch')) return `Dispatch Load ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('CashSlip')) return `Cash Slip ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Payment')) return `Payment Voucher ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Closing')) return `Daily Closing ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('Route')) return `Route ${targetId ? `#${targetId}` : ''}`;
  if (action.includes('User')) return `User Account ${targetId ? `#${targetId}` : ''}`;
  return action;
}