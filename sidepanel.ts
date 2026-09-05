import { groupFindings, summarise, verdict } from './src/rules.js';
import type { AuditResult, Finding, Severity } from './src/types.js';

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
const toastText = must<HTMLElement>('toast-text');
const statusPill = must<HTMLElement>('status-pill');
const expandAllBtn = must<HTMLButtonElement>('expand-all');

/** Which rule groups are open, kept across re-renders of the same page. */
const open = new Set<string>();
/** Severity filter; empty means show everything. */
let severityFilter: Severity | null = null;
let lastResult: AuditResult | null = null;

runBtn.addEventListener('click', () => void run());
expandAllBtn.addEventListener('click', () => {
  if (!lastResult) return;
  const groups = visibleGroups(lastResult);
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.rule));
  if (allOpen) open.clear();
  else for (const g of groups) open.add(g.rule);
  if (lastResult) render(lastResult);
});

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

function setRunBusy(busy: boolean): void {
  runBtn.disabled = busy;
  runBtn.classList.toggle('is-busy', busy);
  const label = runBtn.querySelector('.primary-label');
  if (label) label.textContent = busy ? 'Checking' : 'Check this page';
}

function showSkeleton(): void {
  listEl.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'skeleton';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skel';
    wrap.append(s);
  }
  listEl.append(wrap);
}

async function run(): Promise<void> {
  if (!(await ensureAccess())) {
    toast('Glasswing needs permission to read the page it is checking.');
    return;
  }

  setRunBusy(true);
  showSkeleton();
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUDIT_ACTIVE_TAB' });
    if (!response?.ok) {
      toast(response?.error ?? 'The check could not run.');
      await restore();
      return;
    }
    open.clear();
    severityFilter = null;
    render(response.result as AuditResult);
  } catch {
    toast('The check could not run.');
  } finally {
    setRunBusy(false);
  }
}

async function restore(): Promise<void> {
  const stored = await chrome.storage.local.get('glasswing.last');
  const result = stored['glasswing.last'] as AuditResult | undefined;
  if (result) {
    lastResult = result;
    render(result);
  } else {
    renderEmpty();
  }
}

function visibleGroups(result: AuditResult): ReturnType<typeof groupFindings> {
  const all = groupFindings(result.findings);
  if (!severityFilter) return all;
  return all.filter((g) => g.info.severity === severityFilter);
}

function render(result: AuditResult): void {
  lastResult = result;
  const summary = summarise(result.findings);
  const total = summary.serious + summary.moderate + summary.minor;
  verdictEl.textContent = verdict(summary);

  chipsEl.replaceChildren(
    ...(['serious', 'moderate', 'minor'] as const)
      .filter((severity) => summary[severity] > 0)
      .map((severity) => chip(summary[severity], severity))
  );

  scopeEl.textContent = `${result.checked} element${result.checked === 1 ? '' : 's'} checked on ${hostOf(result.url)}.`;
  summaryEl.hidden = false;

  statusPill.hidden = false;
  if (total === 0) {
    statusPill.textContent = 'No issues found';
    statusPill.className = 'status-pill clean';
  } else if (summary.serious > 0) {
    statusPill.textContent = `${summary.serious} serious`;
    statusPill.className = 'status-pill bad';
  } else {
    statusPill.textContent = `${total} to review`;
    statusPill.className = 'status-pill';
  }

  const groups = visibleGroups(result);
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.rule));
  expandAllBtn.hidden = groups.length === 0;
  expandAllBtn.textContent = allOpen ? 'Collapse' : 'Expand';

  listEl.replaceChildren();

  if (total === 0) {
    listEl.append(cleanEmpty(result));
    return;
  }

  if (!groups.length && severityFilter) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.append(
      art('🎉', false),
      title('Nothing at this severity'),
      body(`No ${severityFilter} findings on this page. Clear the filter to see the rest.`)
    );
    listEl.append(empty);
    return;
  }

  listEl.append(...groups.map(groupCard));
}

function renderEmpty(): void {
  summaryEl.hidden = true;
  statusPill.hidden = true;
  expandAllBtn.hidden = true;
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.append(
    art('🔍', false),
    title('See this page clearly'),
    body(
      'Run a check to find missing labels, weak contrast, and other barriers. Nothing leaves the browser.'
    )
  );
  listEl.replaceChildren(empty);
}

function art(emoji: string, clean: boolean): HTMLElement {
  const d = document.createElement('div');
  d.className = `empty-art${clean ? ' clean' : ''}`;
  d.textContent = emoji;
  d.setAttribute('aria-hidden', 'true');
  return d;
}

function title(text: string): HTMLElement {
  const s = document.createElement('strong');
  s.textContent = text;
  return s;
}

function body(text: string): HTMLElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function cleanEmpty(result: AuditResult): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.append(
    art('✅', true),
    title('Looking good'),
    body(
      `No barriers found across ${result.checked} elements on ${hostOf(result.url)}. Manual testing with a keyboard and screen reader still matters.`
    )
  );
  return empty;
}

function chip(count: number, severity: Severity): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `chip ${severity}`;
  const active = severityFilter === severity;
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('aria-label', `Filter to ${severity} findings, ${count}`);

  const b = document.createElement('b');
  b.textContent = String(count);
  btn.append(b, document.createTextNode(severity));
  if (active) {
    const x = document.createElement('span');
    x.className = 'chip-x';
    x.textContent = '×';
    x.setAttribute('aria-hidden', 'true');
    btn.append(x);
  }
  btn.addEventListener('click', () => {
    severityFilter = severityFilter === severity ? null : severity;
    if (lastResult) render(lastResult);
  });
  return btn;
}

function groupCard(group: ReturnType<typeof groupFindings>[number]): HTMLElement {
  const isOpen = open.has(group.rule);
  const card = document.createElement('section');
  card.className = `group${isOpen ? ' open' : ''}`;

  const head = document.createElement('button');
  head.className = 'group-head';
  head.type = 'button';
  head.setAttribute('aria-expanded', String(isOpen));

  const sev = document.createElement('span');
  sev.className = `sev ${group.info.severity}`;
  sev.textContent = group.info.severity;

  const titleEl = document.createElement('span');
  titleEl.className = 'group-title';
  titleEl.textContent = group.info.title;

  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = String(group.findings.length);

  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.textContent = '▾';
  chev.setAttribute('aria-hidden', 'true');

  head.append(sev, titleEl, count, chev);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'group-body';
  bodyEl.hidden = !isOpen;

  const why = document.createElement('p');
  why.className = 'why';
  why.textContent = group.info.why;
  bodyEl.append(why, ...group.findings.map(hitRow));

  head.addEventListener('click', () => {
    const nowOpen = Boolean(bodyEl.hidden);
    bodyEl.hidden = !nowOpen;
    head.setAttribute('aria-expanded', String(nowOpen));
    card.classList.toggle('open', nowOpen);
    if (nowOpen) open.add(group.rule);
    else open.delete(group.rule);
    if (lastResult) {
      const groups = visibleGroups(lastResult);
      const allOpen = groups.length > 0 && groups.every((g) => open.has(g.rule));
      expandAllBtn.textContent = allOpen ? 'Collapse' : 'Expand';
    }
  });

  card.append(head, bodyEl);
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

  const actions = document.createElement('div');
  actions.className = 'hit-actions';

  const copy = document.createElement('button');
  copy.className = 'copy-btn';
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', 'Copy selector to clipboard');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(finding.selector);
      toast('Selector copied.');
    } catch {
      toast('Could not copy.');
    }
  });

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

  actions.append(copy, show);
  row.append(main, actions);
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
  toastText.textContent = message;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}
