/**
 * Firestore is NOT used any more.
 *
 * - Firebase is used for AUTHENTICATION only (email + password login, role claims).
 * - ALL business data and staff profiles live in the Google Sheet through the Apps Script backend.
 *
 * This file keeps the old export names so the rest of the app compiles, but nothing here
 * talks to Firestore. Staff profiles are read from the Sheet's "AppUsers" tab.
 */
import { getFirebaseIdToken } from './firebase';
import { AppUserProfile } from '@/src/types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

async function callSheet(action: string, data?: unknown): Promise<any> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) return { success: false, error: 'Not signed in.' };
  const res = await fetch('/api/google-sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data, idToken }),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: `Unreadable response (HTTP ${res.status}).` };
  }
}

/** Staff profiles come from the Google Sheet (AppUsers tab). */
export async function fetchUsersFromFirestore(): Promise<AppUserProfile[]> {
  try {
    const res = await callSheet('getUsers');
    return res && res.success && Array.isArray(res.data) ? (res.data as AppUserProfile[]) : [];
  } catch (error) {
    console.warn('[Sheet] Notice fetching users:', error);
    return [];
  }
}

// ---- Everything below is intentionally a no-op (no Firestore) ----

export async function saveUserToFirestore(_user: AppUserProfile): Promise<void> {}

export function subscribeToFirestoreUsers(_onUsersUpdate: (users: AppUserProfile[]) => void): (() => void) | null {
  return null;
}

export async function syncMutationToFirestore(_action: string, _payload: any): Promise<void> {}

export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; databaseId: string; projectId: string }> {
  return { success: true, message: 'Firestore is not used. Data is stored in Google Sheets.', databaseId: '', projectId: '' };
}

export async function pushAllDataToFirestore(_datasets: any): Promise<{ success: boolean; counts: Record<string, number>; message: string }> {
  return { success: true, counts: {}, message: 'Firestore is not used. Data is stored in Google Sheets.' };
}

export async function pullAllDataFromFirestore(): Promise<{
  success: boolean;
  data: any;
  counts: Record<string, number>;
  message: string;
}> {
  return {
    success: true,
    data: {
      inventory: [], sales: [], outlets: [], dispatchLoads: [], cashSlips: [], dailyClosings: [],
      payments: [], users: [], routes: [], orderBookers: [], stockInward: [], stockMovements: [],
    },
    counts: {},
    message: 'Firestore is not used. Data is stored in Google Sheets.',
  };
}