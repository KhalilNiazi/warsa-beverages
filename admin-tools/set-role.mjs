import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const key = JSON.parse(readFileSync(path.join(dir, 'serviceAccountKey.json'), 'utf8'));
initializeApp({ credential: cert(key) });

const [email, role] = process.argv.slice(2);
const VALID = ['SUPER_ADMIN','ADMIN','ASM','ORDER_BOOKER','SALESMAN','DRIVER','WAREHOUSE_MANAGER','ACCOUNTS','MANAGEMENT'];

if (!email || !VALID.includes(role)) {
  console.error('Usage: node admin-tools/set-role.mjs email@example.com SUPER_ADMIN');
  process.exit(1);
}

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role });
  console.log('Done. Role', role, 'set for', email);
  process.exit(0);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
}