import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  deleteDoc, 
  getDocFromServer,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth, ensureFirebaseAuth } from './firebase';
import { AppUserProfile } from '@/src/types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Fetch all documents from a Firestore collection.
 */
export async function getCollectionFromFirestore<T>(collectionName: string): Promise<T[]> {
  await ensureFirebaseAuth();
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    const results: T[] = [];
    snapshot.forEach(docSnap => {
      results.push(docSnap.data() as T);
    });
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

/**
 * Fetch a single document by ID from Firestore.
 */
export async function getDocumentFromFirestore<T>(collectionName: string, docId: string): Promise<T | null> {
  await ensureFirebaseAuth();
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, String(docId));
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return snapshot.data() as T;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Save or update a document in Firestore.
 */
export async function saveDocumentToFirestore<T extends Record<string, any>>(
  collectionName: string, 
  docId: string, 
  data: T
): Promise<void> {
  await ensureFirebaseAuth();
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, String(docId));
    // Clean undefined values for clean Firestore storage
    const cleaned = JSON.parse(JSON.stringify(data));
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete a document from Firestore.
 */
export async function deleteDocumentFromFirestore(
  collectionName: string, 
  docId: string
): Promise<void> {
  await ensureFirebaseAuth();
  const path = `${collectionName}/${docId}`;
  try {
    const docRef = doc(db, collectionName, String(docId));
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Tests live connection to Firestore using getDocFromServer (as required by skill)
 */
export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; databaseId: string; projectId: string }> {
  const databaseId = db.app.options.projectId || 'configured-project';
  const projectId = db.app.options.projectId || 'configured-project';
  try {
    await ensureFirebaseAuth();
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      success: true,
      message: 'Successfully connected to Firebase Firestore database!',
      databaseId,
      projectId
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return {
        success: false,
        message: 'Client is offline. Local offline store & IndexedDB are active.',
        databaseId,
        projectId
      };
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Firestore connection failed.',
      databaseId,
      projectId
    };
  }
}

/**
 * Specifically fetches all users and their passwords/hashes from Firestore.
 */
export async function fetchUsersFromFirestore(): Promise<AppUserProfile[]> {
  if (!auth.currentUser) return [];
  try {
    return await getCollectionFromFirestore<AppUserProfile>('users');
  } catch (error) {
    console.warn('[Firestore] Notice fetching users:', error);
    return [];
  }
}

/**
 * Specifically saves a user profile, passwords, and security credentials to Firestore.
 */
export async function saveUserToFirestore(user: AppUserProfile): Promise<void> {
  const docId = String(user.id || user.username || `user_${Date.now()}`);
  await saveDocumentToFirestore('users', docId, user);
}

/**
 * Subscribes to real-time changes in the Firestore 'users' collection.
 */
export function subscribeToFirestoreUsers(
  onUsersUpdate: (users: AppUserProfile[]) => void
): Unsubscribe | null {
  try {
    const colRef = collection(db, 'users');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const users: AppUserProfile[] = [];
        snapshot.forEach(docSnap => {
          users.push(docSnap.data() as AppUserProfile);
        });
        if (users.length > 0) {
          onUsersUpdate(users);
        }
      },
      (error) => {
        console.warn('[Firestore] users snapshot notice:', error);
      }
    );
  } catch {
    return null;
  }
}

/**
 * Automatically maps application mutation actions to appropriate Firestore collections
 * and persists them in real-time.
 */
export async function syncMutationToFirestore(action: string, payload: any): Promise<void> {
  if (!payload) return;
  try {
    let collectionName = '';
    let docId = '';

    if (action.includes('Sale') || action.includes('Invoice')) {
      collectionName = 'sales';
      docId = String(payload.ID || payload.id || `sale_${Date.now()}`);
    } else if (action.includes('Outlet')) {
      collectionName = 'outlets';
      docId = String(payload.ID || payload.id || payload.Code || `outlet_${Date.now()}`);
    } else if (action.includes('Inventory')) {
      collectionName = 'inventory';
      docId = String(payload.ID || payload.id || payload.SKU || `inv_${Date.now()}`);
    } else if (action.includes('Dispatch')) {
      collectionName = 'dispatchLoads';
      docId = String(payload.ID || payload.id || payload.LoadNumber || `load_${Date.now()}`);
    } else if (action.includes('CashSlip')) {
      collectionName = 'cashSlips';
      docId = String(payload.id || payload.ID || payload.slipNumber || `slip_${Date.now()}`);
    } else if (action.includes('Closing')) {
      collectionName = 'dailyClosings';
      docId = String(payload.ID || payload.id || payload.Date || `closing_${Date.now()}`);
    } else if (action.includes('Payment')) {
      collectionName = 'payments';
      docId = String(payload.ID || payload.id || `pay_${Date.now()}`);
    } else if (action.includes('StockInward')) {
      collectionName = 'stockInward';
      docId = String(payload.ID || payload.id || `inward_${Date.now()}`);
    } else if (action.includes('StockMovement')) {
      collectionName = 'stockMovements';
      docId = String(payload.ID || payload.id || `movement_${Date.now()}`);
    } else if (action.includes('User')) {
      collectionName = 'users';
      docId = String(payload.id || payload.ID || `user_${Date.now()}`);
    } else if (action.includes('Route')) {
      collectionName = 'routes';
      docId = String(payload.ID || payload.id || payload.Name || `route_${Date.now()}`);
    } else if (action.includes('OrderBooker')) {
      collectionName = 'orderBookers';
      docId = String(payload.ID || payload.id || `booker_${Date.now()}`);
    } else if (action.includes('Setting')) {
      collectionName = 'settings';
      docId = String(payload.ID || payload.id || 'system_settings');
    }

    if (!collectionName || !docId) return;

    if (action.startsWith('delete')) {
      await deleteDocumentFromFirestore(collectionName, docId);
    } else {
      await saveDocumentToFirestore(collectionName, docId, payload);
    }
  } catch (err) {
    console.warn('[Firestore Sync] Non-blocking mutation notice:', err);
  }
}

/**
 * Bulk pushes all local datasets and user accounts (with passwords & credentials)
 * into Firebase Firestore database collections.
 */
export async function pushAllDataToFirestore(datasets: {
  inventory: any[];
  sales: any[];
  outlets: any[];
  dispatchLoads: any[];
  cashSlips: any[];
  dailyClosings: any[];
  payments: any[];
  users?: AppUserProfile[];
  routes?: any[];
  orderBookers?: any[];
  settings?: any;
  stockInward?: any[];
  stockMovements?: any[];
}): Promise<{ success: boolean; counts: Record<string, number>; message: string }> {
  const counts: Record<string, number> = {
    inventory: 0,
    sales: 0,
    outlets: 0,
    dispatchLoads: 0,
    cashSlips: 0,
    dailyClosings: 0,
    payments: 0,
    users: 0,
    routes: 0,
    orderBookers: 0,
    stockInward: 0,
    stockMovements: 0,
    settings: 0
  };

  try {
    await ensureFirebaseAuth();

    // 1. Users & Passwords (Crucial per user request)
    for (const u of datasets.users || []) {
      const id = String(u.id || u.username);
      if (id) {
        await saveDocumentToFirestore('users', id, u);
        counts.users++;
      }
    }

    // 2. Inventory Items
    for (const item of datasets.inventory || []) {
      const id = String(item.ID || item.id || item.SKU);
      if (id) {
        await saveDocumentToFirestore('inventory', id, item);
        counts.inventory++;
      }
    }

    // 3. Sales & Bookings
    for (const sale of datasets.sales || []) {
      const id = String(sale.ID || sale.id);
      if (id) {
        await saveDocumentToFirestore('sales', id, sale);
        counts.sales++;
      }
    }

    // 4. Outlets
    for (const outlet of datasets.outlets || []) {
      const id = String(outlet.ID || outlet.id || outlet.Code);
      if (id) {
        await saveDocumentToFirestore('outlets', id, outlet);
        counts.outlets++;
      }
    }

    // 5. Dispatch Loads
    for (const load of datasets.dispatchLoads || []) {
      const id = String(load.ID || load.id || load.LoadNumber);
      if (id) {
        await saveDocumentToFirestore('dispatchLoads', id, load);
        counts.dispatchLoads++;
      }
    }

    // 6. Cash Slips
    for (const slip of datasets.cashSlips || []) {
      const id = String(slip.id || slip.ID || slip.slipNumber);
      if (id) {
        await saveDocumentToFirestore('cashSlips', id, slip);
        counts.cashSlips++;
      }
    }

    // 7. Daily Closings
    for (const closing of datasets.dailyClosings || []) {
      const id = String(closing.ID || closing.id || closing.Date);
      if (id) {
        await saveDocumentToFirestore('dailyClosings', id, closing);
        counts.dailyClosings++;
      }
    }

    // 8. Payments
    for (const pay of datasets.payments || []) {
      const id = String(pay.ID || pay.id);
      if (id) {
        await saveDocumentToFirestore('payments', id, pay);
        counts.payments++;
      }
    }

    // 9. Routes
    for (const route of datasets.routes || []) {
      const id = String(route.ID || route.id || route.Name);
      if (id) {
        await saveDocumentToFirestore('routes', id, route);
        counts.routes++;
      }
    }

    // 10. Order Bookers
    for (const booker of datasets.orderBookers || []) {
      const id = String(booker.ID || booker.id || booker.Name);
      if (id) {
        await saveDocumentToFirestore('orderBookers', id, booker);
        counts.orderBookers++;
      }
    }

    // 11. Stock Inward
    for (const inward of datasets.stockInward || []) {
      const id = String(inward.ID || inward.id);
      if (id) {
        await saveDocumentToFirestore('stockInward', id, inward);
        counts.stockInward++;
      }
    }

    // 12. Stock Movements
    for (const mov of datasets.stockMovements || []) {
      const id = String(mov.ID || mov.id);
      if (id) {
        await saveDocumentToFirestore('stockMovements', id, mov);
        counts.stockMovements++;
      }
    }

    // 13. Settings
    if (datasets.settings) {
      await saveDocumentToFirestore('settings', 'system_settings', datasets.settings);
      counts.settings = 1;
    }

    return {
      success: true,
      counts,
      message: 'All application datasets & passwords successfully stored in Firebase Firestore!'
    };
  } catch (error: any) {
    console.error('pushAllDataToFirestore error:', error);
    return {
      success: false,
      counts,
      message: error?.message || 'Failed to push all datasets to Firestore.'
    };
  }
}

/**
 * Pulls all records from Firebase Firestore collections into memory,
 * including user accounts, passwords, inventory, sales, outlets, etc.
 */
export async function pullAllDataFromFirestore(): Promise<{
  success: boolean;
  data: {
    inventory: any[];
    sales: any[];
    outlets: any[];
    dispatchLoads: any[];
    cashSlips: any[];
    dailyClosings: any[];
    payments: any[];
    users: AppUserProfile[];
    routes: any[];
    orderBookers: any[];
    stockInward: any[];
    stockMovements: any[];
    settings?: any;
  };
  counts: Record<string, number>;
  message: string;
}> {
  const resultData = {
    inventory: [] as any[],
    sales: [] as any[],
    outlets: [] as any[],
    dispatchLoads: [] as any[],
    cashSlips: [] as any[],
    dailyClosings: [] as any[],
    payments: [] as any[],
    users: [] as AppUserProfile[],
    routes: [] as any[],
    orderBookers: [] as any[],
    stockInward: [] as any[],
    stockMovements: [] as any[],
    settings: null as any
  };

  const counts: Record<string, number> = {
    inventory: 0,
    sales: 0,
    outlets: 0,
    dispatchLoads: 0,
    cashSlips: 0,
    dailyClosings: 0,
    payments: 0,
    users: 0,
    routes: 0,
    orderBookers: 0,
    stockInward: 0,
    stockMovements: 0,
    settings: 0
  };

  try {
    await ensureFirebaseAuth();

    const [inv, sales, outlets, loads, slips, closings, pays, users, routes, bookers, inwards, movs, settings] = await Promise.all([
      getCollectionFromFirestore<any>('inventory').catch(() => []),
      getCollectionFromFirestore<any>('sales').catch(() => []),
      getCollectionFromFirestore<any>('outlets').catch(() => []),
      getCollectionFromFirestore<any>('dispatchLoads').catch(() => []),
      getCollectionFromFirestore<any>('cashSlips').catch(() => []),
      getCollectionFromFirestore<any>('dailyClosings').catch(() => []),
      getCollectionFromFirestore<any>('payments').catch(() => []),
      getCollectionFromFirestore<AppUserProfile>('users').catch(() => []),
      getCollectionFromFirestore<any>('routes').catch(() => []),
      getCollectionFromFirestore<any>('orderBookers').catch(() => []),
      getCollectionFromFirestore<any>('stockInward').catch(() => []),
      getCollectionFromFirestore<any>('stockMovements').catch(() => []),
      getDocumentFromFirestore<any>('settings', 'system_settings').catch(() => null)
    ]);

    resultData.inventory = inv || [];
    resultData.sales = sales || [];
    resultData.outlets = outlets || [];
    resultData.dispatchLoads = loads || [];
    resultData.cashSlips = slips || [];
    resultData.dailyClosings = closings || [];
    resultData.payments = pays || [];
    resultData.users = users || [];
    resultData.routes = routes || [];
    resultData.orderBookers = bookers || [];
    resultData.stockInward = inwards || [];
    resultData.stockMovements = movs || [];
    resultData.settings = settings;

    counts.inventory = resultData.inventory.length;
    counts.sales = resultData.sales.length;
    counts.outlets = resultData.outlets.length;
    counts.dispatchLoads = resultData.dispatchLoads.length;
    counts.cashSlips = resultData.cashSlips.length;
    counts.dailyClosings = resultData.dailyClosings.length;
    counts.payments = resultData.payments.length;
    counts.users = resultData.users.length;
    counts.routes = resultData.routes.length;
    counts.orderBookers = resultData.orderBookers.length;
    counts.stockInward = resultData.stockInward.length;
    counts.stockMovements = resultData.stockMovements.length;
    counts.settings = resultData.settings ? 1 : 0;

    return {
      success: true,
      data: resultData,
      counts,
      message: 'Successfully pulled cloud data and user passwords from Firebase Firestore.'
    };
  } catch (error: any) {
    console.error('pullAllDataFromFirestore error:', error);
    return {
      success: false,
      data: resultData,
      counts,
      message: error?.message || 'Failed to pull cloud data from Firestore.'
    };
  }
}
