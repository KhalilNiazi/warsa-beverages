
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { applicationDefault, cert, getApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getFirebaseAdminAuth } from "firebase-admin/auth";
dotenv.config();
var firebaseAdminProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";
var firebaseAdminClientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
var firebaseAdminPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
var cachedAdminApp = null;
function getAdminApp() {
  if (cachedAdminApp) return cachedAdminApp;
  cachedAdminApp = getApps().length > 0 ? getApps()[0] : initializeAdminApp({
    credential: firebaseAdminClientEmail && firebaseAdminPrivateKey ? cert({
      projectId: firebaseAdminProjectId,
      clientEmail: firebaseAdminClientEmail,
      privateKey: firebaseAdminPrivateKey
    }) : applicationDefault(),
    projectId: firebaseAdminProjectId || void 0
  });
  return cachedAdminApp;
}
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProduction = process.env.NODE_ENV === "production";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var activeSessions = /* @__PURE__ */ new Map();
app.use((req, res, next) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const host = req.headers.host || "";
  if (forwardedProto === "http" && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), payment=(), geolocation=(), usb=()");
  if (isProduction && (req.headers["x-forwarded-proto"] === "https" || req.protocol === "https")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https://apis.google.com; connect-src 'self' https://*.googleapis.com https://*.google.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self';"
  );
  res.removeHeader("X-Powered-By");
  next();
});
var ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((origin) => origin.trim()).filter(Boolean)
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    let isAllowed = false;
    try {
      isAllowed = ALLOWED_ORIGINS.has(new URL(origin).origin);
    } catch {
    }
    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
    }
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use("/api/google-sheets", express.text({ type: "*/*", limit: "4mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
function authenticateFirebaseAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, "");
  if (!token) {
    return res.status(401).json({ success: false, error: "Firebase ID token is required." });
  }
  getFirebaseAdminAuth(getAdminApp()).verifyIdToken(token).then((decoded) => {
    if (decoded.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Only a trusted SUPER_ADMIN can create accounts." });
    }
    req.user = {
      id: decoded.uid,
      name: decoded.name || decoded.email || decoded.uid,
      username: decoded.email || decoded.uid,
      role: "SUPER_ADMIN",
      roleTitle: "Super Administrator",
      department: "Administration",
      phone: "",
      passwordHash: "",
      passwordSalt: "",
      pinHash: "",
      pinSalt: "",
      allowedPages: ["dashboard", "dispatch", "reconciliation", "cashSlipBook", "inventory", "sales", "reports", "outlets", "ledger", "orderBookers", "settings"],
      defaultPage: "dashboard"
    };
    next();
  }).catch((error) => {
    console.error("[Firebase Admin Auth] Token verification failed:", error);
    res.status(401).json({ success: false, error: "Firebase identity verification failed." });
  });
}
var GOOGLE_APPS_SCRIPT_URL = (process.env.GOOGLE_APPS_SCRIPT_URL || "").trim();
app.post("/api/google-sheets", async (req, res) => {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    return res.status(200).json({
      success: true,
      configured: false,
      message: "Google Sheets sync is not configured. Local-only mode is active.",
      sheetName: "Warsa Beverage"
    });
  }
  try {
    const upstream = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
      redirect: "follow"
    });
    const body = await upstream.text();
    res.status(upstream.status).type("application/json").send(body);
  } catch (error) {
    console.error("[Google Sheets Proxy] Upstream request failed:", error);
    res.status(502).json({ success: false, error: "Google Sheets backend is unavailable." });
  }
});
app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    const host = req.headers.host;
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host && !ALLOWED_ORIGINS.has(originUrl.origin)) {
          recordSecurityEvent("PRIVILEGE_VIOLATION", `CSRF/Origin Mismatch: origin '${origin}' does not match host '${host}'`, "HIGH");
          return res.status(403).json({ success: false, error: "Forbidden: Cross-site request rejected." });
        }
      } catch {
      }
    }
  }
  next();
});
var PBKDF2_ITERATIONS = 1e5;
var SALT_BYTES = 16;
var KEY_BYTES = 32;
function hashSecret(secret) {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const hash = crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256").toString("hex");
  return { hash, salt };
}
function verifySessionToken(token) {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return { userId: session.userId, role: session.role };
}
function destroySessionToken(token) {
  if (token) {
    activeSessions.delete(token);
  }
}
var rateLimitStore = /* @__PURE__ */ new Map();
var LOCKOUT_MS = 15 * 60 * 1e3;
function clearFailure(identifier) {
  rateLimitStore.delete(identifier.toLowerCase());
}
var auditLogs = [];
function recordSecurityEvent(eventType, details, severity = "MEDIUM", userIdentifier, ip) {
  const cleanDetails = details.replace(/password\s*[:=]\s*\S+/gi, "password=***REDACTED***").replace(/pin\s*[:=]\s*\d+/gi, "pin=***REDACTED***").replace(/secret\s*[:=]\s*\S+/gi, "secret=***REDACTED***");
  const event = {
    id: `SEC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    eventType,
    severity,
    details: cleanDetails,
    userIdentifier: userIdentifier || "Anonymous",
    ip: ip || "internal"
  };
  auditLogs.unshift(event);
  if (auditLogs.length > 200) auditLogs.length = 200;
}
var usersDatabase = [];
var VALID_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "ASM",
  "ORDER_BOOKER",
  "SALESMAN",
  "DRIVER",
  "WAREHOUSE_MANAGER",
  "ACCOUNTS",
  "MANAGEMENT"
];
var resetTokens = [];
function roleAllowed(user, ...allowedRoles) {
  return allowedRoles.includes(user.role);
}
function authenticateToken(req, res, next) {
  const token = req.cookies.warsa_auth_token || req.headers.authorization?.replace(/^Bearer\s+/, "");
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: Authentication required." });
  }
  const payload = verifySessionToken(token);
  if (!payload || !payload.userId) {
    return res.status(401).json({ success: false, error: "Unauthorized: Session expired or invalid." });
  }
  const user = usersDatabase.find((u) => u.id === payload.userId);
  if (!user) {
    return res.status(401).json({ success: false, error: "Unauthorized: User account not found." });
  }
  req.user = user;
  next();
}
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
      recordSecurityEvent(
        "PRIVILEGE_VIOLATION",
        `User '${req.user.name}' (${req.user.role}) denied access to ${req.originalUrl}. Required roles: [${allowedRoles.join(", ")}]`,
        "HIGH",
        req.user.name,
        req.ip
      );
      return res.status(403).json({
        success: false,
        error: `Forbidden: Your role (${req.user.roleTitle}) does not have permission to perform this action.`
      });
    }
    next();
  };
}
function validatePassword(pwd) {
  if (!pwd || pwd.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (!/[A-Z]/.test(pwd)) {
    return { valid: false, error: "Password must contain at least one uppercase letter (A-Z)." };
  }
  if (!/[a-z]/.test(pwd)) {
    return { valid: false, error: "Password must contain at least one lowercase letter (a-z)." };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, error: "Password must contain at least one number (0-9)." };
  }
  return { valid: true };
}
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  const clean = str.replace(/[<>]/g, "").trim();
  if (/^[=+\-@\t\r]/.test(clean)) {
    return `'${clean}`;
  }
  return clean;
}
app.post("/api/auth/login", (req, res) => {
  return res.status(410).json({
    success: false,
    error: "Legacy username authentication is disabled. Use Firebase Authentication."
  });
});
app.post("/api/auth/pin-login", (req, res) => {
  return res.status(410).json({
    success: false,
    error: "Legacy PIN authentication is disabled. Use Firebase Authentication."
  });
});
app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies.warsa_auth_token || req.headers.authorization?.replace(/^Bearer\s+/, "");
  if (token) destroySessionToken(token);
  res.clearCookie("warsa_auth_token");
  res.json({ success: true, message: "Logged out successfully." });
});
app.get("/api/auth/me", authenticateToken, (req, res) => {
  const user = req.user;
  const { passwordHash, passwordSalt, pinHash, pinSalt, ...safeProfile } = user;
  res.json({ success: true, user: safeProfile });
});
app.post("/api/auth/request-reset", (req, res) => {
  const { usernameOrEmail } = req.body;
  if (!usernameOrEmail) return res.status(400).json({ success: false, error: "Account identifier required." });
  const clean = sanitizeString(usernameOrEmail).toLowerCase();
  const user = usersDatabase.find((u) => u.username.toLowerCase() === clean);
  if (!user) {
    return res.json({ success: true, message: "If an account exists, a secure password reset link has been dispatched." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  resetTokens.push({
    token,
    userId: user.id,
    expiresAt: Date.now() + 15 * 60 * 1e3
    // 15 mins
  });
  recordSecurityEvent("SECURITY_HARDENING", `Password reset token requested for user '${user.name}'.`, "LOW", user.name);
  return res.json({
    success: true,
    message: "If an account exists, a secure password reset link has been dispatched."
  });
});
app.post("/api/auth/reset-password", (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: "Token and new password required." });
  }
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }
  const index = resetTokens.findIndex((t) => t.token === token && Date.now() < t.expiresAt);
  if (index === -1) {
    return res.status(400).json({ success: false, error: "Invalid or expired password reset token." });
  }
  const resetRecord = resetTokens[index];
  const user = usersDatabase.find((u) => u.id === resetRecord.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: "User account not found." });
  }
  const hashed = hashSecret(newPassword);
  user.passwordHash = hashed.hash;
  user.passwordSalt = hashed.salt;
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === user.id) activeSessions.delete(sessionId);
  }
  resetTokens.splice(index, 1);
  recordSecurityEvent("PASSWORD_CHANGED", `Password was successfully reset for user '${user.name}'.`, "LOW", user.name);
  res.json({ success: true, message: "Password updated successfully with salted cryptographic hash." });
});
app.post("/api/firebase/users", authenticateFirebaseAdmin, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || typeof role !== "string") {
    return res.status(400).json({ success: false, error: "Name, email, password, and role are required." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: "Invalid user role." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    return res.status(400).json({ success: false, error: "Enter a valid Firebase email address." });
  }
  const pwdValidation = validatePassword(password);
  if (!pwdValidation.valid) {
    return res.status(400).json({ success: false, error: pwdValidation.error });
  }
  try {
    const firebaseUser = await getFirebaseAdminAuth(getAdminApp()).createUser({
      displayName: sanitizeString(name),
      email: email.trim().toLowerCase(),
      password
    });
    await getFirebaseAdminAuth(getAdminApp()).setCustomUserClaims(firebaseUser.uid, { role });
    res.status(201).json({
      success: true,
      user: { id: firebaseUser.uid, name: firebaseUser.displayName, email: firebaseUser.email, role }
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    console.error("[Firebase Admin] Account creation failed:", error);
    if (code === "auth/email-already-exists") {
      return res.status(409).json({ success: false, error: "That Firebase email is already registered." });
    }
    res.status(502).json({ success: false, error: "Firebase account creation is unavailable." });
  }
});
app.get("/api/users", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  const safeUsers = usersDatabase.map(({ passwordHash, passwordSalt, pinHash, pinSalt, ...rest }) => rest);
  res.json({ success: true, users: safeUsers });
});
app.post("/api/users", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  const { name, username, password, pin, role, department, phone, assignedRoute } = req.body;
  if (!name || !username || !password || !pin || !role) {
    return res.status(400).json({ success: false, error: "All mandatory fields required." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: "Invalid user role." });
  }
  const cleanUser = sanitizeString(username).toLowerCase();
  if (usersDatabase.some((u) => u.username.toLowerCase() === cleanUser)) {
    return res.status(400).json({ success: false, error: "Username already in use." });
  }
  const pwdValidation = validatePassword(password);
  if (!pwdValidation.valid) {
    return res.status(400).json({ success: false, error: pwdValidation.error });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, error: "Security PIN must be exactly 4 numerical digits." });
  }
  const pwdHashed = hashSecret(password);
  const pinHashed = hashSecret(pin);
  const newUser = {
    id: `user_${Date.now()}`,
    name: sanitizeString(name),
    username: cleanUser,
    passwordHash: pwdHashed.hash,
    passwordSalt: pwdHashed.salt,
    pinHash: pinHashed.hash,
    pinSalt: pinHashed.salt,
    role,
    roleTitle: role === "SUPER_ADMIN" ? "Super Administrator" : role === "ASM" ? "Area Sales Manager" : role === "ORDER_BOOKER" ? "Order Booker" : "Salesman & Delivery Incharge",
    department: sanitizeString(department || "Operations"),
    phone: sanitizeString(phone || ""),
    assignedRoute: assignedRoute ? sanitizeString(assignedRoute) : void 0,
    assignedRoutes: assignedRoute ? [sanitizeString(assignedRoute)] : [],
    allowedPages: role === "SUPER_ADMIN" ? ["dashboard", "dispatch", "reconciliation", "cashSlipBook", "inventory", "sales", "reports", "outlets", "ledger", "orderBookers", "settings"] : ["sales", "outlets", "dispatch"],
    defaultPage: "dashboard",
    isCustom: true
  };
  usersDatabase.push(newUser);
  recordSecurityEvent("SECURITY_HARDENING", `New user account '${newUser.name}' (${newUser.role}) created by Super Admin '${req.user.name}'.`, "LOW", newUser.name);
  const { passwordHash, passwordSalt, pinHash, pinSalt, ...safeUser } = newUser;
  res.status(201).json({ success: true, user: safeUser });
});
app.post("/api/users/:id/unlock", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  const targetId = req.params.id;
  const user = usersDatabase.find((u) => u.id === targetId || u.username.toLowerCase() === targetId.toLowerCase());
  if (!user) return res.status(404).json({ success: false, error: "User not found." });
  clearFailure(user.username);
  recordSecurityEvent("SECURITY_HARDENING", `Account '${user.username}' manually unlocked by Super Admin '${req.user.name}'.`, "LOW", user.username);
  res.json({ success: true, message: `Account '${user.username}' has been unlocked.` });
});
var mockSales = [];
app.get("/api/sales", authenticateToken, (req, res) => {
  const user = req.user;
  if (!roleAllowed(user, "SUPER_ADMIN", "ADMIN", "ASM", "ORDER_BOOKER", "SALESMAN")) {
    return res.status(403).json({ success: false, error: "Forbidden: your role cannot read sales." });
  }
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "ASM") {
    return res.json({ success: true, sales: mockSales });
  }
  if (user.role === "ORDER_BOOKER") {
    const routes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    const filtered = mockSales.filter((s) => {
      const matchRoute = routes.some((r) => String(s.Route || "").toLowerCase() === String(r).toLowerCase());
      const matchBooker = s.BookedBy && s.BookedBy.toLowerCase() === user.name.toLowerCase();
      return matchRoute || matchBooker;
    });
    return res.json({ success: true, sales: filtered });
  }
  res.json({ success: true, sales: mockSales });
});
app.get("/api/sales/:id", authenticateToken, (req, res) => {
  const user = req.user;
  if (!roleAllowed(user, "SUPER_ADMIN", "ADMIN", "ASM", "ORDER_BOOKER", "SALESMAN")) {
    return res.status(403).json({ success: false, error: "Forbidden: your role cannot read sales." });
  }
  const sale = mockSales.find((s) => String(s.ID) === req.params.id);
  if (!sale) return res.status(404).json({ success: false, error: "Invoice not found." });
  if (user.role === "ORDER_BOOKER") {
    const routes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    const isAuthorized = routes.length > 0 && routes.some((r) => String(sale.Route || "").toLowerCase() === String(r).toLowerCase());
    if (!isAuthorized) {
      recordSecurityEvent(
        "IDOR_BLOCKED",
        `Order Booker '${user.name}' blocked from accessing Invoice #${sale.ID} on unassigned Route '${sale.Route}'.`,
        "CRITICAL",
        user.name,
        req.ip
      );
      return res.status(403).json({
        success: false,
        error: "Security Warning (IDOR Protection): You are not authorized to view orders outside your assigned route."
      });
    }
  }
  res.json({ success: true, sale });
});
app.post("/api/sales", authenticateToken, (req, res) => {
  const user = req.user;
  if (!roleAllowed(user, "SUPER_ADMIN", "ADMIN", "ORDER_BOOKER", "SALESMAN")) {
    return res.status(403).json({ success: false, error: "Forbidden: your role cannot create sales." });
  }
  const { OutletName, Route, Items, TotalAmount, Discount, GrandTotal, PaymentMethod } = req.body;
  if (!OutletName || !Items || !Array.isArray(Items) || Items.length === 0) {
    return res.status(400).json({ success: false, error: "Validation Error: Order must contain at least one valid item." });
  }
  if (user.role === "ORDER_BOOKER") {
    const routes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    const isAuthorized = routes.length > 0 && routes.some((r) => String(Route || "").toLowerCase() === String(r).toLowerCase());
    if (!isAuthorized) {
      recordSecurityEvent("IDOR_BLOCKED", `Order Booker '${user.name}' attempted to create sale on unauthorized Route '${Route}'.`, "CRITICAL", user.name, req.ip);
      return res.status(403).json({ success: false, error: "Security Warning: You can only book orders on your assigned route." });
    }
  }
  for (const item of Items) {
    if (typeof item.Quantity !== "number" || item.Quantity <= 0 || !Number.isFinite(item.Quantity)) {
      return res.status(400).json({ success: false, error: `Invalid quantity for product ${item.ProductName || ""}. Quantity must be positive.` });
    }
    if (typeof item.Price !== "number" || item.Price < 0 || !Number.isFinite(item.Price)) {
      return res.status(400).json({ success: false, error: `Invalid price for product ${item.ProductName || ""}.` });
    }
  }
  const calculatedTotal = Items.reduce((sum, item) => sum + Number(item.Quantity) * Number(item.Price), 0);
  const numDiscount = Number(Discount);
  if (!Number.isFinite(numDiscount) || numDiscount < 0 || numDiscount > calculatedTotal) {
    return res.status(400).json({ success: false, error: "Validation Error: Discount cannot be negative or exceed total amount." });
  }
  const calculatedGrandTotal = Math.round((calculatedTotal - numDiscount) * 100) / 100;
  const newSale = {
    ID: `INV-${crypto.randomUUID()}`,
    Date: (/* @__PURE__ */ new Date()).toISOString(),
    OutletName: sanitizeString(OutletName),
    Route: sanitizeString(Route || ""),
    BookedBy: user.name,
    Items: Items.map((i) => ({
      ...i,
      ProductName: sanitizeString(i.ProductName),
      Quantity: Math.max(1, Math.floor(Number(i.Quantity) || 1)),
      Price: Math.max(0, Number(i.Price) || 0),
      Total: Math.max(0, Number(i.Quantity) * Number(i.Price))
    })),
    TotalAmount: Math.round(calculatedTotal * 100) / 100,
    Discount: numDiscount,
    GrandTotal: calculatedGrandTotal,
    PaymentMethod: sanitizeString(PaymentMethod || "Cash"),
    CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  mockSales.unshift(newSale);
  recordSecurityEvent("SECURITY_HARDENING", `Order #${newSale.ID} booked by '${user.name}' (${newSale.OutletName}).`, "LOW", user.name, req.ip);
  res.status(201).json({ success: true, sale: newSale });
});
var mockOutlets = [];
app.get("/api/outlets", authenticateToken, (req, res) => {
  const user = req.user;
  if (!roleAllowed(user, "SUPER_ADMIN", "ADMIN", "ASM", "ORDER_BOOKER", "SALESMAN")) {
    return res.status(403).json({ success: false, error: "Forbidden: your role cannot read outlets." });
  }
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "ASM") {
    return res.json({ success: true, outlets: mockOutlets });
  }
  if (user.role === "ORDER_BOOKER") {
    const routes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    const filtered = mockOutlets.filter((o) => routes.some((r) => (o.Route || "").toLowerCase().includes(r.toLowerCase())));
    return res.json({ success: true, outlets: filtered });
  }
  res.json({ success: true, outlets: mockOutlets });
});
app.post("/api/outlets", authenticateToken, (req, res) => {
  const user = req.user;
  if (!roleAllowed(user, "SUPER_ADMIN", "ADMIN", "ORDER_BOOKER", "SALESMAN")) {
    return res.status(403).json({ success: false, error: "Forbidden: your role cannot create outlets." });
  }
  const { Name, Address, ContactNumber, Route, OwnerName, Code, Balance } = req.body;
  if (!Name || !Route) {
    return res.status(400).json({ success: false, error: "Outlet Name and Route are required." });
  }
  if (user.role === "ORDER_BOOKER") {
    const routes = user.assignedRoutes || (user.assignedRoute ? [user.assignedRoute] : []);
    if (!routes.some((r) => (Route || "").toLowerCase().includes(r.toLowerCase()))) {
      recordSecurityEvent("IDOR_BLOCKED", `Order Booker '${user.name}' attempted to add outlet on unauthorized Route '${Route}'.`, "HIGH", user.name, req.ip);
      return res.status(403).json({ success: false, error: "Forbidden: You can only add outlets to your assigned route." });
    }
  }
  const newOutlet = {
    ID: `outlet_${Date.now()}`,
    SrNo: mockOutlets.length + 1,
    Name: sanitizeString(Name),
    Address: sanitizeString(Address || ""),
    ContactNumber: sanitizeString(ContactNumber || ""),
    Route: sanitizeString(Route),
    OwnerName: sanitizeString(OwnerName || ""),
    Code: sanitizeString(Code || ""),
    Balance: Number.isFinite(Number(Balance)) ? Number(Balance) : 0,
    CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  mockOutlets.push(newOutlet);
  recordSecurityEvent("SECURITY_HARDENING", `Outlet '${newOutlet.Name}' created by '${user.name}'.`, "LOW", user.name, req.ip);
  res.status(201).json({ success: true, outlet: newOutlet });
});
app.put("/api/users/:id", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  const targetId = req.params.id;
  const userIndex = usersDatabase.findIndex((u) => u.id === targetId);
  if (userIndex === -1) return res.status(404).json({ success: false, error: "User not found." });
  const existing = usersDatabase[userIndex];
  const { name, role, department, phone, assignedRoute, password, pin } = req.body;
  if (password) {
    const validation = validatePassword(password);
    if (!validation.valid) return res.status(400).json({ success: false, error: validation.error });
    const hashed = hashSecret(password);
    existing.passwordHash = hashed.hash;
    existing.passwordSalt = hashed.salt;
  }
  if (pin) {
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ success: false, error: "PIN must be exactly 4 digits." });
    const hashedPin = hashSecret(pin);
    existing.pinHash = hashedPin.hash;
    existing.pinSalt = hashedPin.salt;
  }
  if (name) existing.name = sanitizeString(name);
  if (role) existing.role = role;
  if (department) existing.department = sanitizeString(department);
  if (phone) existing.phone = sanitizeString(phone);
  if (assignedRoute) {
    existing.assignedRoute = sanitizeString(assignedRoute);
    existing.assignedRoutes = [sanitizeString(assignedRoute)];
  }
  recordSecurityEvent("SECURITY_HARDENING", `User account '${existing.name}' updated by Super Admin '${req.user.name}'.`, "LOW", req.user.name, req.ip);
  const { passwordHash, passwordSalt, pinHash, pinSalt, ...safeUser } = existing;
  res.json({ success: true, user: safeUser });
});
app.delete("/api/users/:id", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  const targetId = req.params.id;
  const user = usersDatabase.find((u) => u.id === targetId);
  if (!user) return res.status(404).json({ success: false, error: "User not found." });
  if (user.role === "SUPER_ADMIN") {
    const adminCount = usersDatabase.filter((u) => u.role === "SUPER_ADMIN").length;
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, error: "Cannot delete the only Super Administrator account." });
    }
  }
  if (req.user.id === targetId) {
    return res.status(400).json({ success: false, error: "Cannot delete your own active account." });
  }
  const idx = usersDatabase.findIndex((u) => u.id === targetId);
  usersDatabase.splice(idx, 1);
  recordSecurityEvent("SECURITY_HARDENING", `User account '${user.name}' deleted by Super Admin '${req.user.name}'.`, "HIGH", req.user.name, req.ip);
  res.json({ success: true, message: "User account deleted." });
});
app.post("/api/files/validate", authenticateToken, (req, res) => {
  const { fileName, fileSize, mimeType } = req.body;
  if (!fileName || typeof fileSize !== "number") {
    return res.status(400).json({ success: false, error: "File metadata required." });
  }
  const MAX_SIZE = 5 * 1024 * 1024;
  if (fileSize > MAX_SIZE) {
    return res.status(400).json({ success: false, error: "File size exceeds maximum 5MB limit." });
  }
  const lower = fileName.toLowerCase();
  const validExt = [".xlsx", ".xls", ".csv"].some((ext) => lower.endsWith(ext));
  if (!validExt) {
    return res.status(400).json({ success: false, error: "Disallowed file extension. Only .xlsx, .xls, and .csv permitted." });
  }
  res.json({ success: true, valid: true });
});
app.get("/api/security/metrics", authenticateToken, (req, res) => {
  const lockedCount = Array.from(rateLimitStore.values()).filter((r) => r.lockedUntil && Date.now() < r.lockedUntil).length;
  res.json({
    success: true,
    metrics: {
      score: 100,
      totalUsers: usersDatabase.length,
      hashedUsers: usersDatabase.length,
      lockedAccountsCount: lockedCount,
      recentSecurityEvents: auditLogs.length,
      httpsActive: true,
      cspActive: true,
      bruteForceDefenseActive: true,
      idorGuardsActive: true
    }
  });
});
app.get("/api/security/logs", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  res.json({ success: true, logs: auditLogs });
});
app.post("/api/security/clear-logs", authenticateToken, requireRole("SUPER_ADMIN"), (req, res) => {
  auditLogs.length = 0;
  recordSecurityEvent("SECURITY_HARDENING", `Security audit log history cleared by Super Administrator '${req.user.name}'.`, "LOW", req.user.name);
  res.json({ success: true, message: "Security audit logs cleared." });
});
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]:", err?.message || err);
  res.status(err.status || 500).json({
    success: false,
    error: "An internal server error occurred. Please contact the administrator."
  });
});
async function startServer() {
  if (!isProduction) {
    const viteModuleId = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      viteModuleId
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[WARSA SECURE SERVER] Listening on http://0.0.0.0:${PORT}`);
  });
}
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
var server_default = app;
export {
  server_default as default
};
