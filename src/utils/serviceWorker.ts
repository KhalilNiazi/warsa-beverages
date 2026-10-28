/**
 * WARSA KFM Beverages - Service Worker Registration & Online Synchronization Listener
 */

import { syncPendingMutations } from './indexedDB';

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Check for updates
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // New update available
                  window.dispatchEvent(new CustomEvent('warsa_sw_update_available'));
                }
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn('[ServiceWorker] Registration notice:', err);
      });
  });

  // Listen to message from Service Worker (e.g. background sync event)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
      syncPendingMutations().catch(console.warn);
    }
  });

  // Listen to browser network transitions
  window.addEventListener('online', () => {
    // Notify app
    window.dispatchEvent(new CustomEvent('warsa_network_status_changed', { detail: { online: true } }));
    // Immediately attempt to sync any pending mutations
    syncPendingMutations().catch(console.warn);
  });

  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('warsa_network_status_changed', { detail: { online: false } }));
  });
}
