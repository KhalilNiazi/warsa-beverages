// Thin Vercel entry point. The real Express app is bundled in ./_server.js.
// If that bundle crashes while loading, the exact reason is returned as JSON
// (and shown in the app's sync window) instead of Vercel's generic error page.
export default async function handler(req, res) {
  const url = String(req.url || '');

  // Safe diagnostics: booleans only, no secret values.
  if (url.startsWith('/api/health')) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      node: process.version,
      hasGoogleAppsScriptUrl: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
      hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
      hasFirebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
      allowedOriginsSet: Boolean(process.env.ALLOWED_ORIGINS)
    }));
  }

  try {
    const mod = await import('./_server.js');
    return mod.default(req, res);
  } catch (err) {
    console.error('[api] Server failed:', err);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      res.end(JSON.stringify({
        success: false,
        error: 'Server function failed: ' + (err && err.message ? err.message : String(err))
      }));
    }
  }
}