import { groupFindings, summarise, verdict } from './src/rules.js';
import type { AuditResult, Finding } from './src/types.js';

/**
 * The panel.
 *
 * Rendered from a stored result rather than held in memory, because the MV3
 * worker can be evicted between opening the panel and reading it.
 */

const runBtn = must<HTMLButtonElement>('run-btn');
const summaryEl = must<HTMLElement>('summary');
const verdictEl = must<HTMLElement>('verdict');
const chipsEl = must<HTMLElement>('chips');
const scopeEl = must<HTMLElement>('scope');
const listEl = must<HTMLElement>('list');
const toastEl = must<HTMLElement>('toast');

/** Which rule groups are open, kept across re-renders of the same page. */
const open = new Set<string>();

runBtn.addEventListener('click', () => void run());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUDIT_DONE') void restore();
});

void restore();

/**
 * Ask for page access, once, from the panel.
 *
 * activeTab is granted by a gesture on the extension itself, and a button
 * inside the side panel is not one of those gestures, so the audit would fail
 * on every page without this. The request has to be made from an extension
 * page during a real click, which is why it lives here and not in the worker.
 */
async function ensureAccess(): Promise<boolean> {
  const request = { origins: ['<all_urls>'] };
  if (await chrome.permissions.contains(request)) return true;
  try {
    return await chrome.permissions.request(request);
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  if (!(await ensureAccess())) {
    toast('Glasswing needs permission to read the page it is checking.');
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = 'Checking…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUDIT_ACTIVE_TAB' });
    if (!response?.ok) {
      toast(response?.error ?? 'The check could not run.');
      return;
    }
    open.clear();
    render(response.result as AuditResult);
  } catch {
    toast('The check could not run.');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Check this page';
  }
}

async function restore(): Promise<void> {
  const stored = await chrome.storage.local.get('glasswing.last');
  const result = stored['glasswing.last'] as AuditResult | undefined;
  if (result) render(result);
}

function render(result: AuditResult): void {
  const summary = summarise(result.findings);
  verdictEl.textContent = verdict(summary);

  chipsEl.replaceChildren(
    ...(['serious', 'moderate', 'minor'] as const)
      .filter((severity) => summary[severity] > 0)
      .map((severity) => chip(summary[severity], severity))
  );

  scopeEl.textContent = `${result.checked} element${result.checked === 1 ? '' : 's'} checked on ${hostOf(result.url)}.`;
  summaryEl.hidden = false;

  listEl.replaceChildren(...groupFindings(result.findings).map(groupCard));
}

function chip(count: number, severity: string): HTMLElement {
  const el = document.createElement('span');
  el.className = `chip ${severity}`;
  const b = document.createElement('b');
  b.textContent = String(count);
  el.append(b, document.createTextNode(severity));
  return el;
}

function groupCard(group: ReturnType<typeof groupFindings>[number]): HTMLElement {
  const card = document.createElement('section');
  card.className = 'group';

  const head = document.createElement('button');
  head.className = 'group-head';
  head.type = 'button';
  head.setAttribute('aria-expanded', String(open.has(group.rule)));

  const sev = document.createElement('span');
  sev.className = `sev ${group.info.severity}`;
  sev.textContent = group.info.severity;

  const title = document.createElement('span');
  title.className = 'group-title';
  title.textContent = group.info.title;

  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = String(group.findings.length);

  head.append(sev, title, count);

  const body = document.createElement('div');
  body.className = 'group-body';
  body.hidden = !open.has(group.rule);

  const why = document.createElement('p');
  why.className = 'why';
  why.textContent = group.info.why;
  body.append(why, ...group.findings.map(hitRow));

  head.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    head.setAttribute('aria-expanded', String(nowOpen));
    if (nowOpen) open.add(group.rule);
    else open.delete(group.rule);
  });

  card.append(head, body);
  return card;
}

function hitRow(finding: Finding): HTMLElement {
  const row = document.createElement('div');
  row.className = 'hit';

  const main = document.createElement('div');
  main.className = 'hit-main';

  const msg = document.createElement('div');
  msg.className = 'hit-msg';
  msg.textContent = finding.message;

  const where = document.createElement('div');
  where.className = 'hit-where';
  where.textContent = finding.snippet || finding.selector;
  where.title = finding.selector;

  main.append(msg, where);

  const show = document.createElement('button');
  show.className = 'show-btn';
  show.type = 'button';
  show.textContent = 'Show';
  show.setAttribute('aria-label', `Show this ${finding.rule} problem on the page`);
  show.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'HIGHLIGHT',
      selector: finding.selector,
    });
    if (!response?.ok) toast('That element is no longer on the page.');
  });

  row.append(main, show);
  return row;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

let toastTimer = 0;
function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}
