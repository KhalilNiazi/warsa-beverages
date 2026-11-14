/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Settings, 
  Droplet, 
  Store, 
  Menu, 
  X, 
  User, 
  Truck, 
  ClipboardCheck, 
  BookOpen, 
  LogOut, 
  Lock, 
  KeyRound, 
  ShieldCheck,
  UserCheck,
  Banknote
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Sales } from './pages/Sales';
import { Dispatch } from './pages/Dispatch';
import { Reconciliation } from './pages/Reconciliation';
import { SettingsPage } from './pages/Settings';
import { Outlets } from './pages/Outlets';
import { OrderBookers } from './pages/OrderBookers';
import { DailyReport } from './pages/DailyReport';
import { Ledger } from './pages/Ledger';
import { CashSlipBook } from './pages/CashSlipBook';
import { AppPageId, AppUserProfile } from './types';
import { 
  getCurrentUser, 
  logoutUser, 
  setCurrentUser as setStoredCurrentUser, 
  isSuperAdmin,
  migrateUsersToHashedCredentials,
  seedIndexedDBFromLocalStorage,
  purgeTemporaryMockDataFromStorage,
  ensureDataFetchedFromGoogleSheet,
  initFirestoreDataSync,
  pullAllDataFromGoogleSheet,
  getAppUserById,
  getAppUsers,
  saveAppUsers,
  getUserAllowedPages
} from './api';
import { startAutoSync } from './utils/autoSync';
import { RoleSelectPinScreen } from './components/RoleSelectPinScreen';
import { ChangePinModal } from './components/ChangePinModal';
import { OfflineSyncBanner } from './components/OfflineSyncBanner';
import { InstallPwaButton } from './components/InstallPwaButton';
import { GoogleSheetSyncStatus } from './components/GoogleSheetSyncStatus';
import { Button } from './components/ui/button';
import { auth, mapFirebaseUserToProfile, signOutFirebase } from './lib/firebase';
import { fetchUsersFromFirestore, subscribeToFirestoreUsers } from './lib/firestoreSync';
import { onAuthStateChanged } from 'firebase/auth';

export type Page = AppPageId;

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Automatic Google Sheet sync (push pending changes + periodic pull) while signed in
  useEffect(() => {
    if (!currentUser) return;
    return startAutoSync({ canPull: true, pull: () => pullAllDataFromGoogleSheet() });
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    let unsubscribeUsers: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !fbUser.isAnonymous) {
        try {
          const mappedProfile = await mapFirebaseUserToProfile(fbUser);
          const cloudUsers = await fetchUsersFromFirestore();
          const savedProfile = cloudUsers.find(user => user.id === fbUser.uid) || getAppUserById(fbUser.uid);
          const profile: AppUserProfile = {
            ...mappedProfile,
            ...(savedProfile || {}),
            id: mappedProfile.id,
            role: mappedProfile.role,
            modulePermissions: savedProfile?.modulePermissions
          };
          profile.allowedPages = getUserAllowedPages(profile);
          if (profile.allowedPages.length === 0) {
            setCurrentUser(null);
            setIsCheckingAuth(false);
            return;
          }
          const cachedUsers = getAppUsers();
          const cachedUserIndex = cachedUsers.findIndex(user => user.id === profile.id);
          if (cachedUserIndex >= 0) cachedUsers[cachedUserIndex] = { ...cachedUsers[cachedUserIndex], ...profile };
          else cachedUsers.push(profile);
          saveAppUsers(cachedUsers);
          setCurrentUser(profile);
          setStoredCurrentUser(profile);
          setCurrentPage(page => profile.allowedPages.includes(page) ? page : (profile.defaultPage || profile.allowedPages[0] || 'dashboard'));
          if (profile.allowedPages.length > 0) {
            migrateUsersToHashedCredentials().catch(err => console.warn('[Auth] Credential migration notice:', err));
            purgeTemporaryMockDataFromStorage();
            ensureDataFetchedFromGoogleSheet(true).catch(err => console.warn('[Google Sheet] Startup sync notice:', err));
            seedIndexedDBFromLocalStorage();
            initFirestoreDataSync().catch(err => console.warn('[Firestore] Startup sync notice:', err));
            unsubscribeUsers = subscribeToFirestoreUsers((cloudUsers) => {
              if (cloudUsers.length > 0) localStorage.setItem('warsa_app_users_v2', JSON.stringify(cloudUsers));
            });
          }
        } catch (error) {
          console.error('[Auth] Could not load Firebase account profile:', error);
          setCurrentUser(null);
          await signOutFirebase().catch(signOutError => {
            console.error('[Auth] Could not clear invalid Firebase session:', signOutError);
          });
        }
      } else {
        // App cannot be opened without a verified Firebase account login
        setCurrentUser(null);
      }
      setIsCheckingAuth(false);
    });

    return () => {
      unsubscribe();
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, []);

  useEffect(() => {
    const handleNavigate = (e: CustomEvent<Page>) => {
      if (e.detail) {
        if (currentUser && getUserAllowedPages(currentUser).includes(e.detail)) {
          setCurrentPage(e.detail);
        } else if (!currentUser) {
          setCurrentPage(e.detail);
        }
      }
    };
    window.addEventListener('navigate_page' as any, handleNavigate);
    return () => window.removeEventListener('navigate_page' as any, handleNavigate);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) localStorage.setItem('warsa_current_page_v3', currentPage);
  }, [currentPage, currentUser]);

  const handleAuthenticated = (user: AppUserProfile) => {
    setCurrentUser(user);
    setStoredCurrentUser(user);
    const allowedPages = getUserAllowedPages(user);
    setCurrentPage(user.defaultPage || allowedPages[0] || 'dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOutFirebase();
    } catch (err) {
      console.error('Firebase signOut error:', err);
    }
    logoutUser();
    setCurrentUser(null);
    setIsMobileMenuOpen(false);
  };

  const navSections = [
    {
      title: 'Core Operations',
      items: [
        { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'dispatch' as Page, label: 'Deliveries & Loading', icon: Truck },
        { id: 'reconciliation' as Page, label: 'Daily Closing (Hisaab)', icon: ClipboardCheck },
        { id: 'cashSlipBook' as Page, label: 'Cash Slip Book', icon: Banknote },
      ]
    },
    {
      title: 'Inventory & Orders',
      items: [
        { id: 'inventory' as Page, label: 'Warehouse Stock', icon: Package },
        { id: 'sales' as Page, label: 'Booked Orders', icon: ShoppingCart },
        { id: 'reports' as Page, label: 'Daily Sales Report', icon: Droplet },
      ]
    },
    {
      title: 'Accounts & Khata',
      items: [
        { id: 'outlets' as Page, label: 'Shops & Customers', icon: Store },
        { id: 'ledger' as Page, label: 'Customer Ledger & Cash', icon: BookOpen },
        { id: 'orderBookers' as Page, label: 'Order Bookers (Sales)', icon: User },
      ]
    },
    {
      title: 'Administration',
      items: [
        { id: 'settings' as Page, label: 'Settings & Security', icon: Settings },
      ]
    }
  ];

  // Role-based Navigation items filtered by currentUser.allowedPages
  const allowedSet = new Set(currentUser ? getUserAllowedPages(currentUser) : ['dashboard']);
  const allNavItems = navSections.flatMap(s => s.items);
  const navItems = allNavItems.filter(item => allowedSet.has(item.id));
  
  const allBottomNavItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales' as Page, label: 'Orders', icon: ShoppingCart },
    { id: 'dispatch' as Page, label: 'Delivery', icon: Truck },
    { id: 'cashSlipBook' as Page, label: 'Cash Slip', icon: Banknote },
    { id: 'reconciliation' as Page, label: 'Closing', icon: ClipboardCheck },
    { id: 'ledger' as Page, label: 'Ledger', icon: BookOpen },
    { id: 'outlets' as Page, label: 'Shops', icon: Store }
  ];
  const bottomNavItems = allBottomNavItems.filter(item => allowedSet.has(item.id));

  const renderPage = () => {
    // Role guard: if current page is not allowed for this role, show fallback
    if (currentUser && !allowedSet.has(currentPage)) {
      return (
        <div className="p-8 text-center max-w-md mx-auto mt-16 space-y-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
          <p className="text-sm text-gray-600">
            Your role (<span className="font-semibold text-gray-900">{currentUser.roleTitle}</span>) is not permitted to access this module.
          </p>
          <Button onClick={() => setCurrentPage(currentUser.defaultPage || (navItems[0]?.id as Page) || 'dashboard')} className="bg-red-600 hover:bg-red-700 text-white">
            Return to Authorized View
          </Button>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'dispatch': return <Dispatch />;
      case 'reconciliation': return <Reconciliation />;
      case 'cashSlipBook': return <CashSlipBook />;
      case 'inventory': return <Inventory />;
      case 'outlets': return <Outlets />;
      case 'ledger': return <Ledger />;
      case 'sales': return <Sales />;
      case 'reports': return <DailyReport />;
      case 'orderBookers': return <OrderBookers />;
      case 'settings': return <SettingsPage currentUser={currentUser} />;
      default: return <Dashboard />;
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Droplet className="h-10 w-10 text-red-600 animate-bounce" />
          <span className="text-sm font-bold tracking-wider text-slate-800">Loading WARSA System...</span>
        </div>
      </div>
    );
  }

  // By default, the app CANNOT be opened without an authenticated Firebase account!
  if (!currentUser || !auth.currentUser || auth.currentUser.isAnonymous) {
    return <RoleSelectPinScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-white flex flex-col md:flex-row font-sans print:h-auto print:overflow-visible print:block">
      {/* Mobile Top Header - Clean Light White & Red Theme */}
      <div className="md:hidden print:hidden bg-white text-slate-900 px-3.5 py-2.5 flex items-center justify-between sticky top-0 z-20 border-b border-red-100 shadow-xs">
        <div className="flex items-center gap-2.5">
          <button 
            id="mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(true)} 
            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-xs">
              <Droplet className="h-4 w-4 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xs leading-none tracking-tight text-slate-900 uppercase">
                KFM BEVERAGES
              </span>
              <span className="text-[9px] text-red-600 font-extrabold tracking-wider uppercase mt-0.5">
                WARSA Operations
              </span>
            </div>
          </div>
        </div>

        {/* User Tag & Lock Screen */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <GoogleSheetSyncStatus variant="badge" className="text-[10px] py-0.5 px-2 font-bold shrink-0" />
          <div className="text-right hidden sm:block">
            <span className="block text-[11px] font-bold leading-tight text-slate-900 truncate max-w-[100px]">
              {currentUser.name}
            </span>
            <span className="block text-[9px] text-red-600 font-bold uppercase truncate max-w-[100px]">
              {currentUser.roleTitle || currentUser.role}
            </span>
          </div>
          <button
            id="mobile-lock-btn"
            onClick={handleLogout}
            title="Lock App"
            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 flex items-center justify-center transition-colors"
          >
            <Lock className="h-4 w-4 text-red-600" />
          </button>
        </div>
      </div>
      
      {/* Mobile Slide Navigation (Drawer) - Clean Light Red & White */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex flex-col w-72 max-w-[85%] bg-white border-r border-red-100 text-slate-900 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Header with User Info */}
            <div className="p-4 border-b border-red-100 bg-red-50/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-xs">
                    <Droplet className="h-4 w-4 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs tracking-wider text-slate-900 uppercase">KFM BEVERAGES</h3>
                    <p className="text-[9px] text-red-600 font-bold">WARSA Water Distribution</p>
                  </div>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded text-slate-400 hover:text-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Logged in User Card */}
              <div className="bg-white border border-red-200/80 p-2.5 rounded-xl flex items-center gap-2.5 shadow-2xs">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs", currentUser.avatarColor)}>
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold truncate text-slate-900 leading-tight">{currentUser.name}</h4>
                  <p className="text-[10px] text-red-600 font-bold truncate mt-0.5">{currentUser.roleTitle || currentUser.role}</p>
                </div>
              </div>
            </div>

            {/* Nav list with Sections */}
            <nav className="flex-1 p-3 space-y-4 overflow-y-auto no-scrollbar">
              {navSections.map((section, sIdx) => {
                const sectionItems = section.items.filter(item => allowedSet.has(item.id));
                if (sectionItems.length === 0) return null;
                return (
                  <div key={sIdx} className="space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-black text-red-600 uppercase tracking-wider">
                      {section.title}
                    </div>
                    {sectionItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setCurrentPage(item.id as Page);
                            setIsMobileMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left",
                            isActive
                              ? "bg-red-600 text-white font-bold shadow-xs"
                              : "text-slate-600 hover:bg-red-50 hover:text-red-700"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-slate-400")} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            {/* Bottom Actions - PIN change only for Super Admin */}
            <div className="p-3 border-t border-red-100 bg-red-50/40 space-y-1">
              {isSuperAdmin(currentUser) && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsChangePinOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-red-200"
                >
                  <KeyRound className="h-4 w-4 text-red-600" />
                  <span>Change Security PIN</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-100/60 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4 text-red-600" />
                <span>Switch / Lock System</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar - Pure Red & White Light Theme */}
      <aside className="hidden md:flex print:hidden flex-col w-64 bg-white border-r border-red-100 text-slate-800 flex-shrink-0 z-10 sticky top-0 h-screen shadow-2xs">
        {/* Brand Lockup */}
        <div className="p-4 border-b border-red-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-600/20 shrink-0">
              <Droplet className="h-4.5 w-4.5 fill-current" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-black text-xs tracking-wider text-slate-900 uppercase leading-none">
                KFM BEVERAGES
              </span>
              <span className="text-[10px] text-red-600 font-extrabold tracking-wider uppercase mt-1 leading-none">
                WARSA Pure Water
              </span>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" title="System Online" />
        </div>

        {/* Current Active User Profile Banner - Light Red Tinted Card */}
        <div className="p-2.5 mx-3 mt-3 bg-red-50/60 border border-red-200/80 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs", currentUser.avatarColor)}>
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold truncate text-slate-900 leading-tight">
                {currentUser.name}
              </h4>
              <span className="inline-block text-[10px] font-bold text-red-600 uppercase tracking-wider truncate">
                {currentUser.roleTitle || currentUser.role}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-red-200/60 flex items-center justify-between text-[11px]">
            {isSuperAdmin(currentUser) ? (
              <button
                id="change-pin-btn"
                onClick={() => setIsChangePinOpen(true)}
                className="text-slate-600 hover:text-red-700 flex items-center gap-1 text-[10px] font-semibold transition-colors"
                title="Change Security PIN"
              >
                <KeyRound className="h-3 w-3 text-red-600" />
                <span>PIN</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500 font-medium">
                {currentUser.role === 'ASM' ? '👁️ Read-Only' : currentUser.role === 'ORDER_BOOKER' ? '📋 Booker' : '🚚 Salesman'}
              </span>
            )}
            <button
              id="lock-switch-btn"
              onClick={handleLogout}
              className="text-red-700 hover:text-white font-bold flex items-center gap-1 text-[10px] transition-all bg-white hover:bg-red-600 px-2.5 py-0.5 rounded-lg border border-red-200 shadow-2xs"
              title="Switch Account / Lock"
            >
              <Lock className="h-3 w-3" />
              <span>Lock</span>
            </button>
          </div>
        </div>

        {/* Live Google Sheet Real-time Sync Status Widget in Sidebar */}
        <div className="mx-3 mt-2.5">
          <GoogleSheetSyncStatus variant="full" />
        </div>
        
        {/* Navigation Sectioned List */}
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto no-scrollbar">
          {navSections.map((section, sIdx) => {
            const sectionItems = section.items.filter(item => allowedSet.has(item.id));
            if (sectionItems.length === 0) return null;
            return (
              <div key={sIdx} className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-black text-red-600 uppercase tracking-wider">
                  {section.title}
                </div>
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`nav-item-${item.id}`}
                      onClick={() => setCurrentPage(item.id as Page)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left group",
                        isActive 
                          ? "bg-red-600 text-white font-bold shadow-sm shadow-red-600/20" 
                          : "text-slate-600 hover:text-red-700 hover:bg-red-50/70"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-white" : "text-slate-400 group-hover:text-red-600")} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer info in desktop sidebar */}
        <div className="p-3 border-t border-red-100 bg-white text-[10px] text-slate-500 flex items-center justify-between">
          <span className="truncate">Plant: Saddar Bazar, Lahore</span>
          <span className="font-mono text-red-600 font-bold">v3.2</span>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden print:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 flex justify-around pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as Page)}
              className={cn(
                "flex flex-col items-center justify-center w-full py-2 space-y-0.5 transition-colors",
                isActive ? "text-red-600 font-bold" : "text-gray-500 hover:text-gray-900"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive ? "text-red-600" : "text-gray-400")} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full relative overflow-y-auto pb-28 md:pb-8 no-scrollbar print:overflow-visible print:h-auto print:block">
        {/* Unified Non-Overlapping Sticky Header Container */}
        <div className="sticky top-0 z-30 bg-white print:hidden">
          {/* Desktop Top Status Bar with Live Google Sheet Sync Status */}
          <div className="hidden md:flex bg-white/95 backdrop-blur-xs border-b border-red-100 px-6 py-2.5 items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                {navItems.find(i => i.id === currentPage)?.label || 'Dashboard'}
                <span className="text-[10px] text-red-600 font-extrabold uppercase bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                  WARSA Pure Water
                </span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-500">
                Plant: Saddar Bazar, Lahore &bull; {currentUser.name} ({currentUser.roleTitle || currentUser.role})
              </span>
            </div>

            <div className="flex items-center gap-3">
              <InstallPwaButton />
              <GoogleSheetSyncStatus variant="badge" />
            </div>
          </div>

          {/* Offline Connectivity & Synchronization Status Banner */}
          <OfflineSyncBanner />

          {/* Contextual Role Banners - Light Red & White Theme */}
          {currentUser.role === 'ASM' && (
            <div className="bg-red-50 text-red-950 border-b border-red-200 px-4 py-2 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase shrink-0 shadow-2xs">ASM Mode</span>
                <span className="text-[11px] text-red-900">Area Sales Manager (Read-Only Inspection): All company operations, closing numbers, and reports are visible. Editing and deletion are restricted.</span>
              </div>
            </div>
          )}
          {currentUser.role === 'ORDER_BOOKER' && (
            <div className="bg-red-50 text-red-950 border-b border-red-200 px-4 py-2 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase shrink-0 shadow-2xs">Order Booker</span>
                <span className="text-[11px] text-red-900">Assigned Route: <strong className="text-red-950 font-bold">{currentUser.assignedRoute || 'Route 1 - Cantt'}</strong> &bull; Book Orders, manage customer ledgers, and monitor vehicle load-out.</span>
              </div>
            </div>
          )}
          {currentUser.role === 'SALESMAN' && (
            <div className="bg-red-50 text-red-950 border-b border-red-200 px-4 py-2 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase shrink-0 shadow-2xs">Salesman / Driver</span>
                <span className="text-[11px] text-red-900">Active Route: <strong className="text-red-950 font-bold">{currentUser.assignedRoute || 'Route 1 & 2'}</strong> &bull; Full Read/Write for Deliveries &amp; Loading, Return Bottles, and Cash Slip Settlement.</span>
              </div>
            </div>
          )}
        </div>

        {renderPage()}
      </main>

      {/* Change PIN Modal */}
      {isChangePinOpen && currentUser && (
        <ChangePinModal
          isOpen={isChangePinOpen}
          onClose={() => setIsChangePinOpen(false)}
          currentUser={currentUser}
          onPinUpdated={() => {
            const updated = getCurrentUser();
            if (updated) setCurrentUser(updated);
          }}
        />
      )}
    </div>
  );
}