// Bundles server.ts (and all its dependencies) into api/_server.js for Vercel.
// Run:  npm run build:api   and commit the result.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  mainFields: ['module', 'main'],
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  outfile: 'api/_server.js',
  logLevel: 'info',
});
