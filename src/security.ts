/**
 * WARSA KFM Beverages - Enterprise Application Security Suite
 * Hardened Authentication, Cryptographic Hashing, RBAC, IDOR Defense,
 * Input Sanitization, Anti-Injection, Brute-Force Rate Limiting & Audit Logging.
 */

import { AppUserProfile, AppPageId, SaleRecord, Outlet, UserRole } from './types';

// =========================================================================
// 1. CRYPTOGRAPHIC HASHING (PBKDF2-HMAC-SHA256 with 100,000 Iterations)
// =========================================================================

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTE_LENGTH = 16;
const KEY_BIT_LENGTH = 256;

/**
 * Converts ArrayBuffer to Hex string safely
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts Hex string to Uint8Array safely
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a PBKDF2-SHA256 key from a plain string and salt
 */
async function deriveKey(plain: string, saltBytes: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(plain),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    KEY_BIT_LENGTH
  );

  return bufferToHex(derivedBits);
}

/**
 * Hashes a password using PBKDF2-HMAC-SHA256 with a unique random 128-bit salt.
 * Never stores plain text.
 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(saltBytes);
  const salt = bufferToHex(saltBytes.buffer);
  const hash = await deriveKey(password, saltBytes);
  return { hash, salt };
}

/**
 * Verifies a password against a stored PBKDF2-SHA256 hash and salt.
 * Constant-time byte comparison prevents timing attacks.
 */
export async function verifyPassword(
  attempt: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  if (!attempt || !storedHash || !storedSalt) return false;
  try {
    const saltBytes = hexToBuffer(storedSalt);
    const calculatedHash = await deriveKey(attempt, saltBytes);
    return timingSafeEqual(calculatedHash, storedHash);
  } catch (err) {
    console.error('Password verification cryptographic error:', err);
    return false;
  }
}

/**
 * Hashes a 4-digit security PIN using PBKDF2-HMAC-SHA256
 */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  return await hashPassword(pin.trim());
}

/**
 * Verifies a 4-digit PIN against stored hash and salt
 */
export async function verifyPin(
  attempt: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  return await verifyPassword(attempt.trim(), storedHash, storedSalt);
}

/**
 * Constant-time string equality check to mitigate timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// =========================================================================
// 2. STRONG PASSWORD POLICY ENFORCEMENT
// =========================================================================

export interface PasswordPolicyResult {
  valid: boolean;
  score: number; // 0 to 100
  level: 'WEAK' | 'FAIR' | 'GOOD' | 'STRONG';
  feedback: string[];
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { valid: false, score: 0, level: 'WEAK', feedback: ['Password cannot be empty.'] };
  }

  // Length check
  if (password.length >= 8) {
    score += 25;
  } else {
    feedback.push('Must be at least 8 characters long.');
  }

  if (password.length >= 12) {
    score += 15;
  }

  // Uppercase letter
  if (/[A-Z]/.test(password)) {
    score += 20;
  } else {
    feedback.push('Must include at least one uppercase letter (A-Z).');
  }

  // Lowercase letter
  if (/[a-z]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Must include at least one lowercase letter (a-z).');
  }

  // Number
  if (/[0-9]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Must include at least one number (0-9).');
  }

  // Special character
  if (/[^A-Za-z0-9]/.test(password)) {
    score += 10;
  } else {
    feedback.push('Must include at least one special character (!@#$%^&*).');
  }

  const valid = feedback.length === 0;
  let level: 'WEAK' | 'FAIR' | 'GOOD' | 'STRONG' = 'WEAK';
  if (score >= 80) level = 'STRONG';
  else if (score >= 60) level = 'GOOD';
  else if (score >= 40) level = 'FAIR';

  return { valid, score: Math.min(score, 100), level, feedback };
}

// =========================================================================
// 3. BRUTE-FORCE RATE LIMITING & LOCKOUT ENGINE
// =========================================================================

interface FailedAttemptRecord {
  count: number;
  lastAttemptAt: number;
  lockedUntil: number | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const RATE_LIMIT_STORAGE_KEY = 'warsa_security_rate_limits';

function getRateLimitStore(): Record<string, FailedAttemptRecord> {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRateLimitStore(store: Record<string, FailedAttemptRecord>): void {
  try {
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

/**
 * Checks if an account or identifier is currently locked out
 */
export function checkAccountLockout(identifier: string): {
  isLocked: boolean;
  remainingLockoutMs: number;
  failedCount: number;
} {
  const store = getRateLimitStore();
  const record = store[identifier.toLowerCase()];
  if (!record) {
    return { isLocked: false, remainingLockoutMs: 0, failedCount: 0 };
  }

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      isLocked: true,
      remainingLockoutMs: record.lockedUntil - now,
      failedCount: record.count
    };
  }

  // Auto-reset if lockout period expired
  if (record.lockedUntil && now >= record.lockedUntil) {
    delete store[identifier.toLowerCase()];
    saveRateLimitStore(store);
    return { isLocked: false, remainingLockoutMs: 0, failedCount: 0 };
  }

  return { isLocked: false, remainingLockoutMs: 0, failedCount: record.count };
}

/**
 * Returns all currently locked account identifiers and lockout details
 */
export function getLockedAccounts(): Array<{ identifier: string; remainingMs: number; failedCount: number }> {
  const store = getRateLimitStore();
  const now = Date.now();
  const locked: Array<{ identifier: string; remainingMs: number; failedCount: number }> = [];
  for (const [id, rec] of Object.entries(store)) {
    if (rec.lockedUntil && now < rec.lockedUntil) {
      locked.push({
        identifier: id,
        remainingMs: rec.lockedUntil - now,
        failedCount: rec.count
      });
    }
  }
  return locked;
}

/**
 * Records a failed login attempt and locks account if threshold exceeded
 */
export function recordFailedLoginAttempt(identifier: string): {
  locked: boolean;
  remainingAttempts: number;
  lockoutRemainingMs: number;
} {
  const store = getRateLimitStore();
  const id = identifier.toLowerCase();
  const now = Date.now();
  const record = store[id] || { count: 0, lastAttemptAt: now, lockedUntil: null };

  record.count += 1;
  record.lastAttemptAt = now;

  let locked = false;
  let lockoutRemainingMs = 0;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    locked = true;
    lockoutRemainingMs = LOCKOUT_DURATION_MS;
    logSecurityEvent(
      'ACCOUNT_LOCKED',
      `Account '${identifier}' locked for 15 minutes due to ${record.count} consecutive failed login attempts.`,
      'HIGH',
      identifier
    );
  } else {
    logSecurityEvent(
      'FAILED_LOGIN',
      `Failed authentication attempt #${record.count} for '${identifier}'.`,
      'MEDIUM',
      identifier
    );
  }

  store[id] = record;
  saveRateLimitStore(store);

  return {
    locked,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.count),
    lockoutRemainingMs
  };
}

/**
 * Resets failed attempts after a successful login
 */
export function clearFailedAttempts(identifier: string): void {
  const store = getRateLimitStore();
  delete store[identifier.toLowerCase()];
  saveRateLimitStore(store);
}

// =========================================================================
// 4. INPUT SANITIZATION & INJECTION DEFENSE (XSS, SQLi & Formula Injection)
// =========================================================================

/**
 * Strips dangerous HTML tags, javascript: URIs and onerror/onload handlers (XSS protection)
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // remove direct angle brackets
    .replace(/javascript:/gi, '') // strip pseudo protocols
    .replace(/on\w+\s*=/gi, '') // strip event handler attributes
    .trim();
}

/**
 * Prevents Spreadsheet Formula Injection (CSV/Formula Injection).
 * Prepend a single quote if string begins with =, +, -, @, \t, or \r.
 */
export function sanitizeFormulaInjection(val: any): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return val;
}

/**
 * Validates and sanitizes email input
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validates phone number format
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  return /^[0-9+\-\s()]{7,20}$/.test(phone.trim());
}

// =========================================================================
// 5. AUTHORIZATION & IDOR / BOLA PREVENTION ENGINE
// =========================================================================

/**
 * Asserts that a user has permission to view or execute actions on a given module.
 * Throws a SecurityError if unauthorized to prevent UI-tampering or URL manipulation.
 */
export function assertUserAuthorizedForPage(user: AppUserProfile | null, pageId: AppPageId): void {
  if (!user) {
    throw new SecurityException('UNAUTHENTICATED', 'Authentication required to access this system module.');
  }

  // Super Admin has universal access
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;

  if (!user.allowedPages || !user.allowedPages.includes(pageId)) {
    logSecurityEvent(
      'PRIVILEGE_VIOLATION',
      `User '${user.name}' (${user.role}) attempted unauthorized access to page: '${pageId}'.`,
      'HIGH',
      user.name
    );
    throw new SecurityException(
      'FORBIDDEN',
      `Access denied: Your assigned role (${user.roleTitle}) does not have permission to view '${pageId}'.`
    );
  }
}

/**
 * IDOR Defense: Asserts that an Order Booker only accesses/modifies orders on their assigned route.
 */
export function assertInvoiceOwnership(user: AppUserProfile | null, invoice: SaleRecord): void {
  if (!user) {
    throw new SecurityException('UNAUTHENTICATED', 'Authentication required.');
  }

  // Admins & Managers have complete route oversight
  if (['SUPER_ADMIN', 'ADMIN', 'ASM', 'ACCOUNTS', 'MANAGEMENT'].includes(user.role)) {
    return;
  }

  // Order Bookers can strictly touch invoices in their assigned routes
  if (user.role === 'ORDER_BOOKER') {
    const userRoutes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    const invoiceRoute = invoice.Route;

    if (userRoutes.length > 0 && invoiceRoute) {
      const isAuthorized = userRoutes.some(r => 
        invoiceRoute.toLowerCase().includes(r.toLowerCase()) || 
        r.toLowerCase().includes(invoiceRoute.toLowerCase())
      );

      if (!isAuthorized) {
        logSecurityEvent(
          'IDOR_BLOCKED',
          `Order Booker '${user.name}' attempted to access/modify Invoice #${invoice.ID} on unassigned Route: '${invoiceRoute}'.`,
          'CRITICAL',
          user.name
        );
        throw new SecurityException(
          'IDOR_VIOLATION',
          `Security Notice (IDOR Defense): You are only authorized to manage orders for your assigned routes (${userRoutes.join(', ')}).`
        );
      }
    }
  }
}

/**
 * IDOR Defense: Asserts that an Order Booker only accesses customer outlets on their route.
 */
export function assertOutletOwnership(user: AppUserProfile | null, outlet: Outlet): void {
  if (!user) {
    throw new SecurityException('UNAUTHENTICATED', 'Authentication required.');
  }

  if (['SUPER_ADMIN', 'ADMIN', 'ASM', 'ACCOUNTS', 'MANAGEMENT'].includes(user.role)) {
    return;
  }

  if (user.role === 'ORDER_BOOKER') {
    const userRoutes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    if (userRoutes.length > 0 && outlet.Route) {
      const isAuthorized = userRoutes.some(r => 
        outlet.Route.toLowerCase().includes(r.toLowerCase()) || 
        r.toLowerCase().includes(outlet.Route.toLowerCase())
      );

      if (!isAuthorized) {
        logSecurityEvent(
          'IDOR_BLOCKED',
          `Order Booker '${user.name}' attempted unauthorized modification of Shop: '${outlet.Name}' on unassigned Route '${outlet.Route}'.`,
          'CRITICAL',
          user.name
        );
        throw new SecurityException(
          'IDOR_VIOLATION',
          `Security Notice: You can only edit outlets located in your assigned delivery routes.`
        );
      }
    }
  }
}

export class SecurityException extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecurityException';
    this.code = code;
  }
}

// =========================================================================
// 6. MULTI-FACTOR AUTHENTICATION (MFA / 2FA - RFC 6238 TOTP ENGINE)
// =========================================================================

/**
 * Generates a random Base32 TOTP secret key for Two-Factor Authentication
 */
export function generateTwoFactorSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < randomBytes.length; i++) {
    secret += chars[randomBytes[i] % chars.length];
  }
  return secret;
}

/**
 * Verifies a 6-digit Time-based OTP code against a TOTP secret
 */
export async function verifyTwoFactorCode(code: string, secret: string): Promise<boolean> {
  if (!code || !secret) return false;
  const cleanCode = code.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) return false;

  // Check current time step and +/- 1 window (tolerance for clock drift)
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let step = currentStep - 1; step <= currentStep + 1; step++) {
    const validCode = await generateTOTPCode(secret, step);
    if (validCode === cleanCode) {
      return true;
    }
  }
  return false;
}

/**
 * Pure Web-Crypto TOTP code calculator (RFC 6238)
 */
async function generateTOTPCode(secret: string, timeStep: number): Promise<string> {
  const keyBytes = base32ToUint8Array(secret);
  const timeBytes = new Uint8Array(8);
  let temp = timeStep;
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = temp & 0xff;
    temp = temp >> 8;
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBytes);
  const signatureBytes = new Uint8Array(signature);

  const offset = signatureBytes[signatureBytes.length - 1] & 0x0f;
  const binary =
    ((signatureBytes[offset] & 0x7f) << 24) |
    ((signatureBytes[offset + 1] & 0xff) << 16) |
    ((signatureBytes[offset + 2] & 0xff) << 8) |
    (signatureBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

function base32ToUint8Array(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase());
    if (val !== -1) {
      bits += val.toString(2).padStart(5, '0');
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return bytes;
}

// =========================================================================
// 7. SECURITY AUDIT LOGGING (Zero Secrets Leaked)
// =========================================================================

export interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: 'FAILED_LOGIN' | 'ACCOUNT_LOCKED' | 'PRIVILEGE_VIOLATION' | 'IDOR_BLOCKED' | 'PASSWORD_CHANGED' | 'PIN_RESET' | 'MFA_CHALLENGE' | 'SECURITY_HARDENING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string;
  userIdentifier?: string;
  userAgent?: string;
}

const SECURITY_LOGS_KEY = 'warsa_security_audit_logs_v1';
const MAX_STORED_LOGS = 100;

export function logSecurityEvent(
  eventType: SecurityEvent['eventType'],
  details: string,
  severity: SecurityEvent['severity'] = 'MEDIUM',
  userIdentifier?: string
): void {
  try {
    const raw = localStorage.getItem(SECURITY_LOGS_KEY);
    const logs: SecurityEvent[] = raw ? JSON.parse(raw) : [];

    // Filter out passwords, tokens, or PINs from log text
    const cleanDetails = details
      .replace(/password\s*[:=]\s*\S+/gi, 'password=***REDACTED***')
      .replace(/pin\s*[:=]\s*\d+/gi, 'pin=***REDACTED***')
      .replace(/secret\s*[:=]\s*\S+/gi, 'secret=***REDACTED***');

    const newLog: SecurityEvent = {
      id: 'SEC-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      eventType,
      severity,
      details: cleanDetails,
      userIdentifier: userIdentifier || 'Anonymous',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 80) : 'Server'
    };

    logs.unshift(newLog);
    if (logs.length > MAX_STORED_LOGS) {
      logs.length = MAX_STORED_LOGS;
    }

    localStorage.setItem(SECURITY_LOGS_KEY, JSON.stringify(logs));
  } catch (err) {
    console.warn('Could not record security event:', err);
  }
}

export function fetchSecurityAuditLogs(): SecurityEvent[] {
  try {
    const raw = localStorage.getItem(SECURITY_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearSecurityLogs(): void {
  localStorage.removeItem(SECURITY_LOGS_KEY);
  logSecurityEvent('SECURITY_HARDENING', 'Security audit logs were cleared by Super Administrator.', 'LOW');
}
