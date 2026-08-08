/**
 * Build the three bundles the manifest references.
 *
 * The audit is bundled separately from the worker so the rule code ships once
 * and nothing from the worker's scope is serialised into a page.
 */
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
const common = { bundle: true, minify: true, target: 'chrome120', logLevel: 'warning' };

await Promise.all([
  build({
    ...common,
    entryPoints: ['background.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  }),
  build({ ...common, entryPoints: ['sidepanel.ts'], outfile: 'dist/sidepanel.js', format: 'esm' }),
  build({ ...common, entryPoints: ['audit-entry.ts'], outfile: 'dist/audit.js', format: 'iife' }),
]);

for (const f of fs.readdirSync('dist')) {
  console.log(`dist/${f}  ${(fs.statSync(`dist/${f}`).size / 1024).toFixed(1)} KB`);
}
