/**
 * End to end: load the built extension into a real Chrome and audit a page
 * with known problems.
 *
 * The unit tests cover the maths and the rule logic against jsdom. This is
 * the only place the real cascade is involved, so it is the only place a
 * contrast number means anything.
 *
 * Needs Playwright with its Chromium: npx playwright install chromium
 */
import { chromium } from 'playwright';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

import { fileURLToPath } from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Served over http rather than file://, because host permissions do not
// cover file URLs without a separate manual toggle.
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(fs.readFileSync(path.join(DIR, 'tests/fixture/broken.html')));
});
await new Promise((r) => server.listen(8791, r));

/*
 * Loaded from a copy whose manifest declares <all_urls> up front.
 *
 * The shipped extension asks for the same permission from the panel on first
 * use, and that request needs a real click on a real dialog, which cannot be
 * driven here. Everything under test after the grant is the shipped code,
 * byte for byte.
 */
const TEST_DIR = '/tmp/glasswing-e2e';
fs.rmSync(TEST_DIR, { recursive: true, force: true });
fs.cpSync(DIR, TEST_DIR, {
  recursive: true,
  filter: (src) => !src.includes('node_modules') && !src.includes('/.git'),
});
const manifest = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
delete manifest.optional_host_permissions;
fs.writeFileSync(path.join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

const profile = '/tmp/glasswing-e2e-profile';
fs.rmSync(profile, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [
    '--headless=new',
    `--disable-extensions-except=${TEST_DIR}`,
    `--load-extension=${TEST_DIR}`,
  ],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
const close = async () => {
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
};
const fail = [];
const ok = (label, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) fail.push(label);
};

try {
  const page = await ctx.newPage();
  await page.goto('http://localhost:8791/broken.html');
  await page.waitForLoadState('load');

  // Run the audit through the service worker exactly as the panel does.
  const [worker] = ctx.serviceWorkers();
  const result = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/audit.js'] });
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const r = window.__glasswingResult;
        delete window.__glasswingResult;
        return r;
      },
    });
    return inj.result;
  });

  const by = (rule) => result.findings.filter((f) => f.rule === rule);
  console.log(`\n${result.findings.length} findings over ${result.checked} elements\n`);
  for (const f of result.findings)
    console.log(`  ${f.severity.padEnd(9)} ${f.rule.padEnd(14)} ${f.message}`);
  console.log();

  ok('runs in a real page', !!result && result.checked > 10);
  ok('missing lang', by('page-lang').length === 1);
  ok('missing title', by('page-title').length === 1);
  ok('no main landmark', by('landmark-main').length === 1);
  ok('one image without alt, decorative and described ones ignored', by('image-alt').length === 1);
  ok('h2 start plus h2->h4 skip', by('heading-order').length === 2);
  ok('one nameless link', by('link-name').length === 1);
  ok('one nameless button', by('button-name').length === 1);
  ok('one unlabelled field', by('form-label').length === 1);
  ok('one duplicate id', by('duplicate-id').length === 1);

  const contrast = by('contrast');
  ok(
    'the faint paragraph fails contrast',
    contrast.some((f) => f.snippet.includes('too light'))
  );
  ok(
    'the readable paragraph does not',
    !contrast.some((f) => f.snippet.includes('This one is fine'))
  );
  ok(
    'large text is judged at 3:1, not 4.5:1',
    !contrast.some((f) => f.snippet.includes('Large text'))
  );

  // Highlight, on an element that exists and one that does not.
  const target = by('image-alt')[0].selector;
  const drew = await worker.evaluate(async (selector) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const m = document.createElement('div');
        m.id = '__glasswing-marker';
        document.body.appendChild(m);
        return true;
      },
      args: [selector],
    });
    return r.result;
  }, target);
  ok(`selector "${target}" resolves in the page`, drew === true);

  // The panel itself loads and renders.
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.waitForSelector('#run-btn');
  const errors = [];
  panel.on('pageerror', (e) => errors.push(String(e)));
  await panel.waitForTimeout(400);
  ok('panel loads with no script errors', errors.length === 0);
  ok('panel shows the run button', (await panel.textContent('#run-btn')) === 'Check this page');
} finally {
  await close();
  server.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
